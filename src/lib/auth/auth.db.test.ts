import { readFileSync } from "node:fs";

import { signJWT } from "better-auth/crypto";
import { eq } from "drizzle-orm";
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

import { NAME_MAX_LENGTH } from "@/features/auth/core/policy";
import { applySeed } from "@/lib/db/seed/apply";
import { parseSeedText } from "@/lib/db/seed/seed-file";
import {
  everythingLogged,
  fakeLogger,
  type FakeLogger,
} from "@/test/db/fake-logger";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";
import {
  BASE,
  buildTestAuth,
  callAuth,
  confirmMagicLink as confirmMagicLinkOf,
  confirmVerification as confirmVerificationOf,
  lastEmail as lastEmailOf,
  PASSWORD,
  SESSION_COOKIE,
  sessionCookie,
  signUpVerified,
  tokenOf,
  type Call,
} from "@/test/auth/harness";
import { SERVED_PATHS } from "@/test/auth/served-paths";

import { accounts, sessions, users, verifications } from "../../../db/schema";
import { DISABLED_PATHS } from "./config";
import type { Auth } from "./index";
import type { AuthEmail, AuthEmailKind } from "./mailer";

/**
 * Better Auth sur une vraie base, par son handler HTTP (la seule porte des formulaires). Le
 * limiteur intégré n'est actif qu'en production : les négatifs nombreux vivent ici.
 */

let t: TestDatabase;
let auth: Auth;
let log: FakeLogger;
let outbox: AuthEmail[];

function build(baseURL = BASE): Auth {
  return buildTestAuth({ db: t.db, outbox, log, baseURL });
}

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
  log = fakeLogger();
  auth = build();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------------------------

async function call(
  path: string,
  { instance = auth, ...options }: Call & { instance?: Auth } = {},
) {
  return callAuth(instance, path, options);
}

function setCookieLine(response: Response): string {
  const line = response.headers
    .getSetCookie()
    .find((candidate) => candidate.includes(SESSION_COOKIE));
  if (line === undefined) throw new Error("aucun cookie de session posé");
  return line;
}

function lastEmail(kind: AuthEmailKind): AuthEmail {
  return lastEmailOf(outbox, kind);
}

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  return call("/sign-up/email", {
    body: { name: "Alex", email, password: PASSWORD, ...extra },
  });
}

/** Clic sur « Activer mon compte » avec le dernier lien d'activation reçu. */
async function activate(
  password = PASSWORD,
  { instance = auth, ...options }: Call & { instance?: Auth } = {},
) {
  return confirmVerificationOf(
    instance,
    lastEmail("verification").url,
    password,
    options,
  );
}

/** Clic sur « Me connecter » avec le dernier lien magique reçu. */
async function confirmMagicLink(options: Call = {}) {
  return confirmMagicLinkOf(auth, lastEmail("magic-link").url, options);
}

async function sessionCount() {
  return (await t.db.select().from(sessions)).length;
}

/** Inscription puis activation par mot de passe : rend le cookie de session. */
async function verifiedUser(email = "alex@example.com"): Promise<string> {
  return signUpVerified(auth, outbox, email);
}

// Côté serveur, comme les pages : /get-session n'est plus servie en HTTP (ADR 0016).
async function sessionFor(cookie: string | undefined) {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", cookie);
  return auth.api.getSession({ headers });
}

async function userRow(email: string) {
  const [row] = await t.db.select().from(users).where(eq(users.email, email));
  return row;
}

// ---------------------------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------------------------

