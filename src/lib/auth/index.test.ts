import { afterEach, describe, expect, it, vi } from "vitest";

/** getAuth lit l'environnement : chaque test importe un module neuf après avoir posé ses variables. */
async function freshModule() {
  vi.resetModules();
  return import("./index");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAuth", () => {
  it("ne lit rien à l'import (le build n'a ni base ni secret)", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");
    await expect(freshModule()).resolves.toHaveProperty("getAuth");
  });

  it("refuse de construire l'instance sans secret", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgres://essai@127.0.0.1:1/essai");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const { getAuth } = await freshModule();
    expect(() => getAuth()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("construit l'instance une fois, sans se connecter", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgres://essai@127.0.0.1:1/essai");
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    const { getAuth } = await freshModule();
    const auth = getAuth();
    expect(getAuth()).toBe(auth);
    expect(auth.options.baseURL).toBe("http://localhost:3000");
  });
});
