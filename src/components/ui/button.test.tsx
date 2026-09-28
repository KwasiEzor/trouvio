import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("expose le rôle bouton et son libellé comme nom accessible", () => {
    render(<Button>Enregistrer</Button>);
    expect(
      screen.getByRole("button", { name: "Enregistrer" }),
    ).toBeInTheDocument();
  });

  it("ne déclenche rien quand il est désactivé", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enregistrer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    fireEvent.click(bouton);
    expect(bouton).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(["default", "outline", "ghost", "link"] as const)(
    "applique la variante %s",
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      expect(screen.getByRole("button", { name: "Action" })).toHaveAttribute(
        "data-variant",
        variant,
      );
    },
  );

  it.each(["default", "sm", "lg"] as const)("applique la taille %s", (size) => {
    render(<Button size={size}>Action</Button>);
    expect(screen.getByRole("button", { name: "Action" })).toHaveAttribute(
      "data-size",
      size,
    );
  });

  it("se rend comme un lien avec asChild, en gardant ses styles", () => {
    render(
      <Button asChild>
        <a href="/styleguide">Voir le guide</a>
      </Button>,
    );
    const lien = screen.getByRole("link", { name: "Voir le guide" });
    expect(lien).toHaveAttribute("href", "/styleguide");
    expect(lien).toHaveClass("bg-primary");
  });

  it("utilise la taille de texte du thème, remplaçable par className", () => {
    render(<Button className="text-body">Action</Button>);
    const bouton = screen.getByRole("button", { name: "Action" });
    expect(bouton).toHaveClass("text-body");
    expect(bouton).not.toHaveClass("text-label");
  });

  it("nomme un bouton icône par son aria-label", () => {
    render(
      <Button size="icon" aria-label="Rechercher">
        <svg aria-hidden="true" />
      </Button>,
    );
    expect(
      screen.getByRole("button", { name: "Rechercher" }),
    ).toBeInTheDocument();
  });

  it("montre un focus visible au clavier (contour, pas une ombre)", () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole("button", { name: "Action" })).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-ring",
    );
  });
});
