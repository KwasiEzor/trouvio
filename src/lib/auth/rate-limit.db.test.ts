import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ACCOUNT_LOCKED_CODE } from "@/features/auth/core/messages";
import { createPgRateLimitStore } from "@/lib/db/rate-limit-store";
import { deriveRateLimitSecret } from "@/lib/rate-limit/keys";
import { createRateLimiter } from "@/lib/rate-limit/limiter";
import type { RateLimitStore } from "@/lib/rate-limit/types";
import {
  BASE,
  buildTestAuth,
  callAuth,
  confirmVerification,
  lastEmail,
  PASSWORD,
  sessionCookie,
  signUpVerified,
  type Call,
} from "@/test/auth/harness";
import { fakeLogger, type FakeLogger } from "@/test/db/fake-logger";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { rateLimits } from "../../../db/schema";
import type { Auth } from "./index";
import type { AuthEmail } from "./mailer";

/**
 * Limitation de débit de bout en bout (P1-04, ADR 0015) : handler HTTP de Better Auth, limiteur
 * réel sur le magasin Postgres, horloge injectée. Le test d'acceptation est « dépassement → 429 ».
 */

let t: TestDatabase;
let auth: Auth;
let log: FakeLogger;
let outbox: AuthEmail[];
let clock: Date;

function build(store?: RateLimitStore): Auth {
  const limiter = createRateLimiter({
    store: store ?? createPgRateLimitStore(t.db),
    secret: deriveRateLimitSecret("s".repeat(32)),
    log,
    now: () => clock,
  });
  return buildTestAuth({
    db: t.db,
    outbox,
    log,
    rateLimit: { enabled: true, limiter },
  });
}

const call = (path: string, options: Call = {}) =>
  callAuth(auth, path, options);
const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};
const ipOf = (n: number) => `203.0.113.${n}`;
const signIn = (email: string, ip: string, origin?: string | null) =>
  call("/sign-in/email", {
    body: { email, password: "mauvais mot de passe" },
    ip,
    ...(origin === undefined ? {} : { origin }),
  });

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await resetData(t.db);
  log = fakeLogger();
  outbox = [];
  clock = new Date("2026-10-13T08:00:00.000Z");
  auth = build();
});

