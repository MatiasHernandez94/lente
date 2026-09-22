#!/usr/bin/env node
/**
 * Apply pending migrations against the Postgres database directly.
 *
 * Uses DATABASE_URL (direct connection or pooler) instead of the Supabase
 * HTTP/SQL endpoints, which are unreliable and fail silently. Requires the
 * `pg` package (devDependency).
 *
 * Usage: node scripts/run-migrations.mjs [--force]
 *   --force  re-run every migration, ignoring the applied record.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// Load .env.local manually
const envPath = join(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const rs = process.env.MIGRATION_SCHEMA ?? "public";
const appliedTable = `"${rs}"."_migrations"`;

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runSQL(sql) {
  await client.query(sql);
}

async function ensureAppliedTable() {
  const tableExists = await client.query(
    `select to_regclass($1) as t`,
    [appliedTable.replace(/"/g, "")],
  );
  if (!tableExists.rows[0].t) {
    await client.query(
      `create table if not exists ${appliedTable} (
        name text primary key,
        applied_at timestamptz not null default now()
      )`,
    );
  }
}

async function appliedMigrations() {
  const { rows } = await client.query(`select name from ${appliedTable}`);
  return new Set(rows.map((r) => r.name));
}

async function tableExists(tableName) {
  const res = await client.query(`select to_regclass($1) as t`, [`public.${tableName}`]);
  return !!res.rows[0].t;
}

async function main() {
  const force = process.argv.includes("--force");
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await client.connect();
  try {
    await ensureAppliedTable();
    const already = force ? new Set() : await appliedMigrations();

    console.log(`Conectado a Postgres. Migraciones: ${migrations.length} (${force ? "FORCE" : "pendientes"})\n`);

    for (const file of migrations) {
      if (already.has(file)) {
        console.log(`⏭  ${file} — ya aplicada`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");

      // Migraciones que crean una tabla: si la tabla ya existe, se reusa el
      // resultado (la aplicó el SQL Editor o una corrida anterior sin registro).
      const tableMatch = sql.match(/create table if not exists public\.(\w+)|create table public\.(\w+)/);
      const createdTable = tableMatch ? (tableMatch[1] ?? tableMatch[2]) : null;
      if (createdTable && (await tableExists(createdTable))) {
        console.log(`⏭  ${file} — tabla "${createdTable}" ya existe`);
        await client.query(`insert into ${appliedTable} (name) values ($1) on conflict do nothing`, [file]);
        continue;
      }

      console.log(`▶  ${file}`);
      try {
        // Ejecutar dentro de una transacción: si falla, no se registra y no deja cambios.
        await client.query("begin");
        await runSQL(sql);
        await client.query("commit");
        await client.query(`insert into ${appliedTable} (name) values ($1) on conflict do nothing`, [file]);
        console.log(`✅ ${file}`);
      } catch (e) {
        await client.query("rollback");
        console.error(`\n❌ ${file} — falló:\n   ${e.message}`);
        process.exitCode = 1;
      }
    }

    if (process.exitCode) {
      console.error("\nHubo errores. Revisá el mensaje de arriba; la migración fallida no dejó cambios.");
    } else {
      console.log("\nTodas las migraciones aplicadas sin errores.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Error fatal:", error.message);
  process.exit(1);
});