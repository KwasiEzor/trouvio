import { z } from "zod";

import { USER_ROLES } from "@/lib/db/enums";

/**
 * Décision d'accès (P1-03, ADR 0014), pure : ni Next, ni base. Les helpers serveur
 * (src/lib/auth/guards.ts) l'appliquent à la session de la requête.
 *
 * Seul ce module fabrique un UserId : les requêtes scopées (ownedBy, src/lib/db/owned.ts)
 * exigent ce type, qu'un identifiant venu du client (chaîne brute) ne satisfait pas. Le cast
 * `as UserId` est refusé par ESLint hors des tests.
 */

const userIdSchema = z.uuid().brand<"UserId">();

export type UserId = z.infer<typeof userIdSchema>;
export type UserRole = (typeof USER_ROLES)[number];

/** DTO de l'utilisateur connecté : rien de la session (jeton, expiration), rien d'autre. */
export type CurrentUser = Readonly<{
  id: UserId;
  role: UserRole;
  email: string;
  name: string;
}>;

export type AccessNeed = "user" | "admin";

export type AccessDecision =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "unauthenticated" }
  // userId : journaliser le refus sans relire la session.
  | { ok: false; reason: "forbidden"; userId: UserId };

// Champs en trop ignorés ; emailVerified exigé en défense en profondeur (Better Auth n'ouvre de
// session qu'après vérification aujourd'hui, P1-06 pourrait changer le parcours).
const sessionSchema = z.object({
  user: z.object({
    id: userIdSchema,
    role: z.enum(USER_ROLES),
    email: z.string(),
    name: z.string(),
    emailVerified: z.literal(true),
  }),
});

/** Échec fermé : toute session absente ou mal formée vaut « non connecté ». */
export function decideAccess(
  session: unknown,
  need: AccessNeed,
): AccessDecision {
  const parsed = sessionSchema.safeParse(session);
  if (!parsed.success) return { ok: false, reason: "unauthenticated" };
  const { id, role, email, name } = parsed.data.user;
  if (need === "admin" && role !== "admin") {
    return { ok: false, reason: "forbidden", userId: id };
  }
  return { ok: true, user: { id, role, email, name } };
}

/** Identifiant de ressource reçu du client (chemin, corps) : validé avant toute requête. */
export const resourceIdSchema = z.uuid();
