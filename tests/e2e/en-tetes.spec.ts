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
 * Requêtes de page sans cookie : aucune lecture de session. /api/auth/ok compte dans le limiteur,
 * sur une IP propre à ce fichier.
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

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.252" } });

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

test("une 404 hors du proxy (/brand/…) porte une CSP qui n'autorise aucun script", async ({
  request,
}) => {
  const reponse = await request.get("/brand/inexistant");
  expect(reponse.status()).toBe(404);
  expect(reponse.headers()["content-security-policy"]).toBe(
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
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
  await verifierChargementPropre(page, "/page-inexistante", {
    documentEn404: true,
  });
});

test("un script en ligne injecté dans le HTML, sans nonce, ne s'exécute pas", async ({
  page,
}) => {
  // XSS réaliste : la réponse du serveur (en-têtes et CSP intacts) porte un <script> en ligne, lu
  // par le parseur. Un script créé par l'outillage de Playwright (addScriptTag) n'en serait pas
  // un : 'strict-dynamic' fait confiance aux scripts insérés par un script de confiance.
  await page.route("**/connexion", async (route) => {
    const reponse = await route.fetch();
    const html = (await reponse.text()).replace(
      "</body>",
      "<script>window.__brecheCsp = true</script></body>",
    );
    expect(html).toContain("__brecheCsp");
    await route.fulfill({ response: reponse, body: html });
  });
  await ecouterViolations(page);
  await page.goto("/connexion");
  await attendreHydratation(page);
  expect(await page.evaluate(() => "__brecheCsp" in window)).toBe(false);
  await expect
    .poll(async () => (await violations(page)).join("\n"))
    .toMatch(/^script-src/m);
});
