import { expect, it } from "vitest";

// Démonstration P0-04 : test volontairement rouge. NE PAS FUSIONNER.
it("échoue volontairement pour prouver que la CI bloque", () => {
  expect(1 + 1).toBe(3);
});
