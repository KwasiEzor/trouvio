import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { accounts, searchProfiles, users } from "../../../../db/schema";
import { applySeed, SeedAdminPromotionError } from "./apply";
import { parseSeedText, type SeedFile } from "./seed-file";

const EXEMPLE = parseSeedText(
  readFileSync(
    new URL("../../../../db/seed.example.json", import.meta.url),
    "utf8",
  ),
);

let t: TestDatabase;

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  // t reste indéfini si openTestDatabase a échoué (base injoignable) : ne pas masquer son message.
  await t?.close();
});
beforeEach(async () => {
  await resetData(t.db);
});

async function rows() {
  return t.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      updatedAt: users.updatedAt,
      threshold: searchProfiles.threshold,
      remoteModes: searchProfiles.remoteModes,
      channels: searchProfiles.channels,
      yearsExp: searchProfiles.yearsExp,
      minSalary: searchProfiles.minSalary,
    })
    .from(users)
    .innerJoin(searchProfiles, eq(searchProfiles.userId, users.id));
}

describe("applySeed", () => {
  it("crée l'utilisateur et son profil depuis l'exemple", async () => {
    expect(await applySeed(t.db, EXEMPLE)).toEqual({ created: 1, updated: 0 });
    expect(await rows()).toEqual([
      expect.objectContaining({
        email: "alex.martin@example.com",
        role: "admin",
        threshold: 60,
        remoteModes: ["hybrid", "remote"],
        channels: { telegram: { enabled: true }, email: { enabled: false } },
        yearsExp: 5,
      }),
    ]);
  });

  it("est idempotent : relancé, il garde le même utilisateur", async () => {
    await applySeed(t.db, EXEMPLE);
    const [avant] = await rows();
    expect(await applySeed(t.db, EXEMPLE)).toEqual({ created: 0, updated: 1 });
    const apres = await rows();
    expect(apres).toHaveLength(1);
    expect(apres[0]?.id).toBe(avant?.id);
  });

  it("met à jour le nom, le profil et updated_at d'un utilisateur existant", async () => {
    await applySeed(t.db, EXEMPLE);
    const [avant] = await rows();
    const [premier] = EXEMPLE.users;
    if (!premier) throw new Error("exemple vide");
    const modifie: SeedFile = {
      users: [
        {
          ...premier,
          name: "Alex Martin-Dupont",
          profile: {
            ...premier.profile,
            threshold: 75,
            yearsExp: undefined,
            minSalary: undefined,
          },
        },
      ],
    };
    await applySeed(t.db, modifie);
    const [apres] = await rows();
    expect(apres).toMatchObject({
      id: avant?.id,
      name: "Alex Martin-Dupont",
      threshold: 75,
      yearsExp: null,
      minSalary: null,
    });
    expect(apres?.updatedAt.getTime()).toBeGreaterThan(
      avant?.updatedAt.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it("n'écrit rien si un utilisateur du fichier échoue (transaction)", async () => {
    const [premier] = EXEMPLE.users;
    if (!premier) throw new Error("exemple vide");
    const invalide: SeedFile = {
      users: [
        premier,
        {
          ...premier,
          email: "second@example.com",
          profile: { ...premier.profile, threshold: 500 },
        },
      ],
    };
    await expect(applySeed(t.db, invalide)).rejects.toThrow();
    expect(await rows()).toEqual([]);
  });
});

// P1-06 (ADR 0017) : un tiers inscrit l'adresse de l'admin avant le seed, avec son mot de passe. Le
// seed ne doit jamais promouvoir cette ligne : le tiers deviendrait admin.
describe("garde de promotion admin", () => {
  const [ADMIN] = EXEMPLE.users;
  if (ADMIN?.role !== "admin")
    throw new Error("l'exemple doit porter un admin");
  const AUTRE = { ...ADMIN, email: "autre@example.com", role: "user" as const };

  async function inscrit(
    email: string,
    {
      role = "user",
      credential = true,
    }: { role?: "user" | "admin"; credential?: boolean } = {},
  ) {
    const [user] = await t.db
      .insert(users)
      .values({ email, name: "Tiers", role })
      .returning({ id: users.id });
    if (!user) throw new Error("insertion sans ligne");
    if (credential) {
      await t.db.insert(accounts).values({
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: "empreinte",
      });
    }
    return user.id;
  }

  it("refuse de promouvoir une ligne qui porte un mot de passe, sans rien écrire", async () => {
    await inscrit(ADMIN.email);
    const seed: SeedFile = { users: [AUTRE, ADMIN] };
    const refus = applySeed(t.db, seed);
    await expect(refus).rejects.toBeInstanceOf(SeedAdminPromotionError);
    await expect(refus).rejects.toMatchObject({ index: 1 });
    await expect(refus).rejects.not.toThrow(ADMIN.email);
    const tous = await t.db.select().from(users);
    expect(tous.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: ADMIN.email, role: "user" },
    ]);
    expect(await t.db.select().from(searchProfiles)).toEqual([]);
  });

  it("accepte une ligne déjà admin qui porte un mot de passe (seed relancé)", async () => {
    await inscrit(ADMIN.email, { role: "admin" });
    expect(await applySeed(t.db, EXEMPLE)).toEqual({ created: 0, updated: 1 });
  });

  it("promeut une ligne vérifiée par lien magique, sans mot de passe", async () => {
    await inscrit(ADMIN.email, { credential: false });
    await applySeed(t.db, EXEMPLE);
    expect((await rows())[0]).toMatchObject({
      email: ADMIN.email,
      role: "admin",
    });
  });

  it("accepte une entrée user sur une ligne qui porte un mot de passe", async () => {
    await inscrit(AUTRE.email);
    expect(await applySeed(t.db, { users: [AUTRE] })).toEqual({
      created: 0,
      updated: 1,
    });
  });
});
