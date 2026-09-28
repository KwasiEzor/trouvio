import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn (fusion des classes Tailwind)", () => {
  it("assemble les classes conditionnelles et garde la dernière en conflit", () => {
    expect(cn("px-2", false, "px-4")).toBe("px-4");
  });

  it("garde une taille de texte du thème à côté d'une couleur de texte", () => {
    expect(cn("text-label", "text-primary-foreground")).toBe(
      "text-label text-primary-foreground",
    );
  });

  it("remplace une taille de texte du thème par une autre", () => {
    expect(cn("text-body", "text-label")).toBe("text-label");
  });

  it("remplace une couleur de fond par une autre", () => {
    expect(cn("bg-primary", "bg-accent")).toBe("bg-accent");
  });
});
