import { captureException } from "@sentry/nextjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalError from "./global-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// next/font n'existe qu'avec le compilateur Next (vérifié en E2E par la police des titres).
vi.mock("./fonts", () => ({
  poppins: { variable: "police-poppins" },
  workSans: { variable: "police-work-sans" },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("GlobalError (erreur de rendu à la racine)", () => {
  it("signale à Sentry une erreur née dans le navigateur", () => {
    const erreur = new Error("rendu impossible");
    render(<GlobalError error={erreur} reset={() => {}} />, {
      container: document,
    });
    expect(captureException).toHaveBeenCalledWith(erreur);
  });

  it("ne signale pas une seconde fois une erreur serveur (digest, déjà capturée par onRequestError)", () => {
    const erreur = Object.assign(new Error("rendu impossible"), {
      digest: "d1",
    });
    render(<GlobalError error={erreur} reset={() => {}} />, {
      container: document,
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("affiche un message en français, sans détail technique", () => {
    render(
      <GlobalError error={new Error("SENTINELLE interne")} reset={() => {}} />,
      { container: document },
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /quelque chose a coincé/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("SENTINELLE");
    expect(document.documentElement).toHaveAttribute("lang", "fr");
  });

  it("propose de réessayer", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("x")} reset={reset} />, {
      container: document,
    });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
