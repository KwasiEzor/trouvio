import { describe, expect, it } from "vitest";

import { authClient } from "./client";

describe("authClient", () => {
  it("expose l'inscription, les deux connexions et la déconnexion", () => {
    expect(typeof authClient.signUp.email).toBe("function");
    expect(typeof authClient.signIn.email).toBe("function");
    expect(typeof authClient.signIn.magicLink).toBe("function");
    expect(typeof authClient.signOut).toBe("function");
  });
});
