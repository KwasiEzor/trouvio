import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SESSION_TTL_SECONDS } from "@/features/auth/core/policy";
import { createPgRateLimitStore } from "@/lib/db/rate-limit-store";
import { deriveRateLimitSecret } from "@/lib/rate-limit/keys";
import { createRateLimiter } from "@/lib/rate-limit/limiter";
import {
  buildTestAuth,
  callAuth,
  confirmVerification,
  lastEmail,
  PASSWORD,
  SESSION_COOKIE,
  signUpVerified,
} from "@/test/auth/harness";
import { fakeLogger, type FakeLogger } from "@/test/db/fake-logger";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { rateLimits, sessions } from "../../../db/schema";
import type { Auth } from "./index";
import type { AuthEmail } from "./mailer";
import { refreshSession } from "./session-refresh";

/**
 * Prolongation de session (P1-05, ADR 0016) : la lecture serveur de la session, faite par
 * src/proxy.ts sur un chargement de document, doit rendre le Set-Cookie prolongé. Sans lui, le
 * cookie expire 7 jours après la connexion, même si la ligne en base a été prolongée.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

let t: TestDatabase;
let auth: Auth;
let log: FakeLogger;
let outbox: AuthEmail[];

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  await resetData(t.db);
  log = fakeLogger();
  outbox = [];
  auth = buildTestAuth({ db: t.db, outbox, log });
});

function headersWith(cookie: string): Headers {
  return new Headers({ cookie });
}

async function setExpiry(expiresAt: Date) {
  await t.db.update(sessions).set({ expiresAt });
}

async function storedExpiry(): Promise<Date | undefined> {
  const [row] = await t.db.select().from(sessions);
  return row?.expiresAt;
}

function sessionLine(lines: readonly string[]): string | undefined {
  return lines.find((line) => line.split("=")[0]?.endsWith(SESSION_COOKIE));
}

describe("refreshSession", () => {
  it("prolonge une session de plus d'un jour : cookie de 7 jours et ligne à maintenant + 7 j", async () => {
    const cookie = await signUpVerified(auth, outbox, "alex@example.com");
    await setExpiry(new Date(Date.now() + 6 * DAY_MS - MINUTE_MS));

    const lines = await refreshSession(auth, headersWith(cookie));

    const line = sessionLine(lines);
    expect(line).toBeDefined();
    expect(line).toMatch(
      new RegExp(`Max-Age=${SESSION_TTL_SECONDS}(;|$)`, "i"),
    );
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    const expiry = (await storedExpiry())?.getTime() ?? 0;
    expect(Math.abs(expiry - (Date.now() + 7 * DAY_MS))).toBeLessThan(
      MINUTE_MS,
    );
  });

  it("ne touche ni cookie ni ligne pour une session de moins d'un jour", async () => {
    const cookie = await signUpVerified(auth, outbox, "alex@example.com");
    const before = await storedExpiry();

    const lines = await refreshSession(auth, headersWith(cookie));

    expect(sessionLine(lines)).toBeUndefined();
    expect(await storedExpiry()).toEqual(before);
  });

  it("efface le cookie et la ligne d'une session expirée", async () => {
    const cookie = await signUpVerified(auth, outbox, "alex@example.com");
    await setExpiry(new Date(Date.now() - MINUTE_MS));

    const lines = await refreshSession(auth, headersWith(cookie));

    expect(sessionLine(lines)).toMatch(/Max-Age=0/i);
    expect(await t.db.select().from(sessions)).toEqual([]);
  });

  it("ignore un cookie altéré, sans exception", async () => {
    const cookie = await signUpVerified(auth, outbox, "alex@example.com");
    const lines = await refreshSession(auth, headersWith(`${cookie}x`));
    expect(sessionLine(lines) ?? "").not.toMatch(/Max-Age=[1-9]/i);
    expect(await t.db.select().from(sessions)).toHaveLength(1);
  });

  it("pose un cookie __Secure- et Secure quand l'application est en https", async () => {
    const origin = "https://trouvio.example";
    const secure = buildTestAuth({ db: t.db, outbox, log, baseURL: origin });
    await callAuth(secure, "/sign-up/email", {
      origin,
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
    });
    const verified = await confirmVerification(
      secure,
      lastEmail(outbox, "verification").url,
      PASSWORD,
      { origin },
    );
    const pair = verified.headers
      .getSetCookie()
      .find((line) => line.includes(SESSION_COOKIE))
      ?.split(";")[0];
    if (pair === undefined) throw new Error("vérification sans session");
    await setExpiry(new Date(Date.now() + 6 * DAY_MS - MINUTE_MS));

    const line = sessionLine(await refreshSession(secure, headersWith(pair)));

    expect(line?.startsWith(`__Secure-${SESSION_COOKIE}=`)).toBe(true);
    expect(line).toMatch(/;\s*Secure/i);
  });

  it("ne passe pas par le limiteur HTTP : aucun compteur écrit", async () => {
    const limited = buildTestAuth({
      db: t.db,
      outbox,
      log,
      rateLimit: {
        enabled: true,
        limiter: createRateLimiter({
          store: createPgRateLimitStore(t.db),
          secret: deriveRateLimitSecret("s".repeat(32)),
          log,
        }),
      },
    });
    const cookie = await signUpVerified(limited, outbox, "alex@example.com");
    await t.db.delete(rateLimits);
    await setExpiry(new Date(Date.now() + 6 * DAY_MS - MINUTE_MS));

    expect(
      sessionLine(await refreshSession(limited, headersWith(cookie))),
    ).toBeDefined();
    expect(await t.db.select().from(rateLimits)).toEqual([]);
  });
});
