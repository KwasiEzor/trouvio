import { describe, expect, it } from "vitest";

import type { Database } from "./client";
import { createPgRateLimitStore } from "./rate-limit-store";

/** Base factice dont l'upsert ne rend aucune ligne (ce que Postgres ne fait jamais). */
function dbReturningNothing(): Database {
  const chain = {
    values: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve([]),
  };
  return { insert: () => chain } as unknown as Database;
}

describe("createPgRateLimitStore (sans base)", () => {
  it("échoue fermé si un compteur manque dans la réponse, au lieu d'accepter", async () => {
    await expect(
      createPgRateLimitStore(dbReturningNothing()).consume(
        [{ key: "a".repeat(64), rule: { windowSeconds: 60, max: 5 } }],
        new Date(),
      ),
    ).rejects.toThrow("compteur de limitation absent");
  });
});
