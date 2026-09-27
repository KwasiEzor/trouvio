import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("page d'accueil", () => {
  it("affiche le nom du produit comme titre principal", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Trouvio" }),
    ).toBeInTheDocument();
  });

  it("affiche la promesse « Elle trie. Tu décides. »", () => {
    render(<Home />);
    expect(screen.getByText("Elle trie. Tu décides.")).toBeInTheDocument();
  });
});
