import type { Page } from "@playwright/test";

/**
 * Attend que React ait hydraté la page : le titre principal porte alors une clé interne
 * `__reactFiber…`. `goto` rend la main au `load`, souvent AVANT l'hydratation ; sans cette
 * attente, une exception ou un console.error survenant pendant l'hydratation échapperait
 * aux assertions. Limite constatée (P0-03) : en build de production, React 19 ne signale
 * PAS une incohérence de contenu serveur/client (aucun message, texte serveur conservé).
 */
export async function attendreHydratation(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const titre = document.querySelector("h1");
    return (
      titre !== null &&
      Object.keys(titre).some((cle) => cle.startsWith("__reactFiber"))
    );
  });
}
