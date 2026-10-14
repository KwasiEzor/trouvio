import { randomBytes } from "node:crypto";

import { expect, test, type Response } from "@playwright/test";

import { expirationSession, vieillirSession } from "./base";
import { verifierChargementPropre, verifierScriptsSousNonce } from "./csp";
import { prendreEmail } from "./outbox";

/**
 * Sessions glissantes dans le vrai runtime Next (P1-05, ADR 0016) : src/proxy.ts relit la session
 * sur un chargement de document et recopie le Set-Cookie prolongé. Budget : 1 /sign-up/email, sur
 * une IP propre à ce fichier (X-Forwarded-For, limiteur par IP, ADR 0015).
 */

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.251" } });

const EMAIL = `e2e-session-${randomBytes(6).toString("hex")}@example.com`;
const MOT_DE_PASSE = "un mot de passe e2e assez long";
const SEPT_JOURS_S = 7 * 24 * 60 * 60;
const SESSION_COOKIE = /^better-auth\.session_token=/;

/**
 * Lignes Set-Cookie du cookie de session. Toutes, pour voir un doublon : l'adaptateur de Next
 * remplace la recopie du proxy par les cookies de nextCookies (risque R3 du plan).
 */
async function cookiesDeSession(reponse: Response | null): Promise<string[]> {
  const lignes = (await reponse?.headersArray()) ?? [];
  return lignes
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .flatMap(({ value }) => value.split("\n"))
    .filter((ligne) => SESSION_COOKIE.test(ligne));
}

test("prolonge la session au chargement d'une page, cookie compris", async ({
  page,
  baseURL,
}) => {
  // Inscription par l'API, puis clic sur le lien de vérification : session ouverte.
  const inscription = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL ?? "" },
    data: {
      name: "Alex E2E",
      email: EMAIL,
      password: MOT_DE_PASSE,
      callbackURL: "/fil",
    },
  });
  expect(inscription.status()).toBe(200);
  await page.goto((await prendreEmail(EMAIL, "verification")).url);
  await expect(page).toHaveURL(/\/fil$/);

  // Session de plus d'un jour : le chargement de /fil la prolonge, en base et en cookie.
  await vieillirSession(EMAIL);
  const reponse = await page.goto("/fil");
  const lignes = await cookiesDeSession(reponse);
  expect(lignes).toHaveLength(1);
  const ligne = lignes[0];
  expect(ligne).toMatch(new RegExp(`Max-Age=${SEPT_JOURS_S}(;|$)`, "i"));
  expect(ligne).toMatch(/HttpOnly/i);
  expect(ligne).toMatch(/SameSite=Lax/i);
  const expiration = (await expirationSession(EMAIL)).getTime();
  expect(
    Math.abs(expiration - (Date.now() + SEPT_JOURS_S * 1000)),
  ).toBeLessThan(5 * 60 * 1000);

  // Second chargement : déjà prolongée aujourd'hui, aucun Set-Cookie.
  const suivante = await page.goto("/fil");
  expect(await cookiesDeSession(suivante)).toEqual([]);
});

test("une personne connectée qui ouvre /connexion ou /inscription arrive sur le fil", async ({
  page,
  baseURL,
}) => {
  // Même compte que le test précédent (série) : le contexte est neuf, on se reconnecte par l'API.
  const connexion = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL ?? "" },
    data: { email: EMAIL, password: MOT_DE_PASSE },
  });
  expect(connexion.status()).toBe(200);
  for (const chemin of ["/connexion", "/inscription"]) {
    await page.goto(chemin);
    await expect(page).toHaveURL(/\/fil$/);
  }

  // Page connectée : mêmes garanties CSP que les pages publiques (en-tetes.spec.ts).
  await verifierScriptsSousNonce(page.request, "/fil");
  await verifierChargementPropre(page, "/fil");
});
