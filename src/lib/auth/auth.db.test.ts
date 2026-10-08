import { readFileSync } from "node:fs";

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
  accounts,
  sessions,
  users,
  verifications,
} from "../../../db/schema";
import { createAuth, type Auth } from "./index";
import type { AuthEmail, AuthEmailKind } from "./mailer";

/**
 * Better Auth sur une vraie base, par son handler HTTP (la seule porte des formulaires). Le
 * limiteur intégré n'est actif qu'en production : les négatifs nombreux vivent ici.
 */

const BASE = "http://localhost:3000";
const PASSWORD = "un mot de passe assez long";
const SESSION_COOKIE = "better-auth.session_token";

let t: TestDatabase;
let auth: Auth;
let log: FakeLogger;
let outbox: AuthEmail[];

function build(baseURL = BASE): Auth {
  return createAuth({
    db: t.db,
    baseURL,
    secret: "s".repeat(32),
    mailer: {
      send: (email) => {
        outbox.push(email);
        return Promise.resolve();
      },
    },
    log,
  });
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

type Call = {
  method?: "GET" | "POST";
  body?: unknown;
  cookie?: string | undefined;
  origin?: string | null;
  instance?: Auth;
};

async function call(
  path: string,
  { method = "POST", body, cookie, origin = BASE, instance = auth }: Call = {},
) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie !== undefined) headers.set("cookie", cookie);
  if (origin !== null) headers.set("origin", origin);
  const base = instance.options.baseURL ?? BASE;
  return instance.handler(
    new Request(`${base}/api/auth${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );
}

/** Valeur « nom=valeur » du cookie de session posé par une réponse, ou undefined. */
function sessionCookie(response: Response): string | undefined {
  const raw = response.headers
    .getSetCookie()
    .find((line) => line.split("=")[0]?.endsWith(SESSION_COOKIE));
  const pair = raw?.split(";")[0];
  return pair === undefined || pair.endsWith("=") ? undefined : pair;
}

function setCookieLine(response: Response): string {
  const line = response.headers
    .getSetCookie()
    .find((candidate) => candidate.includes(SESSION_COOKIE));
  if (line === undefined) throw new Error("aucun cookie de session posé");
  return line;
}

function lastEmail(kind: AuthEmailKind): AuthEmail {
  const email = outbox.filter((candidate) => candidate.kind === kind).at(-1);
  if (email === undefined) throw new Error(`aucun email « ${kind} »`);
  return email;
}

/** Chemin et paramètres d'un lien reçu, rejoués sur le handler. */
function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname.replace(/^\/api\/auth/, "")}${parsed.search}`;
}

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  return call("/sign-up/email", {
    body: { name: "Alex", email, password: PASSWORD, ...extra },
  });
}

/** Inscription puis clic sur le lien de vérification : rend le cookie de session. */
async function verifiedUser(email = "alex@example.com"): Promise<string> {
  await signUp(email);
  const response = await call(pathOf(lastEmail("verification").url), {
    method: "GET",
  });
  const cookie = sessionCookie(response);
  if (cookie === undefined) throw new Error("vérification sans session");
  return cookie;
}

async function sessionFor(cookie: string | undefined) {
  const response = await call("/get-session", { method: "GET", cookie });
  return (await response.json()) as {
    user: { email: string; role: string };
  } | null;
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
      body: { name: "Alex", email: "alex@example.com", password: "x".repeat(11) },
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
    outbox = [];
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
});

