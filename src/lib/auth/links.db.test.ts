import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  buildTestAuth,
  callAuth,
  confirmMagicLink,
  confirmVerification,
  lastEmail,
  PASSWORD,
  sessionCookie,
  signUpVerified,
  tokenOf,
} from "@/test/auth/harness";
import { fakeLogger } from "@/test/db/fake-logger";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { sessions, users, verifications } from "../../../db/schema";
import type { Auth } from "./index";
import { previewMagicLink, previewVerificationLink } from "./links";
import type { AuthEmail } from "./mailer";

/**
 * Aperçus des pages /activation et /connexion/lien (ADR 0017) : en lecture seule, sur une vraie
 * base, avec les jetons émis par Better Auth (accord sur le format et le hachage).
 */

let t: TestDatabase;
let auth: Auth;
let outbox: AuthEmail[];

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  await resetData(t.db);
  outbox = [];
  auth = buildTestAuth({ db: t.db, outbox, log: fakeLogger() });
});
afterEach(() => {
  vi.useRealTimers();
});

const requestMagicLink = (email: string) =>
  callAuth(auth, "/sign-in/magic-link", { body: { email } });

async function writes() {
  return {
    sessions: await t.db.select().from(sessions),
    users: await t.db.select().from(users),
  };
}

describe("previewMagicLink", () => {
  it("rend l'adresse du jeton émis par /sign-in/magic-link", async () => {
    await requestMagicLink("alex@example.com");
    const token = tokenOf(lastEmail(outbox, "magic-link").url);
    expect(await previewMagicLink(auth, token)).toEqual({
      status: "valid",
      email: "alex@example.com",
    });
  });

  it("n'écrit rien et laisse le jeton consommable, même ouvert deux fois", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    await requestMagicLink("alex@example.com");
    const url = lastEmail(outbox, "magic-link").url;
    const before = await writes();
    await previewMagicLink(auth, tokenOf(url));
    await previewMagicLink(auth, tokenOf(url));
    expect(await writes()).toEqual(before);
    const response = await confirmMagicLink(auth, url);
    expect(sessionCookie(response)).toBeDefined();
  });

  it("rend invalid après consommation", async () => {
    await requestMagicLink("alex@example.com");
    const url = lastEmail(outbox, "magic-link").url;
    await confirmMagicLink(auth, url);
    expect(await previewMagicLink(auth, tokenOf(url))).toEqual({
      status: "invalid",
    });
  });

  it("rend invalid après expiration", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-08T10:00:00Z"),
    });
    await requestMagicLink("alex@example.com");
    const token = tokenOf(lastEmail(outbox, "magic-link").url);
    vi.setSystemTime(new Date("2026-10-08T10:10:01Z"));
    expect(await previewMagicLink(auth, token)).toEqual({ status: "invalid" });
  });

  // Page anonyme : un aperçu lit par l'index sans purger la table (pas de DELETE à chaque GET).
  it("ne supprime aucune ligne expirée", async () => {
    await t.db.insert(verifications).values({
      identifier: "ligne-expiree",
      value: "x",
      expiresAt: new Date(Date.now() - 60_000),
    });
    await previewMagicLink(auth, "a".repeat(32));
    await previewMagicLink(auth, "b".repeat(32));
    expect(
      (await t.db.select().from(verifications)).map((row) => row.identifier),
    ).toEqual(["ligne-expiree"]);
  });

  it.each(["", "inconnu", "a b", "x".repeat(5000)])(
    "rend invalid pour le jeton %j",
    async (token) => {
      expect(await previewMagicLink(auth, token)).toEqual({
        status: "invalid",
      });
    },
  );
});

describe("previewVerificationLink", () => {
  it("rend pending et l'adresse d'un compte non activé, sans rien écrire", async () => {
    await callAuth(auth, "/sign-up/email", {
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
    });
    const url = lastEmail(outbox, "verification").url;
    const before = await writes();
    expect(await previewVerificationLink(auth, tokenOf(url))).toEqual({
      status: "pending",
      email: "alex@example.com",
    });
    expect(await previewVerificationLink(auth, tokenOf(url))).toEqual({
      status: "pending",
      email: "alex@example.com",
    });
    expect(await writes()).toEqual(before);
    expect(
      sessionCookie(await confirmVerification(auth, url, PASSWORD)),
    ).toBeDefined();
  });

  it("rend verified pour un compte déjà actif", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    const token = tokenOf(lastEmail(outbox, "verification").url);
    expect(await previewVerificationLink(auth, token)).toEqual({
      status: "verified",
      email: "alex@example.com",
    });
  });

  it("rend invalid pour un jeton altéré, expiré ou d'un compte supprimé", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-08T10:00:00Z"),
    });
    await callAuth(auth, "/sign-up/email", {
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
    });
    const token = tokenOf(lastEmail(outbox, "verification").url);
    expect(await previewVerificationLink(auth, `${token}x`)).toEqual({
      status: "invalid",
    });
    vi.setSystemTime(new Date("2026-10-08T11:00:01Z"));
    expect(await previewVerificationLink(auth, token)).toEqual({
      status: "invalid",
    });
    vi.setSystemTime(new Date("2026-10-08T10:30:00Z"));
    await t.db.delete(users);
    expect(await previewVerificationLink(auth, token)).toEqual({
      status: "invalid",
    });
  });
});
