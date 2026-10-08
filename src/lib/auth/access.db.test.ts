import { randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildTestAuth,
  callAuth,
  SESSION_COOKIE,
  signUpVerified,
} from "@/test/auth/harness";
import { fakeLogger } from "@/test/db/fake-logger";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { sessions, users } from "../../../db/schema";
import { decideAccess, type AccessNeed } from "./access";
import type { Auth } from "./index";
import type { AuthEmail } from "./mailer";

/**
 * Chaîne réelle du contrôle d'accès (P1-03) : cookie de la requête → session Better Auth en base
 * → decideAccess. Les helpers de guards.ts n'y ajoutent que la réponse (redirection, 404, 401/403).
 */

let t: TestDatabase;
let auth: Auth;
let outbox: AuthEmail[];

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  // t reste indéfini si openTestDatabase a échoué (base injoignable) : ne pas masquer son message.
  await t?.close();
});
beforeEach(async () => {
  await resetData(t.db);
  outbox = [];
  auth = buildTestAuth({ db: t.db, outbox, log: fakeLogger() });
});

async function decisionFor(cookie: string, need: AccessNeed = "user") {
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  return decideAccess(session, need);
}

async function idOf(email: string) {
  const [row] = await t.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!row) throw new Error(`utilisateur ${email} absent`);
  return row.id;
}

/**
 * Cookie « nom=jeton.signature » (signature HMAC en base64, 44 caractères finissant par « = »,
 * encodée pour l'URL) : un caractère change au milieu de la signature, longueur et « = » final
 * gardés, pour que le refus vienne de la vérification HMAC et non du contrôle de format.
 */
function withAlteredSignature(cookie: string): string {
  const separator = cookie.indexOf("=");
  const value = decodeURIComponent(cookie.slice(separator + 1));
  const index = value.lastIndexOf(".") + 20;
  const altered = value[index] === "A" ? "B" : "A";
  const signed = `${value.slice(0, index)}${altered}${value.slice(index + 1)}`;
  const signature = signed.slice(signed.lastIndexOf(".") + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) {
    throw new Error("format de signature inattendu");
  }
  return `${cookie.slice(0, separator)}=${encodeURIComponent(signed)}`;
}

const A = "locataire-a@example.com";
const B = "locataire-b@example.com";

describe("identité tirée de la session", () => {
  it("donne à chaque cookie l'identifiant de son titulaire, jamais celui d'un autre", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    const cookieB = await signUpVerified(auth, outbox, B);
    expect(await decisionFor(cookieA)).toMatchObject({
      ok: true,
      user: { id: await idOf(A), email: A },
    });
    expect(await decisionFor(cookieB)).toMatchObject({
      ok: true,
      user: { id: await idOf(B), email: B },
    });
  });
});

describe("sessions refusées", () => {
  it("refuse un cookie forgé", async () => {
    await signUpVerified(auth, outbox, A);
    const forged = `${SESSION_COOKIE}=${randomBytes(24).toString("hex")}`;
    expect(await decisionFor(forged)).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("refuse le jeton de A dont la signature est altérée", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    expect(await decisionFor(withAlteredSignature(cookieA))).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("refuse le cookie de A après sa déconnexion, sans toucher à B", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    const cookieB = await signUpVerified(auth, outbox, B);
    await callAuth(auth, "/sign-out", { cookie: cookieA, body: {} });
    expect(await decisionFor(cookieA)).toMatchObject({ ok: false });
    expect(await decisionFor(cookieB)).toMatchObject({ ok: true });
  });

  it("refuse une session expirée en base", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    await t.db
      .update(sessions)
      .set({ expiresAt: sql`now() - interval '1 minute'` });
    expect(await decisionFor(cookieA)).toMatchObject({ ok: false });
  });

  it("refuse la session d'un utilisateur supprimé", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    await t.db.delete(users).where(eq(users.email, A));
    expect(await decisionFor(cookieA)).toMatchObject({ ok: false });
  });
});

describe("rôle admin", () => {
  it("accorde l'accès admin, puis le retire dès la requête suivante", async () => {
    const cookieA = await signUpVerified(auth, outbox, A);
    await t.db.update(users).set({ role: "admin" }).where(eq(users.email, A));
    expect(await decisionFor(cookieA, "admin")).toMatchObject({ ok: true });

    await t.db.update(users).set({ role: "user" }).where(eq(users.email, A));
    expect(await decisionFor(cookieA, "admin")).toEqual({
      ok: false,
      reason: "forbidden",
      userId: await idOf(A),
    });
  });
});
