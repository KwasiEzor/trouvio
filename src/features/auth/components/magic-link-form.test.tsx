import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_NOTICES } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";

import { MagicLinkForm } from "./magic-link-form";

const { signInMagicLink } = vi.hoisted(() => ({ signInMagicLink: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { magicLink: signInMagicLink } },
}));

function envoyer(email: string) {
  fireEvent.change(screen.getByLabelText("Adresse email"), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Recevoir un lien de connexion" }),
  );
}

beforeEach(() => {
  signInMagicLink.mockReset();
});

describe("MagicLinkForm (lien de connexion)", () => {
  it("expose un seul champ email nommé", () => {
    render(<MagicLinkForm />);
    expect(
      screen.getByRole("textbox", { name: "Adresse email" }),
    ).toHaveAttribute("autocomplete", "email");
    expect(screen.queryByLabelText("Mot de passe")).not.toBeInTheDocument();
  });

  it("affiche l'erreur de validation sans appeler le réseau", () => {
    render(<MagicLinkForm />);
    envoyer("pas-une-adresse");
    expect(screen.getByLabelText("Adresse email")).toHaveAccessibleDescription(
      "Adresse email invalide.",
    );
    expect(signInMagicLink).not.toHaveBeenCalled();
  });

  it("envoie la demande avec les chemins du code, puis ne montre que le message unique", async () => {
    signInMagicLink.mockResolvedValue({ data: { status: true }, error: null });
    render(<MagicLinkForm />);
    envoyer(" Ada@Example.com ");

    expect(await screen.findByRole("status")).toHaveTextContent(
      AUTH_NOTICES.magicLinkSent,
    );
    expect(signInMagicLink).toHaveBeenCalledWith({
      email: "ada@example.com",
      callbackURL: AUTH_PATHS.afterSignIn,
      errorCallbackURL: AUTH_PATHS.invalidLink,
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("affiche le message d'erreur de la liste fermée", async () => {
    signInMagicLink.mockResolvedValue({
      data: null,
      error: { status: 429, message: "détail interne" },
    });
    render(<MagicLinkForm />);
    envoyer("ada@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de tentatives. Réessaie dans un instant.",
    );
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    signInMagicLink.mockRejectedValue(new Error("réseau coupé"));
    render(<MagicLinkForm />);
    envoyer("ada@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
  });

  it("désactive le bouton pendant l'envoi", async () => {
    signInMagicLink.mockReturnValue(new Promise(() => {}));
    render(<MagicLinkForm />);
    envoyer("ada@example.com");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Recevoir un lien de connexion" }),
      ).toBeDisabled(),
    );
    // Second envoi (touche Entrée) pendant l'attente : ignoré.
    fireEvent.submit(screen.getByRole("form", { name: "Connexion par lien" }));
    expect(signInMagicLink).toHaveBeenCalledTimes(1);
  });
});
