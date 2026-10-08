import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers({ cookie: "better-auth.session_token=x" });
const getSessionApi = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestHeaders),
}));
vi.mock("./index", () => ({
  getAuth: () => ({ api: { getSession: getSessionApi } }),
}));

const { getSession } = await import("./session");

beforeEach(() => {
  getSessionApi.mockReset();
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
});
