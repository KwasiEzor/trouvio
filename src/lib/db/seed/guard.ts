import type { Env } from "@/lib/env";

import { isLoopbackUrl } from "../target";

/**
 * Le seed écrit des comptes et des profils : jamais en production, et jamais sur une base
 * distante (Neon) sans intention explicite (--allow-remote). Messages sans URL.
 */

export class SeedRefusedError extends Error {
  override readonly name = "SeedRefusedError";
}

export type SeedGuardInput = {
  nodeEnv: Env<"core">["NODE_ENV"];
  databaseUrl: string;
  allowRemote: boolean;
};

export function assertSeedAllowed({
  nodeEnv,
  databaseUrl,
  allowRemote,
}: SeedGuardInput): void {
  if (nodeEnv === "production") {
    throw new SeedRefusedError("Seed refusé en production.");
  }
  if (!allowRemote && !isLoopbackUrl(databaseUrl)) {
    throw new SeedRefusedError(
      "Seed refusé sur une base distante sans --allow-remote.",
    );
  }
}
