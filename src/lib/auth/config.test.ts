import { describe, expect, it, vi } from "vitest";

import {
  MAGIC_LINK_TTL_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/auth/core/policy";
import { createDatabase, createPool } from "@/lib/db/client";
import { fakeLogger } from "@/test/db/fake-logger";

import { buildAuthOptions, type AuthDeps } from "./config";
import type { AuthEmail, AuthMailer } from "./mailer";

const BASE_URL = "http://localhost:3000";

/** Pool jamais interrogé : drizzleAdapter ne se connecte qu'à la première requête. */
function deps(overrides: Partial<AuthDeps> = {}): AuthDeps & {
  sent: AuthEmail[];
} {
  const sent: AuthEmail[] = [];
  const mailer: AuthMailer = {
    send: (email) => {
      sent.push(email);
      return Promise.resolve();
    },
  };
  return {
    db: createDatabase(
      createPool("postgres://essai@127.0.0.1:1/essai", {
        applicationName: "trouvio-test",
      }),
    ),
    baseURL: BASE_URL,
    secret: "s".repeat(32),
    mailer,
    log: fakeLogger(),
    sent,
    ...overrides,
  };
}

describe("options de Better Auth", () => {
  const options = buildAuthOptions(deps());

  it("exige la vérification d'email avant la connexion par mot de passe", () => {
    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    });
  });

  it("ne laisse pas le client choisir son rôle", () => {
    expect(options.user?.additionalFields?.role).toMatchObject({
      input: false,
      defaultValue: "user",
      type: ["user", "admin"],
    });
  });

  it("ne déclare pas le plan : Better Auth ne l'écrit ni ne le renvoie", () => {
    expect(options.user?.additionalFields).not.toHaveProperty("plan");
  });

  it("laisse Postgres générer les identifiants uuid", () => {
    expect(options.advanced?.database?.generateId).toBe("uuid");
  });

  it("n'accepte que l'origine de l'application", () => {
    expect(options.trustedOrigins).toEqual([BASE_URL]);
    expect(options.advanced).not.toHaveProperty("disableCSRFCheck");
    // Explicite : sinon coupé sous NODE_ENV=test, et les tests ne prouveraient rien.
    expect(options.advanced.disableOriginCheck).toBe(false);
  });

  it("coupe la télémétrie", () => {
    expect(options.telemetry).toEqual({ enabled: false });
  });

  it("garde le contrôle de schéma et le suivi des IP du limiteur", () => {
    expect(options.advanced.database).not.toHaveProperty("validateSchema");
    expect(options.advanced).not.toHaveProperty("ipAddress");
  });

  it("désactive les routes hors périmètre", () => {
    expect(options.disabledPaths).toEqual([
      "/update-user",
      "/change-email",
      "/delete-user",
      "/delete-user/callback",
      "/sign-in/social",
      "/link-social",
      "/unlink-account",
      "/request-password-reset",
      "/reset-password",
      "/list-sessions",
      "/revoke-session",
      "/revoke-sessions",
      "/revoke-other-sessions",
      "/update-session",
      "/list-accounts",
      "/account-info",
      "/get-access-token",
      "/refresh-token",
    ]);
  });

  it("stocke le jeton du lien magique haché, valable 10 minutes, nextCookies en dernier", () => {
    const ids = (options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).toEqual(["magic-link", "next-cookies"]);
    const magic = options.plugins?.[0];
    expect(magic?.options).toMatchObject({
      storeToken: "hashed",
      expiresIn: MAGIC_LINK_TTL_SECONDS,
    });
  });

  it("ne garde ni l'IP ni l'agent utilisateur d'une session", async () => {
    const before = options.databaseHooks?.session?.create?.before;
    const result = await before?.({
      id: "s",
      userId: "u",
      token: "t",
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: "203.0.113.7",
      userAgent: "Navigateur",
    });
    expect(result).toMatchObject({
      data: { ipAddress: null, userAgent: null, token: "t" },
    });
  });
});

describe("emails d'authentification", () => {
  const user = {
    id: "u",
    name: "Alex",
    email: "alex@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("envoie le lien de vérification par le port", async () => {
    const d = deps();
    const options = buildAuthOptions(d);
    await options.emailVerification?.sendVerificationEmail?.({
      user,
      url: `${BASE_URL}/api/auth/verify-email?token=jeton`,
      token: "jeton",
    });
    expect(d.sent).toEqual([
      expect.objectContaining({
        kind: "verification",
        to: "alex@example.com",
        url: `${BASE_URL}/api/auth/verify-email?token=jeton`,
      }),
    ]);
    expect(d.sent[0]?.text).toContain(d.sent[0]?.url);
    expect(d.sent[0]?.text).not.toContain("Alex");
  });

  it("prévient le titulaire d'une adresse déjà inscrite, avec le lien de connexion", async () => {
    const d = deps();
    await buildAuthOptions(d).emailAndPassword?.onExistingUserSignUp?.({
      user,
    });
    expect(d.sent).toEqual([
      expect.objectContaining({
        kind: "existing-account",
        to: "alex@example.com",
        url: `${BASE_URL}/connexion`,
      }),
    ]);
  });

  it("propage l'échec du transport plutôt que de prétendre avoir envoyé", async () => {
    const panne = new Error("transport en panne");
    const options = buildAuthOptions(
      deps({ mailer: { send: vi.fn(() => Promise.reject(panne)) } }),
    );
    await expect(
      options.emailVerification?.sendVerificationEmail?.({
        user,
        url: `${BASE_URL}/v`,
        token: "jeton",
      }),
    ).rejects.toBe(panne);
  });

  it("transmet les journaux de Better Auth au logger, masqués", () => {
    const d = deps();
    const options = buildAuthOptions(d);
    expect(options.logger?.level).toBe("warn");
    options.logger?.log?.("warn", "message");
    expect(d.log.warn).toHaveBeenCalledWith("message", undefined);
  });
});