describe("par IP (handler HTTP)", () => {
  it("répond 429 au-delà de 10 connexions en 5 minutes depuis une IP", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await signIn(`essai${i}@example.com`, ipOf(7));
      expect(response.status).toBe(401);
    }
    const refused = await signIn("essai10@example.com", ipOf(7));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(sessionCookie(refused)).toBeUndefined();
    expect(await refused.json()).toEqual({
      message: "Too many requests. Please try again later.",
    });
  });

  it("ne touche ni une autre IP ni un autre chemin", async () => {
    for (let i = 0; i < 10; i++) await signIn(`essai${i}@example.com`, ipOf(7));
    expect((await signIn("essai10@example.com", ipOf(7))).status).toBe(429);
    expect((await signIn("autre@example.com", ipOf(8))).status).toBe(401);
    expect((await call("/ok", { method: "GET", ip: ipOf(7) })).status).toBe(
      200,
    );
  });

  it("accepte de nouveau à la fin de la fenêtre", async () => {
    for (let i = 0; i < 10; i++) await signIn(`essai${i}@example.com`, ipOf(7));
    expect((await signIn("essai10@example.com", ipOf(7))).status).toBe(429);
    advance(299);
    expect((await signIn("essai11@example.com", ipOf(7))).status).toBe(429);
    advance(1);
    expect((await signIn("essai@example.com", ipOf(7))).status).toBe(401);
  });

  it("met en commun les chaînes x-forwarded-for falsifiées (une seule valeur attendue)", async () => {
    // Sans IP résolue : 127.0.0.1 en test, la clé no-trusted-ip en production.
    for (let i = 0; i < 10; i++) {
      await signIn(`essai${i}@example.com`, `${ipOf(i)}, 198.51.100.1`);
    }
    expect(
      (await signIn("essai@example.com", "192.0.2.1, 198.51.100.2")).status,
    ).toBe(429);
  });

  it("limite l'activation à 10 en 5 minutes par IP", async () => {
    const confirm = () =>
      call("/verify-email/confirm", {
        body: { token: "jeton-invalide", password: PASSWORD },
        ip: ipOf(11),
      });
    for (let i = 0; i < 10; i++) expect((await confirm()).status).toBe(400);
    expect((await confirm()).status).toBe(429);
  });

  it("limite la confirmation du lien magique à 5 par minute et par IP", async () => {
    const confirm = () =>
      call("/magic-link/confirm", {
        body: { token: "jetoninvalide" },
        ip: ipOf(12),
      });
    for (let i = 0; i < 5; i++) expect((await confirm()).status).toBe(400);
    expect((await confirm()).status).toBe(429);
  });

  it("limite l'inscription à 5 en 10 minutes par IP", async () => {
    for (let i = 0; i < 5; i++) {
      await call("/sign-up/email", {
        body: { name: "Alex", email: `n${i}@example.com`, password: PASSWORD },
        ip: ipOf(9),
      });
    }
    const refused = await call("/sign-up/email", {
      body: { name: "Alex", email: "n5@example.com", password: PASSWORD },
      ip: ipOf(9),
    });
    expect(refused.status).toBe(429);
  });

  it("compte les chemins inventés dans un seul compteur par IP", async () => {
    for (let i = 0; i < 50; i++) {
      await call(`/chemin-invente-${i}`, { method: "GET", ip: ipOf(7) });
    }
    expect(await t.db.select().from(rateLimits)).toHaveLength(1);
  });

  it("ne stocke que des empreintes (clés conformes à la contrainte de la table)", async () => {
    await signIn("alex@example.com", ipOf(7));
    await call("/sign-in/magic-link", {
      body: { email: "alex@example.com" },
      ip: ipOf(7),
    });
    const keys = (await t.db.select().from(rateLimits)).map((row) => row.key);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("échoue fermé si le magasin est en panne : ni session ni email", async () => {
    const broken: RateLimitStore = {
      consume: () => Promise.reject(new Error("base injoignable")),
      purgeExpired: () => Promise.resolve(0),
    };
    auth = build(broken);
    // L'erreur sort du handler : le Route Handler de Next répond alors 500.
    await expect(
      call("/sign-in/magic-link", {
        body: { email: "alex@example.com" },
        ip: ipOf(7),
      }),
    ).rejects.toThrow("base injoignable");
    expect(outbox).toEqual([]);
  });
});

