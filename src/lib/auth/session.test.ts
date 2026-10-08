import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers({ cookie: "better-auth.session_token=x" });
const getSessionApi = vi.fn();
const headersMock = vi.fn(() => Promise.resolve(requestHeaders));
const getAuthMock = vi.fn(() => ({ api: { getSession: getSessionApi } }));

vi.mock("next/headers", () => ({ headers: () => headersMock() }));
vi.mock("./index", () => ({ getAuth: () => getAuthMock() }));

const { getSession } = await import("./session");

beforeEach(() => {
  getSessionApi.mockReset();
  getAuthMock.mockClear();
  headersMock.mockImplementation(() => Promise.resolve(requestHeaders));
});

describe("getSession", () => {
  it("transmet les en-têtes de la requête à Better Auth", async () => {
    getSessionApi.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
    expect(getSessionApi).toHaveBeenCalledWith({ headers: requestHeaders });
  });

  it("rend la session avec le rôle", async () => {
    const session = {
      user: { id: "u", email: "alex@example.com", role: "admin" },
      session: { id: "s" },
    };
    getSessionApi.mockResolvedValue(session);
    expect(await getSession()).toBe(session);
  });

  it("lit les en-têtes avant l'instance : au build, headers() rend la page dynamique sans lire base ni secret", async () => {
    // Pendant le pré-rendu, headers() interrompt le rendu statique. getAuth() lirait DATABASE_URL.
    const prerender = new Error("rendu dynamique requis");
    headersMock.mockImplementation(() => Promise.reject(prerender));
    await expect(getSession()).rejects.toBe(prerender);
    expect(getAuthMock).not.toHaveBeenCalled();
  });
});
