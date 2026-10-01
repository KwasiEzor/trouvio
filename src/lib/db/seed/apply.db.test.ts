import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import { searchProfiles, users } from "../../../../db/schema";
import { applySeed } from "./apply";
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
