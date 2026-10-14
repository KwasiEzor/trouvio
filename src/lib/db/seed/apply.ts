import { and, eq, sql } from "drizzle-orm";

import { accounts, searchProfiles, users } from "../../../../db/schema";
import type { Database } from "../client";
import type { SeedFile } from "./seed-file";

/**
 * Écrit les utilisateurs du seed et leurs profils, en une transaction : tout ou rien. Idempotent
 * (upsert sur users.email puis sur search_profiles.user_id). N'efface rien : un utilisateur retiré
 * du fichier reste en base. Compte à part les comptes modifiés : sur une base réelle, l'upsert
 * écrase nom, rôle, plan et profil d'un compte existant au même email.
 *
 * Garde (P1-06, ADR 0017) : jamais de promotion admin d'une ligne qui porte un mot de passe
 * (compte credential) que le seed n'a pas créé ; un tiers aurait pu inscrire l'adresse de l'admin
 * avant le seed. Une ligne déjà admin et vérifiée est acceptée (seed relancé, idempotent) : la
 * vérification exige ce mot de passe ou le lien magique, qui l'aurait supprimé (ADR 0017). Une ligne
 * admin non vérifiée qui porte un mot de passe est refusée : l'inscription écrit users puis
 * accounts sans transaction, le seed a pu la promouvoir entre les deux.
 */

/** Refus de la garde : l'index de l'entrée seulement, jamais l'adresse (journaux). */
export class SeedAdminPromotionError extends Error {
  constructor(readonly index: number) {
    super(
      `entrée ${index} : promotion admin refusée, la ligne porte un mot de passe que le seed n'a pas créé`,
    );
    this.name = "SeedAdminPromotionError";
  }
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Ligne existante à cet email, verrouillée jusqu'à la fin de la transaction. */
async function lockedUser(tx: Transaction, email: string) {
  const [row] = await tx
    .select({
      id: users.id,
      role: users.role,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, email))
    .for("update");
  return row;
}

async function hasCredential(tx: Transaction, userId: string) {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
    )
    .limit(1);
  return row !== undefined;
}
export async function applySeed(
  db: Database,
  seed: SeedFile,
): Promise<{ created: number; updated: number }> {
  return db.transaction(async (tx) => {
    let created = 0;
    for (const [
      index,
      { email, name, role, plan, profile },
    ] of seed.users.entries()) {
      const existing =
        role === "admin" ? await lockedUser(tx, email) : undefined;
      if (
        existing !== undefined &&
        !(existing.role === "admin" && existing.emailVerified) &&
        (await hasCredential(tx, existing.id))
      ) {
        throw new SeedAdminPromotionError(index);
      }

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
      // Ligne insérée entre la lecture et l'upsert (inscription concurrente) : non vérifiée, refus.
      if (role === "admin" && existing === undefined && !user.inserted) {
        throw new SeedAdminPromotionError(index);
      }
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
