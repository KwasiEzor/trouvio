import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { rateLimits } from "../../../db/schema";
import { createPgRateLimitStore } from "./rate-limit-store";

let t: TestDatabase;

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await resetData(t.db);
});

const NOW = new Date("2026-10-13T08:00:00.000Z");
const RULE = { windowSeconds: 60, max: 2 };
const key = (c: string) => c.repeat(64);
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("createPgRateLimitStore", () => {
  it("accepte le premier appel et ouvre la fenêtre", async () => {
    const store = createPgRateLimitStore(t.db);
    expect(await store.consume([{ key: key("a"), rule: RULE }], NOW)).toEqual([
      { allowed: true, retryAfterSeconds: null },
    ]);
    const rows = await t.db.select().from(rateLimits);
    expect(rows).toEqual([{ key: key("a"), count: 1, expiresAt: later(60) }]);
  });

  it("refuse au-delà du seuil, avec le délai restant de la fenêtre", async () => {
    const store = createPgRateLimitStore(t.db);
    const entry = [{ key: key("a"), rule: RULE }];
    await store.consume(entry, NOW);
    await store.consume(entry, later(10));
    expect(await store.consume(entry, later(15))).toEqual([
      { allowed: false, retryAfterSeconds: 45 },
    ]);
  });

  it("rouvre une fenêtre neuve à son expiration", async () => {
    const store = createPgRateLimitStore(t.db);
    const entry = [{ key: key("a"), rule: RULE }];
    for (let i = 0; i < 3; i++) await store.consume(entry, NOW);
    expect(await store.consume(entry, later(60))).toEqual([
      { allowed: true, retryAfterSeconds: null },
    ]);
  });

  it("n'accepte que le seuil parmi des appels simultanés", async () => {
    const store = createPgRateLimitStore(t.db);
    const entry = [{ key: key("a"), rule: { windowSeconds: 60, max: 5 } }];
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.consume(entry, NOW)),
    );
    expect(results.filter(([result]) => result?.allowed)).toHaveLength(5);
  });

  it("rend un résultat par entrée, dans l'ordre", async () => {
    const store = createPgRateLimitStore(t.db);
    const tight = { windowSeconds: 3600, max: 0 };
    expect(
      await store.consume(
        [
          { key: key("b"), rule: RULE },
          { key: key("a"), rule: tight },
        ],
        NOW,
      ),
    ).toEqual([
      { allowed: true, retryAfterSeconds: null },
      { allowed: false, retryAfterSeconds: 3600 },
    ]);
  });

  it("refuse en base une clé qui n'est pas une empreinte (IP ou email en clair)", async () => {
    const store = createPgRateLimitStore(t.db);
    await expect(
      store.consume([{ key: "203.0.113.7|/sign-in/email", rule: RULE }], NOW),
    ).rejects.toMatchObject({
      cause: { constraint: "rate_limits_key_check" },
    });
  });

  it("ne purge que les compteurs expirés, par lot borné", async () => {
    const store = createPgRateLimitStore(t.db);
    await store.consume([{ key: key("a"), rule: RULE }], NOW);
    await store.consume([{ key: key("b"), rule: RULE }], NOW);
    await store.consume(
      [{ key: key("c"), rule: { windowSeconds: 3600, max: 2 } }],
      NOW,
    );
    expect(await store.purgeExpired(later(61), 1)).toBe(1);
    expect(await store.purgeExpired(later(61), 10)).toBe(1);
    const left = await t.db.select({ key: rateLimits.key }).from(rateLimits);
    expect(left).toEqual([{ key: key("c") }]);
  });
});
