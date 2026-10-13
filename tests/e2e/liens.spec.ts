import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { verifierScriptsSousNonce } from "./csp";
import { attendreHydratation } from "./helpers";
import { prendreEmail } from "./outbox";

/**
 * Liens d'email sûrs sur le build de production (P1-06, ADR 0017) : une page en lecture seule, un
 * clic (POST) consomme le lien. Scénario du pré-détournement : un tiers inscrit l'adresse de la
 * victime avec son mot de passe ; il ne doit jamais pouvoir s'en servir.
 *
 * IP propre à ce fichier (limiteur par IP, ADR 0015). Budget : 1 /sign-up/email, 2
 * /sign-in/magic-link, 1 /sign-in/email, 1 /verify-email/confirm, 1 /magic-link/confirm ; 2 emails
 * à la victime (activation, lien magique) et 1 à la seconde adresse (plafond : 3 / 15 min).
 */

test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.253" } });

const VICTIME = `e2e-victime-${randomBytes(6).toString("hex")}@example.com`;
const AUTRE = `e2e-lien-${randomBytes(6).toString("hex")}@example.com`;
const P_TIERS = "le mot de passe e2e du tiers";
const P_VICTIME = "le mot de passe e2e de la victime";
const SESSION_COOKIE = /better-auth\.session_token$/;

async function sansSession(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => SESSION_COOKIE.test(c.name))).toEqual([]);
}

async function accessible(page: Page, chemin: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations, chemin).toEqual([]);
}

async function sansReferrer(page: Page) {
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
}

test("le mot de passe d'un tiers qui a inscrit l'adresse de la victime ne connecte jamais", async ({
  page,
}) => {
  // 1. Le tiers s'inscrit avec l'adresse de la victime.
  await page.goto("/inscription");
  await attendreHydratation(page);
  const inscription = page.getByRole("form", { name: "Création de compte" });
  await inscription.getByLabel("Nom").fill("Tiers E2E");
  await inscription.getByLabel("Adresse email").fill(VICTIME);
  await inscription.getByLabel("Mot de passe").fill(P_TIERS);
  await inscription.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Vérifie ta boîte mail",
  );

  // 2. La victime ouvre le lien : la page s'affiche, rien n'est consommé, aucune session.
  const activation = await prendreEmail(VICTIME, "verification");
  expect(new URL(activation.url).pathname).toBe("/activation");
  await page.goto(activation.url);
  await attendreHydratation(page);
  await expect(page.getByRole("main")).toContainText(VICTIME);
  await sansReferrer(page);
  await accessible(page, "/activation");
  await sansSession(page);

  // 3. Elle saisit son propre mot de passe : refusé, et on lui propose le lien de connexion.
  await page.getByLabel("Mot de passe").fill(P_VICTIME);
  await page.getByRole("button", { name: "Activer mon compte" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Ce n'est pas le mot de passe choisi à l'inscription.",
  );
  await sansSession(page);

  // 4. Lien magique demandé depuis la page, ouvert, puis confirmé d'un clic.
  await page
    .getByRole("button", { name: "M'envoyer un lien de connexion" })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "un lien vient d'y être envoyé",
  );
  const magique = await prendreEmail(VICTIME, "magic-link");
  expect(new URL(magique.url).pathname).toBe("/connexion/lien");
  await page.goto(magique.url);
  await attendreHydratation(page);
  await expect(page.getByRole("main")).toContainText(
    `Tu vas te connecter à Trouvio en tant que ${VICTIME}`,
  );
  await sansSession(page);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page).toHaveURL(/\/fil$/);
  await expect(page.getByText(VICTIME)).toBeVisible();

  // 5. Déconnexion, puis le tiers essaie son mot de passe : refusé.
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await attendreHydratation(page);
  const formulaire = page.getByRole("form", {
    name: "Connexion avec ton mot de passe",
  });
  await formulaire.getByLabel("Adresse email").fill(VICTIME);
  await formulaire.getByLabel("Mot de passe").fill(P_TIERS);
  await formulaire.getByRole("button", { name: "Se connecter" }).click();
  await expect(formulaire.getByRole("alert")).toHaveText(
    "Email ou mot de passe incorrect.",
  );
  await sansSession(page);
});

test("un lien magique ouvert sans clic ne connecte pas (scanner d'emails)", async ({
  page,
  baseURL,
}) => {
  const demande = await page.request.post("/api/auth/sign-in/magic-link", {
    headers: { origin: baseURL ?? "" },
    data: { email: AUTRE },
  });
  expect(demande.status()).toBe(200);
  const magique = await prendreEmail(AUTRE, "magic-link");

  // CSP à nonce sur la page avec un jeton valable (sans jeton, elle redirige). Un GET de plus :
  // rien n'est consommé.
  await verifierScriptsSousNonce(page.request, magique.url);

  // Deux ouvertures, comme un scanner puis la personne : rien n'est consommé.
  await page.goto(magique.url);
  await page.goto(magique.url);
  await attendreHydratation(page);
  await expect(page.getByRole("main")).toContainText(AUTRE);
  await sansReferrer(page);
  await accessible(page, "/connexion/lien");
  await sansSession(page);
  await page.goto("/fil");
  await expect(page).toHaveURL(/\/connexion$/);
});
