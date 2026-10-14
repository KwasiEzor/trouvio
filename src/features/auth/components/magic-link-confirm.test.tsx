import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PATHS } from "@/features/auth/core/policy";

import { MagicLinkConfirm } from "./magic-link-confirm";

const { fetchMock, push, refresh } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { $fetch: fetchMock } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEF";
const EMAIL = "ada@example.com";

function cliquer() {
  fireEvent.click(screen.getByRole("button", { name: "Me connecter" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("MagicLinkConfirm (confirmation du lien de connexion)", () => {
  it("annonce le compte visé et n'appelle rien au rendu", () => {
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    expect(
      screen.getByRole("form", { name: "Confirmation de la connexion" }),
    ).toHaveTextContent(`Tu vas te connecter à Trouvio en tant que ${EMAIL}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un clic envoie un seul POST, puis navigue vers le fil", async () => {
    fetchMock.mockResolvedValue({ data: { status: true }, error: null });
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    cliquer();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(AUTH_PATHS.afterSignIn),
    );
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/magic-link/confirm", {
      method: "POST",
      body: { token: TOKEN },
    });
  });

  it("bloque le double clic pendant l'attente", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    cliquer();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Me connecter" }),
      ).toBeDisabled(),
    );
    fireEvent.submit(
      screen.getByRole("form", { name: "Confirmation de la connexion" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un jeton refusé affiche « Ce lien n'est plus valable » sans naviguer", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", status: 400, message: "détail interne" },
    });
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    cliquer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce lien n'est plus valable. Demande-en un nouveau.",
    );
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("affiche le texte du limiteur (429)", async () => {
    fetchMock.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    cliquer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de tentatives. Réessaie dans un instant.",
    );
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    fetchMock.mockRejectedValue(new Error("réseau coupé"));
    render(<MagicLinkConfirm email={EMAIL} token={TOKEN} />);
    cliquer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
    expect(screen.getByRole("button", { name: "Me connecter" })).toBeEnabled();
  });
});
