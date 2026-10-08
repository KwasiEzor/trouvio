import { beforeEach, describe, expect, it, vi } from "vitest";

import { everythingLogged, fakeLogger } from "@/test/db/fake-logger";

const ALEX_ID = "4f1c2b8e-9a3d-4e6f-8b7a-1c2d3e4f5a6b";

const getSessionMock = vi.fn();
const log = fakeLogger();

// redirect et notFound de Next lèvent une exception : on les imite pour vérifier l'arrêt.
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}

vi.mock("./session", () => ({ getSession: () => getSessionMock() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new NotFound();
  },
}));
vi.mock("@/lib/logger", () => ({ logger: log }));

const { authorizeRoute, requireAdmin, requireUser } = await import("./guards");

function session(user: Record<string, unknown> = {}) {
  return {
    session: { id: "s", token: "jeton-de-session" },
    user: {
      id: ALEX_ID,
      email: "alex@example.com",
      name: "Alex",
      role: "user",
      emailVerified: true,
      ...user,
    },
  };
}

const ALEX = {
  id: ALEX_ID,
  role: "user",
  email: "alex@example.com",
  name: "Alex",
};

beforeEach(() => {
  getSessionMock.mockReset();
  log.warn.mockClear();
});

describe("requireUser", () => {
  it("redirige vers la connexion sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toEqual(new Redirect("/connexion"));
  });

  it("redirige vers le chemin de connexion demandé (lien invalide)", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(
      requireUser({ signInPath: "/connexion?erreur=lien" }),
    ).rejects.toEqual(new Redirect("/connexion?erreur=lien"));
  });

  it("redirige une session dont l'email n'est pas vérifié", async () => {
    getSessionMock.mockResolvedValue(session({ emailVerified: false }));
    await expect(requireUser()).rejects.toBeInstanceOf(Redirect);
  });

  it("rend l'utilisateur connecté, réduit au DTO", async () => {
    getSessionMock.mockResolvedValue(session());
    expect(await requireUser()).toEqual(ALEX);
  });

  it("relance une panne de lecture de session au lieu de déconnecter", async () => {
    const outage = new Error("base injoignable");
    getSessionMock.mockRejectedValue(outage);
    await expect(requireUser()).rejects.toBe(outage);
  });
});

describe("requireAdmin", () => {
  it("redirige vers la connexion sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toEqual(new Redirect("/connexion"));
  });

  it("répond 404 à un utilisateur et journalise son seul identifiant", async () => {
    getSessionMock.mockResolvedValue(session());
    await expect(requireAdmin()).rejects.toBeInstanceOf(NotFound);
    expect(log.warn).toHaveBeenCalledWith("accès admin refusé", {
      userId: ALEX_ID,
    });
    expect(everythingLogged(log)).not.toContain("alex@example.com");
  });

  it("rend l'admin", async () => {
    getSessionMock.mockResolvedValue(session({ role: "admin" }));
    expect(await requireAdmin()).toEqual({ ...ALEX, role: "admin" });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("authorizeRoute", () => {
  it("répond 401 sans session, sans mise en cache", async () => {
    getSessionMock.mockResolvedValue(null);
    const result = await authorizeRoute("user");
    if (result.ok) throw new Error("accès accordé à tort");
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(await result.response.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("répond 403 à un utilisateur sur une route admin", async () => {
    getSessionMock.mockResolvedValue(session());
    const result = await authorizeRoute("admin");
    if (result.ok) throw new Error("accès accordé à tort");
    expect(result.response.status).toBe(403);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(await result.response.json()).toEqual({ error: "FORBIDDEN" });
    expect(log.warn).toHaveBeenCalledWith("accès admin refusé", {
      userId: ALEX_ID,
    });
  });

  it("rend l'utilisateur quand l'accès est accordé", async () => {
    getSessionMock.mockResolvedValue(session());
    expect(await authorizeRoute("user")).toEqual({ ok: true, user: ALEX });
  });
});
