import { describe, expect, it } from "vitest";

import { ACCOUNT_LOCKED_CODE } from "@/features/auth/core/messages";
import { SIGN_IN_ACCOUNT_RULES } from "@/lib/rate-limit/rules";
import { fixedLimiter, unlimitedLimiter } from "@/test/rate-limit/fakes";

import { checkSignInAccount } from "./account-lock";

describe("checkSignInAccount", () => {
  it("compte la tentative sur l'email normalisé, sous les règles par compte", async () => {
    const limiter = unlimitedLimiter();
    await checkSignInAccount(limiter, {
      email: "  Alex@Example.com ",
      password: "x",
    });
    expect(limiter.consume).toHaveBeenCalledWith(
      "sign-in-account",
      "alex@example.com",
      SIGN_IN_ACCOUNT_RULES,
    );
  });

  it.each([[undefined], [{}], [{ email: 42 }], ["texte"]])(
    "ne compte rien sans email textuel (%j) : l'endpoint répondra 400",
    async (body) => {
      const limiter = unlimitedLimiter();
      await checkSignInAccount(limiter, body);
      expect(limiter.consume).not.toHaveBeenCalled();
    },
  );

  it("refuse par un 429 au code propre, avec le délai d'attente", async () => {
    const limiter = fixedLimiter({ allowed: false, retryAfterSeconds: 120 });
    await expect(
      checkSignInAccount(limiter, { email: "alex@example.com" }),
    ).rejects.toMatchObject({
      statusCode: 429,
      body: { code: ACCOUNT_LOCKED_CODE },
      headers: { "X-Retry-After": "120" },
    });
  });
});
