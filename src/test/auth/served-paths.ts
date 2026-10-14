/**
 * Routes de Better Auth servies (hors DISABLED_PATHS), figées : une montée de version qui en ajoute
 * une fait échouer auth.db.test.ts, et le limiteur nomme chaque chemin non paramétré
 * (src/lib/rate-limit/rules.test.ts).
 */
export const SERVED_PATHS: readonly string[] = [
  // Rappel OAuth : aucun fournisseur social configuré, la route répond en erreur.
  "/callback/:id",
  "/error",
  "/magic-link/verify",
  "/ok",
  // Sert le jeton émis par /request-password-reset, désactivée : aucun jeton n'existe.
  "/reset-password/:token",
  "/send-verification-email",
  "/sign-in/email",
  "/sign-in/magic-link",
  "/sign-out",
  "/sign-up/email",
  "/verify-email",
];
