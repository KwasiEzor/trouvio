import { describe, expect, it, vi } from "vitest";

import { fakeLogger } from "@/test/db/fake-logger";

import { toBetterAuthStorage } from "./better-auth-storage";
import { AUTH_IP_DEFAULT_RULE, OTHER_PATH_BUCKET } from "./rules";
import type { RateLimiter } from "./types";

function limiter(
  result = { allowed: true, retryAfterSeconds: null as number | null },
) {
  return {
    consume: vi.fn<RateLimiter["consume"]>(() => Promise.resolve(result)),
  };
}

const RULE = { window: 300, max: 10 };

describe("toBetterAuthStorage", () => {
  it("compte un chemin limité dans son propre seau, par IP", async () => {
    const l = limiter();
    await toBetterAuthStorage(l, fakeLogger()).consume(
      "203.0.113.7|/sign-in/email",
      RULE,
    );
    expect(l.consume).toHaveBeenCalledWith(
      "auth-ip",
      "203.0.113.7|/sign-in/email",
      [{ windowSeconds: 300, max: 10 }],
    );
  });

  it.each(["/reset-password/abc", "/xyz", "/sign-in/email/../x"])(
    "ramène %s au seau commun des autres chemins, sous la règle par défaut",
    async (path) => {
      const l = limiter();
      await toBetterAuthStorage(l, fakeLogger()).consume(
        `203.0.113.7|${path}`,
        // Règle intégrée de Better Auth pour /sign-in/* : ignorée dans le seau commun.
        { window: 10, max: 3 },
      );
      expect(l.consume).toHaveBeenCalledWith(
        "auth-ip",
        `203.0.113.7|${OTHER_PATH_BUCKET}`,
        [AUTH_IP_DEFAULT_RULE],
      );
    },
  );

  it("garde une adresse IPv6 entière", async () => {
    const l = limiter();
    await toBetterAuthStorage(l, fakeLogger()).consume(
      "2001:db8::|/sign-out",
      RULE,
    );
    expect(l.consume).toHaveBeenCalledWith(
      "auth-ip",
      "2001:db8::|/sign-out",
      expect.any(Array),
    );
  });

  it("traduit un refus dans la forme attendue par Better Auth", async () => {
    const l = limiter({ allowed: false, retryAfterSeconds: 42 });
    expect(
      await toBetterAuthStorage(l, fakeLogger()).consume(
        "no-trusted-ip|/sign-in/email",
        RULE,
      ),
    ).toEqual({ allowed: false, retryAfter: 42 });
  });

  it("refuse une clé au format inattendu (montée de Better Auth)", async () => {
    await expect(
      toBetterAuthStorage(limiter(), fakeLogger()).consume(
        "sans-separateur",
        RULE,
      ),
    ).rejects.toThrow("format de clé");
  });

  it("signale à Sentry une IP non résolue (reverse proxy mal configuré), une fois par fenêtre", async () => {
    const log = fakeLogger();
    const storage = toBetterAuthStorage(limiter(), log);
    await storage.consume("no-trusted-ip|/sign-in/email", RULE);
    await storage.consume("no-trusted-ip|/sign-up/email", RULE);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      "limiteur : IP du client non résolue, compteur commun à tous",
    );
  });
});
