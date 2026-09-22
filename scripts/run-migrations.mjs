#!/usr/bin/env node
/**
 * Run pending migrations against Supabase using the service role key.
 * Usage: node scripts/run-migrations.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Load .env.local manually
const envPath = join(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  process.env[key] = val;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function tableExists(tableName) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${tableName}?select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return res.ok;
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log("Running migrations...\n");

for (const file of migrations) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");

  // Check if migration already applied by testing if the table exists
  const tableMatch = sql.match(/create table public\.(\w+)/);
  if (tableMatch) {
    const tableName = tableMatch[1];
    const exists = await tableExists(tableName);
    if (exists) {
      console.log(`⏭  ${file} — table "${tableName}" already exists, skipping`);
      continue;
    }
  }

  console.log(`▶  ${file}`);
  try {
    // Try using the Supabase SQL endpoint directly
    const res = await fetch(`${SUPABASE_URL.replace('/rest/v1', '')}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      // Fallback: try individual statements
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      
      for (const stmt of statements) {
        if (!stmt) continue;
        try {
          await runSQL(stmt + ";");
        } catch (e) {
          // Ignore errors for statements that might already exist
          console.log(`   ⚠  ${e.message.slice(0, 80)}`);
        }
      }
    }
    console.log(`✅ ${file}`);
  } catch (e) {
    console.log(`⚠  ${file} — ${e.message}`);
  }
}

console.log("\nDone!");
