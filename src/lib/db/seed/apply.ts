import { sql } from "drizzle-orm";

import { searchProfiles, users } from "../../../../db/schema";
import type { Database } from "../client";
import type { SeedFile } from "./seed-file";

/**
 * Écrit les utilisateurs du seed et leurs profils, en une transaction : tout ou rien. Idempotent
 * (upsert sur users.email puis sur search_profiles.user_id). N'efface rien : un utilisateur retiré
 * du fichier reste en base.
 */
export async function applySeed(
  db: Database,
  seed: SeedFile,
): Promise<{ users: number; profiles: number }> {
  return db.transaction(async (tx) => {
    for (const { email, name, role, plan, profile } of seed.users) {
      const [user] = await tx
        .insert(users)
        .values({ email, name, role, plan })
        .onConflictDoUpdate({
          target: users.email,
          // $onUpdate ne couvre pas le set d'un upsert.
          set: { name, role, plan, updatedAt: sql`now()` },
        })
        .returning({ id: users.id });
      if (!user) throw new Error("upsert d'utilisateur sans ligne renvoyée");

      // Champs optionnels absents du fichier : remis à null, pas conservés.
      const row = {
        ...profile,
        yearsExp: profile.yearsExp ?? null,
        minSalary: profile.minSalary ?? null,
      };
      await tx
        .insert(searchProfiles)
        .values({ userId: user.id, ...row })
        .onConflictDoUpdate({
          target: searchProfiles.userId,
          set: { ...row, updatedAt: sql`now()` },
        });
    }
    return { users: seed.users.length, profiles: seed.users.length };
  });
}
