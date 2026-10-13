import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { attendreHydratation } from "./helpers";

/**
 * Contrôles CSP communs aux E2E (P1-05, ADR 0016) : chaque script du HTML porte le nonce de
 * l'en-tête, et la page s'hydrate sans violation de CSP ni erreur console.
 */

const NONCE = /'nonce-([A-Za-z0-9+/_-]+={0,2})'/;

/** Nonce de la CSP d'une réponse de page. */
export function nonceDe(csp: string | undefined): string {
  const nonce = NONCE.exec(csp ?? "")?.[1];
  if (nonce === undefined) throw new Error(`CSP sans nonce : ${csp}`);
  return nonce;
}

/** HTML brut d'une page : rend le nonce de l'en-tête, après avoir vérifié chaque balise <script>. */
export async function verifierScriptsSousNonce(
  request: APIRequestContext,
  chemin: string,
): Promise<string> {
  const reponse = await request.get(chemin);
  const nonce = nonceDe(reponse.headers()["content-security-policy"]);
  const balises = (await reponse.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(balises.length, chemin).toBeGreaterThan(0);
  expect(
    balises.filter((balise) => !balise.includes(` nonce="${nonce}"`)),
    chemin,
  ).toEqual([]);
  return nonce;
}

declare global {
  interface Window {
    __violationsCsp?: string[];
  }
}

/** À appeler avant goto : enregistre chaque violation de CSP de la page. */
export async function ecouterViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__violationsCsp = [];
    document.addEventListener("securitypolicyviolation", (evenement) => {
      window.__violationsCsp?.push(
        `${evenement.violatedDirective} ${evenement.blockedURI}`,
      );
    });
  });
}

export async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__violationsCsp ?? []);
}

/** Charge la page, attend l'hydratation : aucune violation, aucune erreur console (hors `ignorer`). */
export async function verifierChargementPropre(
  page: Page,
  chemin: string,
  ignorer?: RegExp,
): Promise<void> {
  const erreurs: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !ignorer?.test(message.text()))
      erreurs.push(message.text());
  });
  page.on("pageerror", (erreur) => erreurs.push(erreur.message));
  await ecouterViolations(page);
  await page.goto(chemin);
  await attendreHydratation(page);
  expect(await violations(page), chemin).toEqual([]);
  expect(erreurs, chemin).toEqual([]);
}
