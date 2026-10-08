import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PATHS } from "@/features/auth/core/policy";

import { SignInForm } from "./sign-in-form";

const { signInEmail, push, refresh } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: signInEmail } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

function remplir(email: string, motDePasse: string) {
  fireEvent.change(screen.getByLabelText("Adresse email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: motDePasse },
  });
}

function envoyer() {
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

beforeEach(() => {
  signInEmail.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("SignInForm (connexion par mot de passe)", () => {
  it("expose deux champs nommés avec current-password, sans lien « Mot de passe oublié ? »", () => {
    render(<SignInForm />);
    expect(
      screen.getByRole("textbox", { name: "Adresse email" }),
    ).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.queryByText(/oublié/i)).not.toBeInTheDocument();
  });

  it("affiche les erreurs de validation sans appeler le réseau", () => {
    render(<SignInForm />);
    remplir("pas-une-adresse", "");
    envoyer();

    expect(screen.getByLabelText("Adresse email")).toHaveAccessibleDescription(
      "Adresse email invalide.",
    );
    expect(screen.getByLabelText("Mot de passe")).toHaveAccessibleDescription(
      "Indique ton mot de passe.",
    );
    expect(signInEmail).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("connecte puis navigue vers le fil", async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    render(<SignInForm />);
    remplir(" Ada@Example.com ", "un-mot-de-passe-long");
    envoyer();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/fil"));
    expect(refresh).toHaveBeenCalled();
    expect(signInEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "un-mot-de-passe-long",
      callbackURL: AUTH_PATHS.afterSignIn,
    });
  });

  it("affiche un seul message pour des identifiants refusés, sans naviguer", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
    });
    render(<SignInForm />);
    remplir("ada@example.com", "un-mot-de-passe-long");
    envoyer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email ou mot de passe incorrect.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    signInEmail.mockRejectedValue(new Error("réseau coupé"));
    render(<SignInForm />);
    remplir("ada@example.com", "un-mot-de-passe-long");
    envoyer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
  });

  it("désactive le bouton pendant l'envoi", async () => {
    signInEmail.mockReturnValue(new Promise(() => {}));
    render(<SignInForm />);
    remplir("ada@example.com", "un-mot-de-passe-long");
    envoyer();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Se connecter" }),
      ).toBeDisabled(),
    );
    // Second envoi (touche Entrée) pendant l'attente : ignoré.
    fireEvent.submit(
      screen.getByRole("form", { name: "Connexion avec ton mot de passe" }),
    );
    expect(signInEmail).toHaveBeenCalledTimes(1);
  });
});
