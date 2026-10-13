import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

describe("page introuvable", () => {
  it("annonce la page introuvable comme titre principal", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Page introuvable" }),
    ).toBeInTheDocument();
  });

  it("propose un lien vers l'accueil", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("link", { name: "Retour à l'accueil" }),
    ).toHaveAttribute("href", "/");
  });

  it("n'injecte aucun élément <style> (bloqué par la CSP à nonce)", () => {
    const { container } = render(<NotFound />);
    expect(container.querySelector("style")).toBeNull();
  });
});
