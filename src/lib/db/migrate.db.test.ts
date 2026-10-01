import { readFileSync } from "node:fs";

import { is, sql } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openTestDatabase, type TestDatabase } from "@/test/db/test-database";

import * as schema from "../../../db/schema";
import { runMigrations } from "./migrate";

const journal = JSON.parse(
  readFileSync(
    new URL("../../../db/migrations/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: unknown[] };

const declaredTables = Object.values(schema)
  .flatMap((value) => (is(value, PgTable) ? [getTableConfig(value).name] : []))
  .sort();
const declaredEnums = Object.values(schema)
  .flatMap((value) => (isPgEnum(value) ? [value.enumName] : []))
  .sort();

describe("runMigrations sur une base vierge", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await openTestDatabase({ migrated: false });
  });
  afterAll(async () => {
    // t reste indéfini si openTestDatabase a échoué (base injoignable) : ne pas masquer son message.
    await t?.close();
  });

  it("applique toutes les migrations du journal, puis plus rien", async () => {
    expect(await runMigrations(t.pool)).toEqual({
      applied: journal.entries.length,
    });
    expect(await runMigrations(t.pool)).toEqual({ applied: 0 });
  });

  it("crée exactement les tables et les enums déclarés dans db/schema.ts", async () => {
    const tables = await t.db.execute<{ name: string }>(
      sql`select table_name as name from information_schema.tables
          where table_schema = 'public' order by table_name`,
    );
    const enums = await t.db.execute<{ name: string }>(
      sql`select t.typname as name from pg_type t
          join pg_namespace n on n.oid = t.typnamespace
          where t.typtype = 'e' and n.nspname = 'public' order by t.typname`,
    );
    expect(tables.rows.map((row) => row.name)).toEqual(declaredTables);
    expect(enums.rows.map((row) => row.name)).toEqual(declaredEnums);
  });
});