describe("par compte (connexion par mot de passe)", () => {
  async function exhaust(email: string) {
    for (let i = 0; i < 10; i++) await signIn(email, ipOf(100 + i));
  }

  it("répond 429 TOO_MANY_ATTEMPTS à la 11e tentative répartie sur 11 IP", async () => {
    await exhaust("alex@example.com");
    const refused = await signIn("alex@example.com", ipOf(200));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: ACCOUNT_LOCKED_CODE });
    expect(Number(refused.headers.get("x-retry-after"))).toBeGreaterThan(0);
  });

  it("verrouille même avec le bon mot de passe, sans poser de session", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    await exhaust("alex@example.com");
    const refused = await call("/sign-in/email", {
      body: { email: "alex@example.com", password: PASSWORD },
      ip: ipOf(200),
    });
    expect(refused.status).toBe(429);
    expect(sessionCookie(refused)).toBeUndefined();
  });

  it("répond pareil pour une adresse inscrite et une adresse inconnue", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    await exhaust("alex@example.com");
    await exhaust("inconnu@example.com");
    const known = await signIn("alex@example.com", ipOf(200));
    const unknown = await signIn("inconnu@example.com", ipOf(201));
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it("partage le verrou avec l'activation : un devineur ne double pas son budget", async () => {
    await call("/sign-up/email", {
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
      ip: ipOf(1),
    });
    const link = lastEmail(outbox, "verification").url;
    for (let i = 0; i < 10; i++) {
      const response = await confirmVerification(
        auth,
        link,
        `essai ${i} faux`,
        {
          ip: ipOf(100 + i),
        },
      );
      expect(response.status).toBe(401);
    }
    const locked = await confirmVerification(auth, link, PASSWORD, {
      ip: ipOf(200),
    });
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: ACCOUNT_LOCKED_CODE });
    expect(await signIn("alex@example.com", ipOf(201))).toMatchObject({
      status: 429,
    });
  });

  it("ne touche pas une autre adresse", async () => {
    await exhaust("alex@example.com");
    expect((await signIn("sam@example.com", ipOf(200))).status).toBe(401);
  });

  it("laisse le lien magique ouvert comme accès de secours", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    await exhaust("alex@example.com");
    const before = outbox.length;
    const response = await call("/sign-in/magic-link", {
      body: { email: "alex@example.com" },
      ip: ipOf(200),
    });
    expect(response.status).toBe(200);
    expect(outbox.length).toBe(before + 1);
  });

  it("compte aussi une tentative à l'origine refusée (hooks.before passe avant ce contrôle)", async () => {
    // Sans effet pour un attaquant : un client direct pose une origine valide. Ne pas reproduire
    // le contrôle d'origine ici : une lecture divergente ouvrirait un contournement du verrou.
    for (let i = 0; i < 10; i++) {
      const response = await signIn(
        "alex@example.com",
        ipOf(100 + i),
        "https://intrus.example",
      );
      expect(response.status).toBe(403);
    }
    expect((await signIn("alex@example.com", ipOf(200))).status).toBe(429);
  });

  it("bloque aussi les appels serveur auth.api.signInEmail", async () => {
    await exhaust("alex@example.com");
    await expect(
      auth.api.signInEmail({
        body: { email: "alex@example.com", password: PASSWORD },
        headers: new Headers({ origin: BASE }),
      }),
    ).rejects.toMatchObject({
      statusCode: 429,
      body: { code: ACCOUNT_LOCKED_CODE },
    });
  });
});

describe("par destinataire d'email", () => {
  const magicLink = (email: string, n: number) =>
    call("/sign-in/magic-link", { body: { email }, ip: ipOf(n) });

  it("n'envoie que 3 emails en 15 minutes à une adresse, avec une réponse inchangée", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await magicLink("alex@example.com", i)).status).toBe(200);
    }
    const capped = await magicLink("alex@example.com", 3);
    expect(capped.status).toBe(200);
    expect(await capped.json()).toEqual({ status: true });
    expect(outbox).toHaveLength(3);
  });

  it("compte tous les types d'email ensemble (inscription sur un compte existant)", async () => {
    await signUpVerified(auth, outbox, "alex@example.com");
    await magicLink("alex@example.com", 1);
    expect(outbox).toHaveLength(2);
    await call("/sign-up/email", {
      body: { name: "Alex", email: "alex@example.com", password: PASSWORD },
      ip: ipOf(2),
    });
    await magicLink("alex@example.com", 3);
    expect(outbox).toHaveLength(3);
    expect(outbox.map((email) => email.kind)).toEqual([
      "verification",
      "magic-link",
      "existing-account",
    ]);
  });

  it("ne touche pas un autre destinataire", async () => {
    for (let i = 0; i < 4; i++) await magicLink("alex@example.com", i);
    expect(outbox).toHaveLength(3);
    await magicLink("sam@example.com", 9);
    expect(
      outbox.filter((email) => email.to === "sam@example.com"),
    ).toHaveLength(1);
  });

  it("rouvre l'envoi à la fin de la fenêtre courte", async () => {
    for (let i = 0; i < 4; i++) await magicLink("alex@example.com", i);
    advance(900);
    await magicLink("alex@example.com", 10);
    expect(outbox).toHaveLength(4);
  });
});
