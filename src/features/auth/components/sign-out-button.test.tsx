import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "./sign-out-button";

const { signOut, push, refresh } = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

function cliquer() {
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
}

beforeEach(() => {
  signOut.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("SignOutButton (déconnexion)", () => {
  it("déconnecte puis navigue vers la page de connexion", async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    render(<SignOutButton />);
    cliquer();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/connexion"));
    expect(refresh).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("reste sur la page et affiche une erreur si la déconnexion échoue", async () => {
    signOut.mockResolvedValue({ data: null, error: { status: 500 } });
    render(<SignOutButton />);
    cliquer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Se déconnecter" }),
    ).toBeEnabled();
  });

  it("traite une panne réseau comme une erreur générique", async () => {
    signOut.mockRejectedValue(new Error("réseau coupé"));
    render(<SignOutButton />);
    cliquer();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("désactive le bouton pendant la déconnexion", async () => {
    signOut.mockReturnValue(new Promise(() => {}));
    render(<SignOutButton />);
    cliquer();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Se déconnecter" }),
      ).toBeDisabled(),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
