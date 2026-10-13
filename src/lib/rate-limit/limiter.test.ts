import { describe, expect, it, vi } from "vitest";

import { fakeLogger, everythingLogged } from "@/test/db/fake-logger";

import { deriveRateLimitSecret, rateLimitKey } from "./keys";
import { createRateLimiter } from "./limiter";
import type { RateLimitEntry, RateLimitStore } from "./types";

const SECRET = deriveRateLimitSecret("s".repeat(32));
const NOW = new Date("2026-10-13T08:00:00Z");
const SHORT = { windowSeconds: 60, max: 2 };
const LONG = { windowSeconds: 3600, max: 5 };

/** Magasin en mémoire, fenêtre fixe, à la manière du magasin Postgres. */
function memoryStore() {
  const rows = new Map<string, { count: number; expiresAt: number }>();
  const store = {
    rows,
    consume: vi.fn((entries: readonly RateLimitEntry[], now: Date) =>
      Promise.resolve(
        entries.map(({ key, rule }) => {
          const row = rows.get(key);
          const fresh = row === undefined || row.expiresAt <= now.getTime();
          const next = fresh
            ? { count: 1, expiresAt: now.getTime() + rule.windowSeconds * 1000 }
            : { count: row.count + 1, expiresAt: row.expiresAt };
          rows.set(key, next);
          const allowed = next.count <= rule.max;
          return {
            allowed,
            retryAfterSeconds: allowed
              ? null
              : Math.ceil((next.expiresAt - now.getTime()) / 1000),
          };
        }),
      ),
    ),
    purgeExpired: vi.fn(() => Promise.resolve(0)),
  } satisfies RateLimitStore & { rows: unknown };
  return store;
}

function setup(
  overrides: { purgeEvery?: number; store?: RateLimitStore } = {},
) {
  const store = memoryStore();
  const log = fakeLogger();
  let now = NOW;
  const limiter = createRateLimiter({
    store: overrides.store ?? store,
    secret: SECRET,
    log,
    now: () => now,
    purgeEvery: overrides.purgeEvery ?? 100,
  });
  return {
    store,
    log,
    limiter,
    advance: (seconds: number) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}

describe("createRateLimiter", () => {
  it("accepte sous le seuil", async () => {
    const { limiter } = setup();
    expect(await limiter.consume("auth-ip", "x", [SHORT])).toEqual({
      allowed: true,
      retryAfterSeconds: null,
    });
  });

  it("refuse au-delà du seuil, avec le délai restant", async () => {
    const { limiter, advance } = setup();
    await limiter.consume("auth-ip", "x", [SHORT]);
    await limiter.consume("auth-ip", "x", [SHORT]);
    advance(15);
    expect(await limiter.consume("auth-ip", "x", [SHORT])).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
  });

  it("stocke des clés pseudonymisées, jamais le sujet", async () => {
    const { limiter, store } = setup();
    await limiter.consume("sign-in-account", "alex@example.com", [SHORT]);
    expect([...store.rows.keys()]).toEqual([
      rateLimitKey(SECRET, "sign-in-account", SHORT, "alex@example.com"),
    ]);
  });

  it("consomme toutes les règles en un seul appel au magasin", async () => {
    const { limiter, store } = setup();
    await limiter.consume("auth-ip", "x", [SHORT, LONG]);
    expect(store.consume).toHaveBeenCalledTimes(1);
    expect(store.consume.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("refuse dès qu'une règle refuse, avec le plus long délai des règles refusées", async () => {
    const { limiter } = setup();
    const tight = { windowSeconds: 3600, max: 1 };
    await limiter.consume("auth-ip", "x", [SHORT, tight]);
    expect(await limiter.consume("auth-ip", "x", [SHORT, tight])).toEqual({
      allowed: false,
      retryAfterSeconds: 3600,
    });
  });

  it("refuse deux règles de même fenêtre (elles partageraient une clé)", async () => {
    const { limiter } = setup();
    await expect(
      limiter.consume("auth-ip", "x", [SHORT, { ...SHORT, max: 9 }]),
    ).rejects.toThrow(/fenêtre/);
  });

  it("purge les compteurs expirés tous les N appels", async () => {
    const { limiter, store } = setup({ purgeEvery: 3 });
    await limiter.consume("auth-ip", "x", [SHORT]);
    await limiter.consume("auth-ip", "x", [SHORT]);
    expect(store.purgeExpired).not.toHaveBeenCalled();
    await limiter.consume("auth-ip", "x", [SHORT]);
    expect(store.purgeExpired).toHaveBeenCalledWith(NOW, 1000);
  });

  it("journalise une purge en échec sans faire échouer la consommation", async () => {
    const store = memoryStore();
    store.purgeExpired.mockRejectedValue(new Error("base lente"));
    const { limiter, log } = setup({ purgeEvery: 1, store });
    expect((await limiter.consume("auth-ip", "x", [SHORT])).allowed).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(
      "purge des compteurs de limitation en échec",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("laisse remonter une panne du magasin (échec fermé)", async () => {
    const store = memoryStore();
    store.consume.mockRejectedValue(new Error("base injoignable"));
    const { limiter } = setup({ store });
    await expect(limiter.consume("auth-ip", "x", [SHORT])).rejects.toThrow(
      "base injoignable",
    );
  });

  it("journalise une limite atteinte une fois par portée et par fenêtre, sans le sujet", async () => {
    const { limiter, log } = setup();
    for (let i = 0; i < 6; i++) {
      await limiter.consume("sign-in-account", "alex@example.com", [SHORT]);
    }
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("limite de débit atteinte", {
      scope: "sign-in-account",
      suppressed: 0,
    });
    expect(everythingLogged(log)).not.toContain("alex");
  });
});
