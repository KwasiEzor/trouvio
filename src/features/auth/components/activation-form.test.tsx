import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_NOTICES } from "@/features/auth/core/messages";
import { AUTH_PATHS } from "@/features/auth/core/policy";

import { ActivationForm } from "./activation-form";

const { fetchMock, signInMagicLink, push, refresh } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  signInMagicLink: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { $fetch: fetchMock, signIn: { magicLink: signInMagicLink } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const TOKEN = "jeton.signe-d_activation";
const EMAIL = "ada@example.com";
const MOT_DE_PASSE = "un-mot-de-passe-long";

function envoyer(motDePasse = MOT_DE_PASSE) {
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: motDePasse },
  });
  fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  signInMagicLink.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("ActivationForm (activation par mot de passe)", () => {
  it("affiche l'adresse du compte et un champ mot de passe nommé", () => {
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(
      screen.getByRole("button", { name: "Activer mon compte" }),
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("n'appelle pas le réseau sans mot de passe", () => {
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer("");
    expect(screen.getByLabelText("Mot de passe")).toHaveAccessibleDescription(
      "Indique ton mot de passe.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie le jeton et le mot de passe en POST, puis navigue vers le fil", async () => {
    fetchMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(AUTH_PATHS.afterSignIn),
    );
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/verify-email/confirm", {
      method: "POST",
      body: { token: TOKEN, password: MOT_DE_PASSE },
    });
  });

  it("bloque le double envoi pendant l'attente", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Activer mon compte" }),
      ).toBeDisabled(),
    );
    fireEvent.submit(
      screen.getByRole("form", { name: "Activation de ton compte" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("après un mauvais mot de passe : alerte, aide et bouton de secours", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: {
        code: "INVALID_PASSWORD",
        status: 401,
        message: "détail interne",
      },
    });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce n'est pas le mot de passe choisi à l'inscription.",
    );
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Ce n'est pas toi qui as créé ce compte, ou tu as oublié ton mot de passe ?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "M'envoyer un lien de connexion" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Activer mon compte" }),
    ).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("n'affiche pas l'aide pour une autre erreur", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", status: 400 },
    });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce lien n'est plus valable. Demande-en un nouveau.",
    );
    expect(
      screen.queryByRole("button", { name: "M'envoyer un lien de connexion" }),
    ).not.toBeInTheDocument();
  });

  it("affiche le texte du limiteur (429) et du verrou par compte", async () => {
    fetchMock.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de tentatives. Réessaie dans un instant.",
    );

    fetchMock.mockResolvedValueOnce({
      data: null,
      error: { code: "TOO_MANY_ATTEMPTS", status: 429 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activer mon compte" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Trop de tentatives sur ce compte.",
      ),
    );
  });

  // Verrou posé par un tiers sur le seau partagé : le titulaire doit garder le lien de secours.
  it("propose le lien de connexion quand le compte est verrouillé", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "TOO_MANY_ATTEMPTS", status: 429 },
    });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    expect(
      await screen.findByRole("button", {
        name: "M'envoyer un lien de connexion",
      }),
    ).toBeInTheDocument();
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    fetchMock.mockRejectedValue(new Error("réseau coupé"));
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
    expect(
      screen.getByRole("button", { name: "Activer mon compte" }),
    ).toBeEnabled();
  });

  it("le secours envoie un lien de connexion à l'adresse du jeton, sans callbackURL", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 401 },
    });
    signInMagicLink.mockResolvedValue({ data: { status: true }, error: null });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "M'envoyer un lien de connexion",
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      AUTH_NOTICES.magicLinkSent,
    );
    expect(signInMagicLink).toHaveBeenCalledTimes(1);
    expect(signInMagicLink).toHaveBeenCalledWith({ email: EMAIL });
    expect(
      screen.queryByRole("button", { name: "M'envoyer un lien de connexion" }),
    ).not.toBeInTheDocument();
  });

  it("le secours affiche une erreur de la liste fermée et reste possible", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 401 },
    });
    signInMagicLink.mockResolvedValue({
      data: null,
      error: { status: 429, message: "détail interne" },
    });
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "M'envoyer un lien de connexion",
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Trop de tentatives. Réessaie dans un instant.",
      ),
    );
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "M'envoyer un lien de connexion" }),
    ).toBeEnabled();
  });

  it("le secours traite une panne réseau comme une erreur générique", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 401 },
    });
    signInMagicLink.mockRejectedValue(new Error("réseau coupé"));
    render(<ActivationForm token={TOKEN} email={EMAIL} />);
    envoyer();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "M'envoyer un lien de connexion",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Une erreur est survenue.",
      ),
    );
  });
});
