import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getAuthTables } from "better-auth/db";

import { buildAuthOptions } from "@/lib/auth/config";
import { fakeLogger } from "@/test/db/fake-logger";

import * as schema from "../../../db/schema";
import { createDatabase, createPool } from "./client";
import { AUTH_OWNED_TABLES, USER_OWNED_TABLES } from "./owned";

/**
 * Invariants du schéma, vérifiés sans base : suppression de compte effective (RGPD, P7-04),
 * requêtes scopées par user_id indexées (P1-03), idempotence de la collecte et des envois
 * (.claude/rules/db.md).
 */

const tables = Object.values(schema).flatMap((value) =>
  is(value, PgTable) ? [getTableConfig(value)] : [],
);

function table(name: string) {
  const config = tables.find((candidate) => candidate.name === name);
  if (!config) throw new Error(`table ${name} absente`);
  return config;
}

type Config = ReturnType<typeof table>;

function foreignKeys(config: Config) {
  return config.foreignKeys.map((fk) => {
    const reference = fk.reference();
    return {
      columns: reference.columns.map((column) => column.name),
      target: getTableConfig(reference.foreignTable).name,
      onDelete: fk.onDelete,
    };
  });
}

/** Colonnes de chaque clé primaire, contrainte unique et index de la table. */
function keyedColumns(config: Config): string[][] {
  const primary = config.columns
    .filter((column) => column.primary)
    .map((column) => [column.name]);
  const composite = config.primaryKeys.map((pk) =>
    pk.columns.map((column) => column.name),
  );
  const uniques = config.uniqueConstraints.map((unique) =>
    unique.columns.map((column) => column.name),
  );
  const columnUniques = config.columns
    .filter((column) => column.isUnique)
    .map((column) => [column.name]);
  const indexes = config.indexes.map((index) =>
    index.config.columns.map((column) =>
      "name" in column ? String(column.name) : "(expression)",
    ),
  );
  return [...primary, ...composite, ...uniques, ...columnUniques, ...indexes];
}

const withUserId = tables.filter((config) =>
  config.columns.some((column) => column.name === "user_id"),
);

describe("schéma", () => {
  it("déclare exactement les tables métier et celles de Better Auth", () => {
    expect(tables.map((config) => config.name).sort()).toEqual([
      "accounts",
      "applications",
      "deliveries",
      "job_offers",
      "job_runs",
      "offer_feedback",
      "offer_scores",
      "search_profiles",
      "sessions",
      "users",
      "verifications",
    ]);
  });

  it.each(withUserId.map((config) => config.name))(
    "%s : user_id référence users en cascade (suppression de compte)",
    (name) => {
      expect(foreignKeys(table(name))).toContainEqual({
        columns: ["user_id"],
        target: "users",
        onDelete: "cascade",
      });
    },
  );

  it.each(withUserId.map((config) => config.name))(
    "%s : une clé ou un index commence par user_id (requêtes scopées)",
    (name) => {
      const firsts = keyedColumns(table(name)).map((columns) => columns[0]);
      expect(firsts).toContain("user_id");
    },
  );

  it.each(tables.map((config) => config.name))(
    "%s : chaque clé étrangère est couverte par un index qui commence par elle",
    (name) => {
      const config = table(name);
      const keyed = keyedColumns(config);
      const uncovered = foreignKeys(config)
        .filter(
          (fk) =>
            !keyed.some((columns) =>
              fk.columns.every((column, i) => columns[i] === column),
            ),
        )
        .map((fk) => fk.columns.join(", "));
      expect(uncovered).toEqual([]);
    },
  );

  it("garde l'historique des candidatures : offer_id en restrict", () => {
    expect(foreignKeys(table("applications"))).toContainEqual({
      columns: ["offer_id"],
      target: "job_offers",
      onDelete: "restrict",
    });
  });

  it("remet à null les doublons d'une offre canonique supprimée", () => {
    expect(foreignKeys(table("job_offers"))).toContainEqual({
      columns: ["canonical_offer_id"],
      target: "job_offers",
      onDelete: "set null",
    });
  });

  it.each([
    ["job_offers", ["source", "external_id"]],
    ["offer_scores", ["user_id", "offer_id"]],
    ["offer_feedback", ["user_id", "offer_id"]],
    ["applications", ["user_id", "offer_id"]],
    ["deliveries", ["user_id", "channel", "digest_date"]],
    ["search_profiles", ["user_id"]],
    ["users", ["email"]],
    ["sessions", ["token"]],
    ["accounts", ["provider_id", "account_id"]],
  ])("%s : unicité sur (%s) pour l'idempotence", (name, columns) => {
    const config = table(name);
    const uniques = [
      ...config.columns
        .filter((column) => column.primary || column.isUnique)
        .map((column) => [column.name]),
      ...config.primaryKeys.map((pk) => pk.columns.map((c) => c.name)),
      ...config.uniqueConstraints.map((u) => u.columns.map((c) => c.name)),
    ];
    expect(uniques).toContainEqual(columns);
  });
});

/**
 * Registre des tables possédées (P1-03, ADR 0014) : une nouvelle table à user_id doit y entrer
 * (requêtes par ownedBy, matrice IDOR de src/lib/db/owned.db.test.ts) ou être déclarée gérée par
 * Better Auth seul.
 */
describe("registre des tables possédées", () => {
  it("recense exactement les tables à user_id", () => {
    expect(
      [...Object.keys(USER_OWNED_TABLES), ...AUTH_OWNED_TABLES].sort(),
    ).toEqual(withUserId.map((config) => config.name).sort());
  });

  it.each(Object.entries(USER_OWNED_TABLES))(
    "%s : la clé du registre est le nom SQL de la table",
    (name, ownedTable) => {
      expect(getTableConfig(ownedTable).name).toBe(name);
    },
  );
});

/**
 * Parité avec Better Auth : l'adaptateur Drizzle adresse les tables par leur clé d'export et les
 * colonnes par leur nom de propriété. Un champ manquant ferait lever SchemaMismatchError à la
 * première requête (validateSchema).
 */
describe("parité avec Better Auth", () => {
  const options = buildAuthOptions({
    // Pool jamais interrogé.
    db: createDatabase(
      createPool("postgres://essai@127.0.0.1:1/essai", {
        applicationName: "trouvio-test",
      }),
    ),
    baseURL: "http://localhost:3000",
    secret: "s".repeat(32),
    mailer: { send: () => Promise.resolve() },
    log: fakeLogger(),
  });
  const authTables = Object.entries(getAuthTables(options));

  it("attend exactement user, session, account et verification", () => {
    expect(authTables.map(([key]) => key).sort()).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });

  it.each(authTables)(
    "%s : chaque champ existe dans la table au pluriel, non nul s'il est requis",
    (key, definition) => {
      const drizzleTable: unknown = Reflect.get(schema, `${key}s`);
      if (!is(drizzleTable, PgTable)) throw new Error(`table ${key}s absente`);
      const columns = new Map(
        Object.entries(drizzleTable).filter(([, value]) =>
          getTableConfig(drizzleTable).columns.includes(value),
        ),
      );
      const problems = Object.entries(definition.fields).flatMap(
        ([field, attribute]) => {
          const column = columns.get(field);
          if (!column) return [`${field} absent`];
          if (attribute.required !== false && !column.notNull)
            return [`${field} accepte null`];
          return [];
        },
      );
      expect(problems).toEqual([]);
    },
  );
});
