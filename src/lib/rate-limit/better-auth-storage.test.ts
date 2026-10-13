import { describe, expect, it, vi } from "vitest";

import { toBetterAuthStorage } from "./better-auth-storage";
import { OTHER_PATH_BUCKET } from "./rules";
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
    await toBetterAuthStorage(l).consume("203.0.113.7|/sign-in/email", RULE);
    expect(l.consume).toHaveBeenCalledWith(
      "auth-ip",
      "203.0.113.7|/sign-in/email",
      [{ windowSeconds: 300, max: 10 }],
    );
  });

  it.each(["/reset-password/abc", "/xyz", "/sign-in/email/../x"])(
    "ramène %s au seau commun des autres chemins",
    async (path) => {
      const l = limiter();
      await toBetterAuthStorage(l).consume(`203.0.113.7|${path}`, RULE);
      expect(l.consume).toHaveBeenCalledWith(
        "auth-ip",
        `203.0.113.7|${OTHER_PATH_BUCKET}`,
        [{ windowSeconds: 300, max: 10 }],
      );
    },
  );

  it("garde une adresse IPv6 entière", async () => {
    const l = limiter();
    await toBetterAuthStorage(l).consume("2001:db8::|/sign-out", RULE);
    expect(l.consume).toHaveBeenCalledWith(
      "auth-ip",
      "2001:db8::|/sign-out",
      expect.any(Array),
    );
  });

  it("traduit un refus dans la forme attendue par Better Auth", async () => {
    const l = limiter({ allowed: false, retryAfterSeconds: 42 });
    expect(
      await toBetterAuthStorage(l).consume(
        "no-trusted-ip|/sign-in/email",
        RULE,
      ),
    ).toEqual({ allowed: false, retryAfter: 42 });
  });
});
