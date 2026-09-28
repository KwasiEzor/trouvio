import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import tokens from "../../docs/design/tokens.json";
import { attendreHydratation } from "./helpers";

const couleurs = tokens.color.tokens;
const styles = tokens.type.groups.flatMap((groupe) => groupe.styles);

test.describe("guide de style (build de production)", () => {
  test("présente chaque couleur de la charte avec son nom et sa valeur", async ({
    page,
  }) => {
    await page.goto("/styleguide");

    await expect(page).toHaveTitle("Guide de style — Trouvio");
    await expect(
      page.getByRole("heading", { level: 1, name: "Guide de style" }),
    ).toBeVisible();
    await expect(page.getByTestId("nuancier")).toHaveCount(couleurs.length);
    for (const { name, value } of couleurs) {
      const nuancier = page
        .getByTestId("nuancier")
        .filter({ hasText: name })
        .first();
      await expect(nuancier).toContainText(value.light);
    }
  });

  test("présente chaque style de texte et les boutons, dont un désactivé", async ({
    page,
  }) => {
    await page.goto("/styleguide");

    await expect(page.getByTestId("echantillon-texte")).toHaveCount(
      styles.length,
    );
    await expect(
      page.getByRole("button", { name: "Bouton principal" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Désactivé" }),
    ).toBeDisabled();
  });

  test("n'est pas indexée par les moteurs de recherche", async ({ page }) => {
    await page.goto("/styleguide");
    // Garde : sans elle, le test passerait sur la page 404 (noindex et accessible par défaut).
    await expect(
      page.getByRole("heading", { level: 1, name: "Guide de style" }),
    ).toBeVisible();

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("montre un focus clavier visible (contour d'au moins 2 px)", async ({
    page,
  }) => {
    await page.goto("/styleguide");
    await attendreHydratation(page);

    const bouton = page
      .getByRole("button", { name: "Bouton principal" })
      .first();
    await bouton.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");

    await expect(bouton).toBeFocused();
    const contour = await bouton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        largeur: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(contour.style).not.toBe("none");
    expect(contour.largeur).toBeGreaterThanOrEqual(2);
  });

  test("affiche les logos avec un texte alternatif", async ({ page }) => {
    await page.goto("/styleguide");

    const logos = page.getByTestId("logo");
    await expect(logos).not.toHaveCount(0);
    for (const logo of await logos.all()) {
      await expect(logo).toHaveAttribute("alt", /\S/);
      expect(
        await logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      ).toBeGreaterThan(0);
    }
  });

  test("charge Poppins et Work Sans sans aucune requête vers Google", async ({
    page,
  }) => {
    const hotesGoogle = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
    const requetesGoogle: string[] = [];
    page.on("request", (requete) => {
      if (hotesGoogle.has(new URL(requete.url()).hostname))
        requetesGoogle.push(requete.url());
    });

    await page.goto("/styleguide");
    const familles = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((font) => font.status === "loaded")
        .map((font) => font.family);
    });
    const titre = await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily);

    expect(familles.join(" ")).toMatch(/Poppins/);
    expect(familles.join(" ")).toMatch(/Work Sans/);
    expect(titre).toMatch(/Poppins/);
    expect(requetesGoogle).toEqual([]);
  });

  test("ne présente aucun défaut d'accessibilité WCAG A/AA détectable", async ({
    page,
  }) => {
    await page.goto("/styleguide");
    // Garde : sans elle, le test passerait sur la page 404 (noindex et accessible par défaut).
    await expect(
      page.getByRole("heading", { level: 1, name: "Guide de style" }),
    ).toBeVisible();

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

    await page.goto("/styleguide");
    await attendreHydratation(page);

    expect(erreurs).toEqual([]);
  });
});
