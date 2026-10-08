import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { attendreHydratation } from "./helpers";
import { prendreEmail } from "./outbox";

/**
 * Parcours d'authentification sur le build de production (P1-02, critère A1). En série : un seul
 * compte, créé par le parcours d'inscription, sur un domaine réservé. Le limiteur intégré de Better
 * Auth est actif (production) : 3 requêtes / 10 s sur /sign-in* et /sign-up*. Le fichier en fait
 * au plus trois ; les négatifs nombreux vivent dans src/lib/auth/auth.db.test.ts.
 */

test.describe.configure({ mode: "serial" });

const EMAIL = `e2e-${randomBytes(6).toString("hex")}@example.com`;
const PASSWORD = "un mot de passe e2e assez long";
const SESSION_COOKIE = /better-auth\.session_token$/;

function formulaireMotDePasse(page: Page) {
  return page.getByRole("form", { name: "Connexion avec ton mot de passe" });
}

async function seDeconnecter(page: Page) {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
}

test("/fil sans session renvoie à la connexion", async ({ page }) => {
  await page.goto("/fil");
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("les pages d'inscription et de connexion sont accessibles (axe)", async ({
  page,
}) => {
  for (const chemin of ["/inscription", "/connexion"]) {
    await page.goto(chemin);
    await attendreHydratation(page);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations, chemin).toEqual([]);
  }
});

test("inscription, vérification, connexion, déconnexion, lien magique", async ({
  page,
  context,
}) => {
  // Inscription : un seul message, que l'adresse soit libre ou non.
  await page.goto("/inscription");
  await attendreHydratation(page);
  const inscription = page.getByRole("form", { name: "Création de compte" });
  await inscription.getByLabel("Nom").fill("Alex E2E");
  await inscription.getByLabel("Adresse email").fill(EMAIL);
  await inscription.getByLabel("Mot de passe").fill(PASSWORD);
  await inscription.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("status")).toContainText("Vérifie ta boîte mail");

  // Lien de vérification : connecté, arrivée sur /fil.
  const verification = await prendreEmail(EMAIL, "verification");
  await page.goto(verification.url);
  await expect(page).toHaveURL(/\/fil$/);
  await expect(page.getByText(EMAIL)).toBeVisible();

  const cookie = (await context.cookies()).find((c) =>
    SESSION_COOKIE.test(c.name),
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");

  // Déconnexion : /fil renvoie à la connexion.
  await seDeconnecter(page);
  await page.goto("/fil");
  await expect(page).toHaveURL(/\/connexion$/);

  // Mauvais mot de passe : message unique, on reste sur /connexion.
  await attendreHydratation(page);
  const formulaire = formulaireMotDePasse(page);
  await formulaire.getByLabel("Adresse email").fill(EMAIL);
  await formulaire.getByLabel("Mot de passe").fill(`${PASSWORD}!`);
  await formulaire.getByRole("button", { name: "Se connecter" }).click();
  await expect(formulaire.getByRole("alert")).toHaveText(
    "Email ou mot de passe incorrect.",
  );
  await expect(page).toHaveURL(/\/connexion$/);

  // Connexion par mot de passe.
  await formulaire.getByLabel("Mot de passe").fill(PASSWORD);
  await formulaire.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/fil$/);
  await expect(page.getByText(EMAIL)).toBeVisible();
  await seDeconnecter(page);

  // Connexion par lien magique.
  await attendreHydratation(page);
  const lien = page.getByRole("form", { name: "Connexion par lien" });
  await lien.getByLabel("Adresse email").fill(EMAIL);
  await lien
    .getByRole("button", { name: "Recevoir un lien de connexion" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "un lien vient d'y être envoyé",
  );
  const magique = await prendreEmail(EMAIL, "magic-link");
  await page.goto(magique.url);
  await expect(page).toHaveURL(/\/fil$/);
  await expect(page.getByText(EMAIL)).toBeVisible();

  // Un lien déjà utilisé ne connecte plus : message de la liste fermée.
  await seDeconnecter(page);
  await page.goto(magique.url);
  await expect(page).toHaveURL(/\/connexion\?erreur=lien/);
  await expect(page.getByRole("alert")).toHaveText(
    "Ce lien n'est plus valable. Demande-en un nouveau.",
  );
});
