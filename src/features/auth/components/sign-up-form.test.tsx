import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_NOTICES } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";

import { SignUpForm } from "./sign-up-form";

const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

const MOT_DE_PASSE = "un-mot-de-passe-long";

function remplir(nom: string, email: string, motDePasse: string) {
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: nom } });
  fireEvent.change(screen.getByLabelText("Adresse email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: motDePasse },
  });
}

function envoyer() {
  fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
}

beforeEach(() => {
  signUpEmail.mockReset();
});

describe("SignUpForm (inscription)", () => {
  it("expose trois champs nommés, avec les bons autocomplete, et l'aide sur la longueur", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(
      screen.getByRole("textbox", { name: "Adresse email" }),
    ).toHaveAttribute("autocomplete", "email");
    const motDePasse = screen.getByLabelText("Mot de passe");
    expect(motDePasse).toHaveAttribute("type", "password");
    expect(motDePasse).toHaveAttribute("autocomplete", "new-password");
    expect(motDePasse).toHaveAccessibleDescription("12 caractères minimum");
  });

  it("affiche les erreurs par champ sans appeler le réseau", () => {
    render(<SignUpForm />);
    remplir("", "pas-une-adresse", "court");
    envoyer();

    expect(screen.getByLabelText("Nom")).toBeInvalid();
    expect(screen.getByLabelText("Nom")).toHaveAccessibleDescription(
      "Indique ton nom.",
    );
    expect(screen.getByLabelText("Adresse email")).toHaveAccessibleDescription(
      "Adresse email invalide.",
    );
    expect(screen.getByLabelText("Mot de passe")).toHaveAccessibleDescription(
      "12 caractères minimum 12 caractères au minimum.",
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("place le focus sur le premier champ en erreur", () => {
    render(<SignUpForm />);
    remplir("", "a@example.com", MOT_DE_PASSE);
    envoyer();
    expect(screen.getByLabelText("Nom")).toHaveFocus();
  });

  it("envoie des valeurs nettoyées avec le callbackURL du code, puis ne montre que le message unique", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });
    render(<SignUpForm />);
    remplir("  Ada  ", " Ada@Example.com ", MOT_DE_PASSE);
    envoyer();

    expect(await screen.findByRole("status")).toHaveTextContent(
      AUTH_NOTICES.signUpSent,
    );
    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: MOT_DE_PASSE,
      callbackURL: AUTH_PATHS.afterSignIn,
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nom")).not.toBeInTheDocument();
  });

  it("affiche le message d'erreur de la liste fermée, jamais le texte du serveur", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: "INCONNU", status: 500, message: "détail interne" },
    });
    render(<SignUpForm />);
    remplir("Ada", "ada@example.com", MOT_DE_PASSE);
    envoyer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue. Réessaie dans un instant.",
    );
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Créer mon compte" }),
    ).toBeEnabled();
  });

  it("affiche le message de limitation sur une réponse 429", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<SignUpForm />);
    remplir("Ada", "ada@example.com", MOT_DE_PASSE);
    envoyer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de tentatives.",
    );
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    signUpEmail.mockRejectedValue(new Error("réseau coupé"));
    render(<SignUpForm />);
    remplir("Ada", "ada@example.com", MOT_DE_PASSE);
    envoyer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
  });

  it("désactive le bouton pendant l'envoi et ne l'envoie qu'une fois", async () => {
    let terminer: (valeur: unknown) => void = () => {};
    signUpEmail.mockReturnValue(
      new Promise((resolve) => {
        terminer = resolve;
      }),
    );
    render(<SignUpForm />);
    remplir("Ada", "ada@example.com", MOT_DE_PASSE);
    envoyer();

    const bouton = screen.getByRole("button", { name: "Créer mon compte" });
    await waitFor(() => expect(bouton).toBeDisabled());
    fireEvent.submit(bouton.closest("form") as HTMLFormElement);
    expect(signUpEmail).toHaveBeenCalledTimes(1);

    terminer({ data: {}, error: null });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
