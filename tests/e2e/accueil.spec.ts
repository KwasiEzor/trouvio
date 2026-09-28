import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import tokens from "../../docs/design/tokens.json";
import { attendreHydratation } from "./helpers";

test.describe("page d'accueil (build de production)", () => {
  test("affiche la promesse en français", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Trouvio");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("heading", { level: 1, name: "Trouvio" }),
    ).toBeVisible();
    await expect(page.getByText("Elle trie. Tu décides.")).toBeVisible();
  });

  test("applique la charte : fond surface, titre en Poppins, icône d'application", async ({
    page,
  }) => {
    const surface =
      tokens.color.tokens.find((token) => token.name === "surface")?.value
        .light ?? "";
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(surface.slice(i, i + 2), 16),
    );

    await page.goto("/");

    const fond = await page
      .locator("body")
      .evaluate((body) => getComputedStyle(body).backgroundColor);
    expect(fond).toBe(`rgb(${r}, ${g}, ${b})`);
    const police = await page
      .getByRole("heading", { level: 1 })
      .evaluate((titre) => getComputedStyle(titre).fontFamily);
    expect(police).toMatch(/Poppins/);
    await expect(
      page.locator('link[rel="icon"][type="image/svg+xml"]'),
    ).toHaveCount(1);
  });

  test("ne présente aucun défaut d'accessibilité WCAG A/AA détectable", async ({
    page,
  }) => {
    await page.goto("/");

    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(resultats.violations).toEqual([]);
  });

  test("se charge sans erreur dans la console ni exception", async ({
    page,
  }) => {
    const erreurs: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") erreurs.push(message.text());
    });
    page.on("pageerror", (error) => erreurs.push(error.message));

    await page.goto("/");
    await attendreHydratation(page);

    expect(erreurs).toEqual([]);
  });
});
