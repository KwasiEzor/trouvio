import { expect, test } from "@playwright/test";

import {
  ecouterViolations,
  nonceDe,
  verifierChargementPropre,
  verifierScriptsSousNonce,
  violations,
} from "./csp";
import { attendreHydratation } from "./helpers";

/**
 * En-têtes de sécurité sur le build de production (P1-05, SECURITY §3, ADR 0016). Serveur en
 * http://localhost, sans DSN : ni upgrade-insecure-requests, ni origine Sentry dans connect-src.
 * Requêtes de page sans cookie : aucune lecture de session, aucun compteur du limiteur.
 */

const COMMUNS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()",
  "x-frame-options": "DENY",
};

function cspDePage(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function communs(entetes: Record<string, string>) {
  return Object.fromEntries(
    Object.keys(COMMUNS).map((nom) => [nom, entetes[nom]]),
  );
}

test("une page porte chaque en-tête et une CSP à nonce, sans unsafe-inline pour les scripts", async ({
  request,
}) => {
  const reponse = await request.get("/connexion");
  const entetes = reponse.headers();
  expect(communs(entetes)).toEqual(COMMUNS);
  const csp = entetes["content-security-policy"];
  expect(csp).toBe(cspDePage(nonceDe(csp)));
  expect(entetes["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
});

test("une route API porte chaque en-tête et une CSP qui n'autorise rien", async ({
  request,
}) => {
  const entetes = (await request.get("/api/auth/ok")).headers();
  expect(communs(entetes)).toEqual(COMMUNS);
  expect(entetes["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
});

test("un script statique porte nosniff et HSTS", async ({ request }) => {
  const html = await (await request.get("/connexion")).text();
  const script = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/.exec(
    html,
  )?.[1];
  expect(script).toBeDefined();
  const entetes = (await request.get(script ?? "")).headers();
  expect(entetes["x-content-type-options"]).toBe("nosniff");
  expect(entetes["strict-transport-security"]).toBe(
    COMMUNS["strict-transport-security"],
  );
});

for (const chemin of ["/", "/connexion", "/inscription", "/styleguide"]) {
  test(`${chemin} : scripts sous nonce, nonce neuf à chaque requête, chargement sans violation`, async ({
    page,
    request,
  }) => {
    const premier = await verifierScriptsSousNonce(request, chemin);
    const second = await verifierScriptsSousNonce(request, chemin);
    // Deux nonces distincts : la page est rendue à la requête, jamais servie prérendue.
    expect(second).not.toBe(premier);
    await verifierChargementPropre(page, chemin);
  });
}

test("une page 404 : scripts sous nonce, chargement sans violation", async ({
  page,
  request,
}) => {
  expect((await request.get("/page-inexistante")).status()).toBe(404);
  await verifierScriptsSousNonce(request, "/page-inexistante");
  // Seule erreur attendue : le statut 404 du document lui-même.
  await verifierChargementPropre(
    page,
    "/page-inexistante",
    /Failed to load resource: the server responded with a status of 404/,
  );
});

test("un script en ligne injecté sans nonce ne s'exécute pas", async ({
  page,
}) => {
  await ecouterViolations(page);
  await page.goto("/connexion");
  await attendreHydratation(page);
  // Le rejet éventuel de addScriptTag importe peu : seul compte que le script n'ait pas tourné.
  await page
    .addScriptTag({ content: "window.__brecheCsp = true" })
    .catch(() => undefined);
  expect(await page.evaluate(() => "__brecheCsp" in window)).toBe(false);
  await expect
    .poll(async () => (await violations(page)).join("\n"))
    .toMatch(/^script-src/m);
});
