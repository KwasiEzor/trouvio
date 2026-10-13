/**
 * Limitation de débit (P1-04, ADR 0015) : compteurs à fenêtre fixe, clés pseudonymisées, un seul
 * magasin (Postgres) pour toutes les portées.
 */

export type RateLimitRule = {
  readonly windowSeconds: number;
  readonly max: number;
};

export type ConsumeResult = {
  readonly allowed: boolean;
  /** Secondes avant la fin de la fenêtre qui refuse ; null si la requête est acceptée. */
  readonly retryAfterSeconds: number | null;
};

/** Ce qui est compté : IP et chemin d'auth, compte visé par une connexion, destinataire d'email. */
export type RateLimitScope =
  "auth-ip" | "sign-in-account" | "auth-email-recipient";

export type RateLimitEntry = {
  /** Empreinte HMAC (keys.ts), jamais le sujet en clair. */
  readonly key: string;
  readonly rule: RateLimitRule;
};

export interface RateLimitStore {
  /** Incrémente chaque compteur en une opération atomique ; résultats dans l'ordre des entrées. */
  consume(
    entries: readonly RateLimitEntry[],
    now: Date,
  ): Promise<readonly ConsumeResult[]>;
  /** Supprime au plus `batchSize` compteurs expirés ; rend le nombre supprimé. */
  purgeExpired(now: Date, batchSize: number): Promise<number>;
}

export type RateLimiter = {
  /** Compte une requête pour `subject` sous chaque règle ; refuse si une seule règle refuse. */
  consume(
    scope: RateLimitScope,
    subject: string,
    rules: readonly RateLimitRule[],
  ): Promise<ConsumeResult>;
};
