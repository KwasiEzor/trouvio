import { readFile as readFileFromDisk } from "node:fs/promises";
import { parseArgs } from "node:util";

import { getEnv } from "@/lib/env";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

import { createDatabase, createPool } from "../client";
import { describeTarget } from "../target";
import { applySeed } from "./apply";
import { assertSeedAllowed, type SeedGuardInput } from "./guard";
import { parseSeedText, type SeedFile } from "./seed-file";

/**
 * pnpm db:seed [--file <chemin>] [--allow-remote] : écrit les comptes et profils du fichier de
 * seed (db/seed.local.json par défaut, hors dépôt). Garde vérifiée avant toute lecture du
 * fichier ; ni valeur du fichier ni URL de base dans les journaux.
 */

const DEFAULT_FILE = "db/seed.local.json";

export type SeedCliDeps = {
  readTarget?: () => Omit<SeedGuardInput, "allowRemote">;
  readFile?: (path: string) => Promise<string>;
  apply?: typeof applySeed;
  log?: Logger;
};

export async function main(
  args: readonly string[],
  {
    readTarget = () => ({
      nodeEnv: getEnv("core").NODE_ENV,
      databaseUrl: getEnv("database").DATABASE_URL,
    }),
    readFile = (path) => readFileFromDisk(path, "utf8"),
    apply = applySeed,
    log = defaultLogger,
  }: SeedCliDeps = {},
): Promise<number> {
  let options: { file: string; allowRemote: boolean };
  try {
    options = parseOptions(args);
  } catch (err) {
    log.error("options invalides", { err });
    return 1;
  }
  let target: Omit<SeedGuardInput, "allowRemote">;
  try {
    target = readTarget();
  } catch (err) {
    log.error("configuration invalide", { err });
    return 1;
  }
  try {
    assertSeedAllowed({ ...target, allowRemote: options.allowRemote });
  } catch (err) {
    log.error("seed refusé", { err });
    return 1;
  }

  let text: string;
  try {
    text = await readFile(options.file);
  } catch (err) {
    if (isNotFound(err)) {
      log.error(
        "fichier de seed absent : copie db/seed.example.json vers db/seed.local.json",
        { file: options.file },
      );
    } else {
      log.error("fichier de seed illisible", { file: options.file });
    }
    return 1;
  }

  let seed: SeedFile;
  try {
    seed = parseSeedText(text);
  } catch (err) {
    log.error("fichier de seed invalide", { file: options.file, err });
    return 1;
  }

  const where = describeTarget(target.databaseUrl);
  const pool = createPool(
    target.databaseUrl,
    {
      applicationName: "trouvio-cli",
      max: 1,
    },
    log,
  );
  try {
    const counts = await apply(createDatabase(pool), seed);
    log.info(`${countLabel(counts)} (${where})`, counts);
    return 0;
  } catch (err) {
    log.error(`seed échoué (${where})`, { err });
    return 1;
  } finally {
    await pool.end();
  }
}

function parseOptions(args: readonly string[]) {
  // pnpm peut transmettre le séparateur « -- » tel quel.
  const { values } = parseArgs({
    args: args[0] === "--" ? args.slice(1) : [...args],
    options: {
      file: { type: "string", default: DEFAULT_FILE },
      "allow-remote": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return { file: values.file, allowRemote: values["allow-remote"] };
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

function countLabel({
  created,
  updated,
}: {
  created: number;
  updated: number;
}) {
  const s = (n: number) => (n > 1 ? "s" : "");
  return `${created} utilisateur${s(created)} créé${s(created)}, ${updated} modifié${s(updated)}`;
}