describe("inscription", () => {
  it("crée un utilisateur en minuscules, au rôle user malgré le corps, mot de passe haché", async () => {
    const response = await signUp("Alex.MARTIN@Example.com", {
      role: "admin",
      plan: "comfort",
    });
    expect(response.status).toBe(200);

    const row = await userRow("alex.martin@example.com");
    expect(row).toMatchObject({
      email: "alex.martin@example.com",
      role: "user",
      plan: "free",
      emailVerified: false,
    });
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);

    const [account] = await t.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, row?.id ?? ""));
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(PASSWORD);

    expect(lastEmail("verification").to).toBe("alex.martin@example.com");
  });

  it("ne crée aucune session avant la vérification de l'email", async () => {
    const response = await signUp("alex@example.com");
    expect(sessionCookie(response)).toBeUndefined();
    expect(await t.db.select().from(sessions)).toEqual([]);
  });

  it("répond pareil pour une adresse déjà inscrite et prévient son titulaire", async () => {
    const first = await signUp("alex@example.com");
    const second = await signUp("ALEX@example.com");

    expect(second.status).toBe(first.status);
    const [a, b] = [await first.json(), await second.json()] as [
      Record<string, Record<string, unknown>>,
      Record<string, Record<string, unknown>>,
    ];
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(Object.keys(b["user"] ?? {}).sort()).toEqual(
      Object.keys(a["user"] ?? {}).sort(),
    );
    expect(await t.db.select().from(users)).toHaveLength(1);
    expect(lastEmail("existing-account")).toMatchObject({
      to: "alex@example.com",
      url: `${BASE}/connexion`,
    });
  });

  it("refuse un mot de passe trop court", async () => {
    const response = await call("/sign-up/email", {
      body: {
        name: "Alex",
        email: "alex@example.com",
        password: "x".repeat(11),
      },
    });
    expect(response.status).toBe(400);
    expect(await t.db.select().from(users)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Vérification d'email et connexion par mot de passe
// ---------------------------------------------------------------------------------------------

describe("connexion par mot de passe", () => {
  it("refuse la connexion avant vérification, et renvoie un lien", async () => {
    await signUp("alex@example.com");
    outbox.length = 0;
    const response = await call("/sign-in/email", {
      body: { email: "alex@example.com", password: PASSWORD },
    });
    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeUndefined();
    expect(lastEmail("verification").to).toBe("alex@example.com");
  });

  it("donne la même réponse pour un email inconnu et un mauvais mot de passe", async () => {
    await verifiedUser();
    const unknown = await call("/sign-in/email", {
      body: { email: "inconnu@example.com", password: PASSWORD },
    });
    const wrong = await call("/sign-in/email", {
      body: { email: "alex@example.com", password: `${PASSWORD}!` },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("connecte après vérification, email saisi en majuscules", async () => {
    await verifiedUser();
    const response = await call("/sign-in/email", {
      body: { email: "ALEX@EXAMPLE.COM", password: PASSWORD },
    });
    expect(response.status).toBe(200);
    expect(await sessionFor(sessionCookie(response))).toMatchObject({
      user: { email: "alex@example.com", role: "user" },
    });
  });

  it("ne rend pas le jeton de session dans le corps, seulement en cookie", async () => {
    await verifiedUser();
    const response = await call("/sign-in/email", {
      body: { email: "alex@example.com", password: PASSWORD },
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      token: null,
      user: { email: "alex@example.com" },
    });
    expect(sessionCookie(response)).toBeDefined();
  });
});

describe("activation par mot de passe (I1)", () => {
  it("envoie un lien vers la page d'activation, jamais vers /api/auth", async () => {
    await signUp("alex@example.com");
    expect(lastEmail("verification").url).toMatch(
      new RegExp(`^${BASE}/activation\\?token=[A-Za-z0-9_.-]+$`),
    );
  });

  it("ne sert plus GET /verify-email : ouvrir le lien n'active rien", async () => {
    await signUp("alex@example.com");
    const response = await call(
      `/verify-email?token=${tokenOf(lastEmail("verification").url)}`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
    expect(await sessionCount()).toBe(0);
  });

  it("active et connecte avec le mot de passe de l'inscription, sans jeton en JSON ni cache", async () => {
    await signUp("alex@example.com");
    const response = await activate();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = sessionCookie(response);
    expect(await response.json()).toEqual({ status: true });
    expect(await sessionFor(cookie)).toMatchObject({
      user: { email: "alex@example.com" },
    });
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(true);
  });

  it("refuse un autre mot de passe : le compte reste non vérifié, sans session", async () => {
    await signUp("alex@example.com");
    const response = await activate(`${PASSWORD}!`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_PASSWORD" });
    expect(sessionCookie(response)).toBeUndefined();
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
    expect(await sessionCount()).toBe(0);
  });

  it("refuse un jeton altéré", async () => {
    await signUp("alex@example.com");
    const response = await call("/verify-email/confirm", {
      body: {
        token: `${tokenOf(lastEmail("verification").url)}x`,
        password: PASSWORD,
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });

  it("refuse un jeton expiré", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-08T10:00:00Z"),
    });
    await signUp("alex@example.com");
    vi.setSystemTime(new Date("2026-10-08T11:00:01Z"));
    const response = await activate();
    expect(response.status).toBe(400);
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });

  // Jeton de changement d'adresse : signé avec le même secret, il ne doit rien activer.
  it("refuse un jeton qui porte updateTo", async () => {
    await signUp("alex@example.com");
    const token = await signJWT(
      { email: "alex@example.com", updateTo: "autre@example.com" },
      "s".repeat(32),
      3600,
    );
    const response = await call("/verify-email/confirm", {
      body: { token, password: PASSWORD },
    });
    expect(response.status).toBe(400);
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });

  it("refuse un compte déjà vérifié avant de regarder le mot de passe", async () => {
    await verifiedUser();
    const before = await sessionCount();
    for (const password of [PASSWORD, `${PASSWORD}!`]) {
      const response = await activate(password);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "EMAIL_ALREADY_VERIFIED",
      });
      expect(sessionCookie(response)).toBeUndefined();
    }
    expect(await sessionCount()).toBe(before);
  });

  it.each([
    ["une origine étrangère", { origin: "https://evil.example" }],
    [
      "une navigation intersite",
      {
        origin: null,
        headers: {
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
        },
      },
    ],
  ] as const)("refuse un POST sans cookie venu d'%s", async (_nom, options) => {
    await signUp("alex@example.com");
    const response = await activate(PASSWORD, options);
    expect(response.status).toBe(403);
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });

  it("refuse un corps qui n'est pas du JSON (formulaire intersite)", async () => {
    await signUp("alex@example.com");
    const response = await call("/verify-email/confirm", {
      body: {
        token: tokenOf(lastEmail("verification").url),
        password: PASSWORD,
      },
      headers: { "content-type": "text/plain" },
    });
    expect(response.status).toBe(415);
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Sessions et cookies
// ---------------------------------------------------------------------------------------------

describe("sessions", () => {
  it("pose un cookie HttpOnly et SameSite=Lax, sans Secure en http local", async () => {
    await signUp("alex@example.com");
    const line = setCookieLine(await activate());
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).not.toMatch(/;\s*Secure/i);
  });

  it("pose un cookie Secure et préfixé __Secure- en https", async () => {
    const secure = build("https://trouvio.example");
    await call("/sign-up/email", {
      instance: secure,
      origin: "https://trouvio.example",
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
    });
    const response = await activate(PASSWORD, {
      instance: secure,
      origin: "https://trouvio.example",
    });
    const line = setCookieLine(response);
    expect(line.startsWith(`__Secure-${SESSION_COOKIE}=`)).toBe(true);
    expect(line).toMatch(/;\s*Secure/i);
  });

  it("ne stocke ni l'IP ni l'agent utilisateur", async () => {
    await verifiedUser();
    const [row] = await t.db.select().from(sessions);
    expect(row).toMatchObject({ ipAddress: null, userAgent: null });
  });

  it("ignore un cookie altéré ou mal formé, sans erreur serveur", async () => {
    const cookie = await verifiedUser();
    for (const bad of [
      `${cookie}x`,
      `${SESSION_COOKIE}=pas-un-uuid.signature`,
      `${SESSION_COOKIE}=`,
    ]) {
      expect(await sessionFor(bad)).toBeNull();
    }
  });

  it("ne sert plus /get-session en HTTP (jeton de session en JSON)", async () => {
    const cookie = await verifiedUser();
    const response = await call("/get-session", { method: "GET", cookie });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(cookie.split("=")[1] ?? "");
  });

  it("supprime la session à la déconnexion : l'ancien cookie ne vaut plus rien", async () => {
    const cookie = await verifiedUser();
    const response = await call("/sign-out", { cookie, body: {} });
    expect(response.status).toBe(200);
    expect(await t.db.select().from(sessions)).toEqual([]);
    expect(await sessionFor(cookie)).toBeNull();
  });

  it("supprime sessions et comptes avec l'utilisateur (cascade)", async () => {
    await verifiedUser();
    await t.db.delete(users);
    expect(await t.db.select().from(sessions)).toEqual([]);
    expect(await t.db.select().from(accounts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Lien magique
// ---------------------------------------------------------------------------------------------

async function requestMagicLink(email: string) {
  return call("/sign-in/magic-link", { body: { email } });
}

describe("lien magique (M1)", () => {
  it("répond pareil pour une adresse connue et inconnue", async () => {
    await verifiedUser();
    const known = await requestMagicLink("alex@example.com");
    const unknown = await requestMagicLink("inconnu@example.com");
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("envoie un lien vers la page de confirmation, jamais vers /api/auth", async () => {
    await requestMagicLink("alex@example.com");
    expect(lastEmail("magic-link").url).toMatch(
      new RegExp(`^${BASE}/connexion/lien\\?token=[A-Za-z]+$`),
    );
  });

  it("ne sert plus GET /magic-link/verify, et le jeton reste valable", async () => {
    await verifiedUser();
    await requestMagicLink("alex@example.com");
    const token = tokenOf(lastEmail("magic-link").url);
    const opened = await call(`/magic-link/verify?token=${token}`, {
      method: "GET",
    });
    expect(opened.status).toBe(404);
    expect(sessionCookie(opened)).toBeUndefined();
    expect((await confirmMagicLink()).status).toBe(200);
  });

  it("stocke le jeton haché, connecte au clic une fois, puis refuse", async () => {
    await verifiedUser();
    await requestMagicLink("alex@example.com");
    const token = tokenOf(lastEmail("magic-link").url);
    const stored = await t.db.select().from(verifications);
    expect(stored.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).not.toContain(token);

    const first = await confirmMagicLink();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(await sessionFor(sessionCookie(first))).toMatchObject({
      user: { email: "alex@example.com" },
    });
    const second = await confirmMagicLink();
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect(sessionCookie(second)).toBeUndefined();
  });

  it("ne rend pas le jeton de session en JSON", async () => {
    await verifiedUser();
    await requestMagicLink("alex@example.com");
    const response = await confirmMagicLink();
    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ status: true });
    expect(body).not.toContain(cookie?.split("=")[1]?.split(".")[0] ?? "jeton");
  });

  it("refuse un lien expiré", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-08T10:00:00Z"),
    });
    await requestMagicLink("alex@example.com");
    vi.setSystemTime(new Date("2026-10-08T10:11:00Z"));
    const response = await confirmMagicLink();
    expect(response.status).toBe(400);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it("n'ouvre qu'une session pour deux clics simultanés", async () => {
    await verifiedUser();
    await requestMagicLink("alex@example.com");
    const before = await sessionCount();
    const statuses = (
      await Promise.all([confirmMagicLink(), confirmMagicLink()])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 400]);
    expect(await sessionCount()).toBe(before + 1);
  });

  it("crée un compte vérifié en minuscules pour une adresse inconnue", async () => {
    await requestMagicLink("Nouveau@EXAMPLE.com");
    const response = await confirmMagicLink();
    expect(sessionCookie(response)).toBeDefined();
    expect(await userRow("nouveau@example.com")).toMatchObject({
      role: "user",
      emailVerified: true,
    });
  });

  it("connecte l'admin du seed, qui garde son rôle", async () => {
    const seed = parseSeedText(
      readFileSync(
        new URL("../../../db/seed.example.json", import.meta.url),
        "utf8",
      ),
    );
    await applySeed(t.db, seed);
    const email = seed.users[0]?.email ?? "";
    await requestMagicLink(email);
    const response = await confirmMagicLink();
    expect(await sessionFor(sessionCookie(response))).toMatchObject({
      user: { email, role: "admin" },
    });
    expect((await userRow(email))?.emailVerified).toBe(true);
  });

  it.each([
    ["une origine étrangère", { origin: "https://evil.example" }],
    [
      "une navigation intersite",
      {
        origin: null,
        headers: {
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
        },
      },
    ],
  ] as const)("refuse un POST sans cookie venu d'%s", async (_nom, options) => {
    await requestMagicLink("alex@example.com");
    const response = await confirmMagicLink(options);
    expect(response.status).toBe(403);
    expect(sessionCookie(response)).toBeUndefined();
    // Le jeton n'a pas été consommé.
    expect((await confirmMagicLink()).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
// Négatifs
// ---------------------------------------------------------------------------------------------

describe("refus", () => {
  it("refuse une requête avec cookie venue d'une autre origine", async () => {
    const cookie = await verifiedUser();
    const response = await call("/sign-out", {
      cookie,
      body: {},
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(await t.db.select().from(sessions)).toHaveLength(1);
  });

  it.each(["https://evil.example/fil", "//evil.example/fil"])(
    "refuse la redirection externe %s",
    async (callbackURL) => {
      const response = await call("/sign-in/magic-link", {
        body: { email: "alex@example.com", callbackURL },
      });
      expect(response.status).toBe(403);
      expect(outbox).toEqual([]);
    },
  );

  it.each(DISABLED_PATHS)("ne sert pas %s", async (path) => {
    const cookie = await verifiedUser();
    const statuses = [];
    for (const method of ["GET", "POST"] as const) {
      const response = await call(path, {
        method,
        cookie,
        body: method === "POST" ? { role: "admin" } : undefined,
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([404, 404]);
    expect((await userRow("alex@example.com"))?.role).toBe("user");
  });
});

// Liste blanche (P1-03) : une montée de better-auth qui ajoute une route la fait échouer, au lieu de
// l'ouvrir en silence. Toute route hors de cette liste entre dans DISABLED_PATHS.
describe("routes servies", () => {
  it("se limitent à la liste blanche", () => {
    const disabled: readonly string[] = DISABLED_PATHS;
    const served = Object.values(auth.api)
      .map((endpoint) => endpoint.path)
      .filter((path) => path !== undefined && !disabled.includes(path))
      .sort();
    expect(served).toEqual(SERVED_PATHS);
  });
});

// ---------------------------------------------------------------------------------------------
// Champs libres et comptes non prouvés
// ---------------------------------------------------------------------------------------------

describe("champs écrits par le client", () => {
  it("borne le nom et ignore l'image à l'inscription", async () => {
    await signUp("alex@example.com", {
      name: "n".repeat(5000),
      image: "https://evil.example/pixel.png",
    });
    const row = await userRow("alex@example.com");
    expect(row?.name).toHaveLength(NAME_MAX_LENGTH);
    expect(row?.image).toBeNull();
  });

  it("borne le nom d'un compte créé par lien magique", async () => {
    await call("/sign-in/magic-link", {
      body: { email: "nouveau@example.com", name: "n".repeat(5000) },
    });
    await confirmMagicLink();
    expect(
      (await userRow("nouveau@example.com"))?.name.length,
    ).toBeLessThanOrEqual(NAME_MAX_LENGTH);
  });
});

describe("pré-détournement par le lien d'activation (I1)", () => {
  const VICTIME = "victime@example.com";
  const P_TIERS = PASSWORD;
  const P_VICTIME = "le mot de passe de la victime";

  it("le mot de passe du tiers ne connecte plus après le lien magique de la victime", async () => {
    // 1. Le tiers inscrit l'adresse de la victime avec son propre mot de passe.
    await signUp(VICTIME);
    const activationLink = lastEmail("verification").url;

    // 2. La victime ouvre le lien d'activation et saisit son mot de passe : refusé.
    const refused = await confirmVerificationOf(
      auth,
      activationLink,
      P_VICTIME,
    );
    expect(refused.status).toBe(401);
    expect((await userRow(VICTIME))?.emailVerified).toBe(false);

    // 3. Le tiers ne peut pas se connecter : compte non vérifié.
    const early = await call("/sign-in/email", {
      body: { email: VICTIME, password: P_TIERS },
    });
    expect(early.status).toBe(403);
    expect(await early.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(sessionCookie(early)).toBeUndefined();

    // 4. La victime demande un lien magique et le confirme d'un clic.
    await requestMagicLink(VICTIME);
    const victim = await confirmMagicLink();
    expect(await sessionFor(sessionCookie(victim))).toMatchObject({
      user: { email: VICTIME },
    });
    const user = await userRow(VICTIME);
    expect(user?.emailVerified).toBe(true);
    expect(
      await t.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, user?.id ?? "")),
    ).toEqual([]);

    // 5. Le mot de passe du tiers ne connecte plus.
    const late = await call("/sign-in/email", {
      body: { email: VICTIME, password: P_TIERS },
    });
    expect(late.status).toBe(401);

    // 6. Rejouer le lien d'activation avec son mot de passe ne lui rend rien.
    const replay = await confirmVerificationOf(auth, activationLink, P_TIERS);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({
      code: "EMAIL_ALREADY_VERIFIED",
    });

    // 7. Une seule session : celle de la victime.
    expect(await sessionCount()).toBe(1);
  });

  it("prévient le titulaire d'un compte non activé qu'un lien de connexion le reprend", async () => {
    await signUp(VICTIME);
    await signUp(VICTIME);
    expect(lastEmail("existing-account")).toMatchObject({
      to: VICTIME,
      subject: "Ton compte Trouvio n'est pas activé",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Journaux
// ---------------------------------------------------------------------------------------------

describe("journaux", () => {
  it("ne contiennent ni email, ni jeton, ni lien", async () => {
    await verifiedUser("sentinelle@example.com");
    await signUp("sentinelle@example.com");
    await requestMagicLink("sentinelle@example.com");
    await confirmMagicLink();
    await confirmMagicLink();
    await signUp("sentinelle2@example.com");
    await activate(`${PASSWORD}!`);
    await call("/sign-in/magic-link", {
      body: {
        email: "sentinelle@example.com",
        callbackURL: "https://evil.example",
      },
    });
    const logged = everythingLogged(log);
    // La sonde (callbackURL refusée) a bien été journalisée, en warn : le test n'est pas vide.
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
    const secrets = outbox.flatMap((email) => [
      email.url,
      new URL(email.url).searchParams.get("token") ?? email.url,
    ]);
    expect(secrets.length).toBeGreaterThanOrEqual(4);
    expect(logged).not.toContain("sentinelle");
    expect(secrets.filter((secret) => logged.includes(secret))).toEqual([]);
  });
});
