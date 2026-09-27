import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    // Attendre la fin du chargement et que la page soit rendue (hydratation comprise).
    await page.waitForLoadState("load");
    await expect(page.getByText("Elle trie. Tu décides.")).toBeVisible();

    expect(erreurs).toEqual([]);
  });
});
