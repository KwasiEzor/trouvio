import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "../../../db/schema";

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
  it("déclare exactement les tables métier et users", () => {
    expect(tables.map((config) => config.name).sort()).toEqual([
      "applications",
      "deliveries",
      "job_offers",
      "job_runs",
      "offer_feedback",
      "offer_scores",
      "search_profiles",
      "users",
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