describe("vérification d'email", () => {
  it("marque l'email vérifié et connecte au premier usage seulement", async () => {
    await signUp("alex@example.com");
    const link = pathOf(lastEmail("verification").url);

    const first = await call(link, { method: "GET" });
    expect(sessionCookie(first)).toBeDefined();
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(true);

    const second = await call(link, { method: "GET" });
    expect(sessionCookie(second)).toBeUndefined();
    expect(await t.db.select().from(sessions)).toHaveLength(1);
  });

  it("refuse un jeton altéré", async () => {
    await signUp("alex@example.com");
    const url = new URL(lastEmail("verification").url);
    url.searchParams.set("token", `${url.searchParams.get("token")}x`);
    const response = await call(pathOf(url.toString()), { method: "GET" });
    expect(sessionCookie(response)).toBeUndefined();
    expect((await userRow("alex@example.com"))?.emailVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Sessions et cookies
// ---------------------------------------------------------------------------------------------

describe("sessions", () => {
  it("pose un cookie HttpOnly et SameSite=Lax, sans Secure en http local", async () => {
    await signUp("alex@example.com");
    const response = await call(pathOf(lastEmail("verification").url), {
      method: "GET",
    });
    const line = setCookieLine(response);
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
    const response = await call(pathOf(lastEmail("verification").url), {
      instance: secure,
      method: "GET",
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
      const response = await call("/get-session", {
        method: "GET",
        cookie: bad,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    }
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
  return call("/sign-in/magic-link", {
    body: { email, callbackURL: "/fil", errorCallbackURL: "/connexion?erreur=lien" },
  });
}

describe("lien magique", () => {
  it("répond pareil pour une adresse connue et inconnue", async () => {
    await verifiedUser();
    const known = await requestMagicLink("alex@example.com");
    const unknown = await requestMagicLink("inconnu@example.com");
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it("stocke le jeton haché, connecte une fois, puis refuse", async () => {
    await verifiedUser();
    await requestMagicLink("alex@example.com");
    const url = lastEmail("magic-link").url;
    const token = new URL(url).searchParams.get("token") ?? "";
    const stored = await t.db.select().from(verifications);
    expect(stored.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).not.toContain(token);

    const first = await call(pathOf(url), { method: "GET" });
    expect(await sessionFor(sessionCookie(first))).toMatchObject({
      user: { email: "alex@example.com" },
    });
    const second = await call(pathOf(url), { method: "GET" });
    expect(sessionCookie(second)).toBeUndefined();
    expect(second.headers.get("location")).toContain("/connexion?erreur=lien");
  });

  it("refuse un lien expiré", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-08T10:00:00Z") });
    await requestMagicLink("alex@example.com");
    vi.setSystemTime(new Date("2026-10-08T10:11:00Z"));
    const response = await call(pathOf(lastEmail("magic-link").url), {
      method: "GET",
    });
    expect(sessionCookie(response)).toBeUndefined();
  });

  it("crée un compte vérifié en minuscules pour une adresse inconnue", async () => {
    await requestMagicLink("Nouveau@EXAMPLE.com");
    const response = await call(pathOf(lastEmail("magic-link").url), {
      method: "GET",
    });
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
    const response = await call(pathOf(lastEmail("magic-link").url), {
      method: "GET",
    });
    expect(await sessionFor(sessionCookie(response))).toMatchObject({
      user: { email, role: "admin" },
    });
    expect((await userRow(email))?.emailVerified).toBe(true);
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

  it.each([
    "/update-user",
    "/change-email",
    "/delete-user",
    "/sign-in/social",
    "/link-social",
    "/unlink-account",
  ])("ne sert pas %s", async (path) => {
    const cookie = await verifiedUser();
    const response = await call(path, { cookie, body: { role: "admin" } });
    expect(response.status).toBe(404);
    expect((await userRow("alex@example.com"))?.role).toBe("user");
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
    await call("/sign-in/magic-link", {
      body: { email: "sentinelle@example.com", callbackURL: "https://evil.example" },
    });
    const logged = everythingLogged(log);
    // La sonde (callbackURL refusée) a bien été journalisée, en warn : le test n'est pas vide.
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
    const secrets = outbox.flatMap((email) => [
      email.url,
      new URL(email.url).searchParams.get("token") ?? email.url,
    ]);
    expect(secrets.length).toBeGreaterThan(0);
    expect(logged).not.toContain("sentinelle");
    expect(secrets.filter((secret) => logged.includes(secret))).toEqual([]);
  });
});
