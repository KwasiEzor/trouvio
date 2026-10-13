import { expect, test } from "@playwright/test";

/**
 * Limitation de débit sur le build de production (P1-04, ADR 0015) : limiteur actif sous
 * NODE_ENV=production, table rate_limits migrée, câblage de getAuth(). Requêtes API seules.
 *
 * L'IP vient de X-Forwarded-For, propre à ce fichier : elle ne croise pas auth.spec.ts, qui passe
 * par la boucle locale. En production, le reverse proxy écrase cet en-tête et le port de
 * l'application n'est pas publié (ARCHITECTURE §8) : ce test montre pourquoi.
 */

const IP = "203.0.113.250";

test("répond 429 au-delà de 10 connexions en 5 minutes depuis une IP", async ({
  request,
  baseURL,
}) => {
  const signIn = (n: number) =>
    request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL ?? "", "x-forwarded-for": IP },
      // Une adresse par tentative : le verrouillage par compte ne se déclenche pas.
      data: { email: `limiteur-${n}@example.com`, password: "mauvais" },
    });

  for (let n = 0; n < 10; n++) {
    expect((await signIn(n)).status(), `tentative ${n + 1}`).toBe(401);
  }
  const refused = await signIn(10);
  expect(refused.status()).toBe(429);
  expect(Number(refused.headers()["x-retry-after"])).toBeGreaterThan(0);
  expect(await refused.json()).toEqual({
    message: "Too many requests. Please try again later.",
  });
});
