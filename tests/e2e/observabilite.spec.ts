import { expect, test } from "@playwright/test";

import { attendreHydratation } from "./helpers";

// Build de production SANS DSN (playwright.config.ts force SENTRY_DSN vide) : Sentry ne doit
// rien envoyer, et le build ne doit publier aucune source map (plan P0-06, D6).
test.describe("observabilité (build de production, sans DSN)", () => {
  test("n'envoie aucune requête à Sentry", async ({ page }) => {
    const versSentry: string[] = [];
    page.on("request", (requete) => {
      const hote = new URL(requete.url()).hostname;
      if (hote === "sentry.io" || hote.endsWith(".sentry.io"))
        versSentry.push(requete.url());
    });

    for (const chemin of ["/", "/styleguide"] as const) {
      await page.goto(chemin);
      await attendreHydratation(page);
    }
    expect(versSentry).toEqual([]);
  });

  // Turbopack nomme la map autrement que le script (« a.js » → « b.js.map ») : seule la
  // référence sourceMappingURL fait foi. Tous les scripts reçus comptent, dynamiques compris.
  test("ne publie aucune source map pour les scripts chargés", async ({
    page,
    request,
  }) => {
    const scripts: string[] = [];
    page.on("response", (reponse) => {
      const url = new URL(reponse.url());
      if (
        url.pathname.startsWith("/_next/static/") &&
        url.pathname.endsWith(".js")
      )
        scripts.push(reponse.url());
    });
    await page.goto("/");
    await attendreHydratation(page);

    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      const code = await (await request.get(src)).text();
      const reference = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code)?.[1];
      expect(reference, `${src} référence une source map`).toBeUndefined();
      const map = await request.get(`${src}.map`);
      expect(map.status(), `${src}.map`).toBe(404);
    }
  });
});
