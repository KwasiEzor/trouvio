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

  test("ne sert aucune source map des scripts de la page", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const scripts = (
      await page
        .locator("script[src]")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLScriptElement).src),
        )
    ).filter((src) => new URL(src).pathname.startsWith("/_next/static/"));

    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      const reponse = await request.get(`${src}.map`);
      expect(reponse.status(), `${src}.map`).toBe(404);
    }
  });
});
