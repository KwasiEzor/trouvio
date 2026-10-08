import { describe, expect, it } from "vitest";

import { decideAccess, resourceIdSchema } from "./access";

const ALEX_ID = "4f1c2b8e-9a3d-4e6f-8b7a-1c2d3e4f5a6b";

function session(user: Record<string, unknown> = {}) {
  return {
    session: { id: "s", token: "jeton-de-session", userId: ALEX_ID },
    user: {
      id: ALEX_ID,
      email: "alex@example.com",
      name: "Alex",
      role: "user",
      emailVerified: true,
      image: "https://example.com/alex.png",
      plan: "free",
      ...user,
    },
  };
}

describe("decideAccess", () => {
  it.each([null, undefined])("refuse une session absente (%s)", (value) => {
    expect(decideAccess(value, "user")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("accepte un utilisateur vérifié et ne garde que id, rôle, email et nom", () => {
    expect(decideAccess(session(), "user")).toEqual({
      ok: true,
      user: {
        id: ALEX_ID,
        role: "user",
        email: "alex@example.com",
        name: "Alex",
      },
    });
  });

  it("refuse le besoin admin à un utilisateur", () => {
    expect(decideAccess(session(), "admin")).toEqual({
      ok: false,
      reason: "forbidden",
      userId: ALEX_ID,
    });
  });

  it.each(["user", "admin"] as const)(
    "accepte un admin pour le besoin %s",
    (need) => {
      const decision = decideAccess(session({ role: "admin" }), need);
      expect(decision).toMatchObject({ ok: true, user: { role: "admin" } });
    },
  );

  it.each([
    ["email non vérifié", { emailVerified: false }],
    ["id qui n'est pas un uuid", { id: "1" }],
    ["rôle inconnu", { role: "superadmin" }],
    ["rôle absent", { role: undefined }],
  ])("refuse en échec fermé : %s", (_label, user) => {
    expect(decideAccess(session(user), "user")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("refuse une session sans utilisateur", () => {
    expect(decideAccess({ session: { id: "s" } }, "user")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("ignore un rôle posé hors de l'utilisateur", () => {
    const forged = { ...session(), role: "admin" };
    expect(decideAccess(forged, "admin")).toEqual({
      ok: false,
      reason: "forbidden",
      userId: ALEX_ID,
    });
  });
});

describe("resourceIdSchema", () => {
  it("accepte un uuid", () => {
    expect(resourceIdSchema.safeParse(ALEX_ID).success).toBe(true);
  });

  it.each(["", "1", "' or 1=1 --", ALEX_ID.slice(0, -1), `{${ALEX_ID}}`])(
    "refuse %j",
    (value) => {
      expect(resourceIdSchema.safeParse(value).success).toBe(false);
    },
  );
});
