import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "lente.db");

function createConnection(): Database.Database {
  mkdirSync(join(DATA_DIR, "uploads"), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title            TEXT NOT NULL,
      sport            TEXT NOT NULL,
      source_type      TEXT NOT NULL,
      source_ref       TEXT,
      duration_seconds INTEGER,
      players          TEXT NOT NULL DEFAULT '[]',
      status           TEXT NOT NULL DEFAULT 'pending',
      error_message    TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_user_created
      ON videos(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS analyses (
      video_id     TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      score        INTEGER NOT NULL,
      result       TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
  `);

  const videoColumns = db.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
  if (!videoColumns.some((column) => column.name === "players")) {
    db.exec("ALTER TABLE videos ADD COLUMN players TEXT NOT NULL DEFAULT '[]'");
  }

  return db;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = createConnection();
  }
  return db;
}