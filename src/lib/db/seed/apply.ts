import { sql } from "drizzle-orm";

import { searchProfiles, users } from "../../../../db/schema";
import type { Database } from "../client";
import type { SeedFile } from "./seed-file";

/**
 * Écrit les utilisateurs du seed et leurs profils, en une transaction : tout ou rien. Idempotent
 * (upsert sur users.email puis sur search_profiles.user_id). N'efface rien : un utilisateur retiré
 * du fichier reste en base. Compte à part les comptes modifiés : sur une base réelle, l'upsert
 * écrase nom, rôle, plan et profil d'un compte existant au même email.
 */
export async function applySeed(
  db: Database,
  seed: SeedFile,
): Promise<{ created: number; updated: number }> {
  return db.transaction(async (tx) => {
    let created = 0;
    for (const { email, name, role, plan, profile } of seed.users) {
      const [user] = await tx
        .insert(users)
        .values({ email, name, role, plan })
        .onConflictDoUpdate({
          target: users.email,
          // $onUpdate ne couvre pas le set d'un upsert.
          set: { name, role, plan, updatedAt: sql`now()` },
        })
        // xmax = 0 : ligne insérée par cette requête, et non mise à jour (Postgres).
        .returning({ id: users.id, inserted: sql<boolean>`(xmax = 0)` });
      if (!user) throw new Error("upsert d'utilisateur sans ligne renvoyée");
      if (user.inserted) created += 1;

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
    return { created, updated: seed.users.length - created };
  });
}
