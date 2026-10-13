import { Client } from "pg";

import { e2eDatabaseUrl } from "../../src/test/e2e/environment";

/**
 * Accès direct à la base des E2E (trouvio_e2e, boucle locale) : seul moyen de vieillir une session
 * pour prouver sa prolongation dans le vrai runtime Next (P1-05, ADR 0016). Jamais d'écriture
 * hors des sessions des comptes créés par le test.
 */

async function avecBase<T>(
  travail: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await travail(client);
  } finally {
    await client.end();
  }
}

/** Recule l'expiration des sessions de ce compte à maintenant + 6 j − 1 min : prolongation due. */
export async function vieillirSession(email: string): Promise<void> {
  await avecBase((client) =>
    client.query(
      `UPDATE sessions SET expires_at = now() + interval '6 days' - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    ),
  );
}

/** Expiration de l'unique session de ce compte. */
export async function expirationSession(email: string): Promise<Date> {
  return avecBase(async (client) => {
    const { rows } = await client.query<{ expires_at: Date }>(
      `SELECT s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.email = $1`,
      [email],
    );
    const [ligne, ...autres] = rows;
    if (ligne === undefined || autres.length > 0)
      throw new Error(`une session attendue, ${rows.length} trouvée(s)`);
    return ligne.expires_at;
  });
}
