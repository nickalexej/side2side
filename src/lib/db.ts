import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Source = "whoop" | "garmin";

const DATA_DIR = path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tokens (
  provider TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw (
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (provider, kind, key)
);
CREATE TABLE IF NOT EXISTS nights (
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  start TEXT,
  end TEXT,
  total_sleep_s REAL,
  deep_s REAL,
  light_s REAL,
  rem_s REAL,
  awake_s REAL,
  resp_rate REAL,
  spo2 REAL,
  avg_hr REAL,
  hrv REAL,
  rhr REAL,
  sleep_score REAL,
  readiness REAL,
  state TEXT,
  PRIMARY KEY (source, date)
);
CREATE TABLE IF NOT EXISTS days (
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  steps REAL,
  kcal_total REAL,
  kcal_active REAL,
  rhr REAL,
  min_hr REAL,
  avg_hr REAL,
  max_hr REAL,
  load REAL,
  hours REAL,
  PRIMARY KEY (source, date)
);
CREATE TABLE IF NOT EXISTS workouts (
  source TEXT NOT NULL,
  id TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  sport TEXT,
  distance_m REAL,
  elevation_m REAL,
  avg_hr REAL,
  max_hr REAL,
  kcal REAL,
  load REAL,
  zones_s TEXT,
  hr_source TEXT,
  PRIMARY KEY (source, id)
);
-- Entered by hand, not derived from raw data: never cleared by rebuild().
CREATE TABLE IF NOT EXISTS positions (
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  device TEXT NOT NULL,
  position TEXT NOT NULL,
  PRIMARY KEY (kind, ref, device)
);
`;

// Columns added after the first release; derived tables only, so a plain ADD COLUMN is enough.
const MIGRATIONS: [table: string, column: string, type: string][] = [
  ["workouts", "hr_source", "TEXT"],
  ["days", "hours", "REAL"],
];

function migrate(conn: DatabaseSync) {
  for (const [table, column, type] of MIGRATIONS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

const globalForDb = globalThis as unknown as { db?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.db) {
    mkdirSync(DATA_DIR, { recursive: true });
    // DB_FILE lets the demo run on its own database (see scripts/seed-demo.mjs).
    const conn = new DatabaseSync(path.join(DATA_DIR, process.env.DB_FILE || "compare.db"));
    conn.exec("PRAGMA journal_mode = WAL;");
    conn.exec(SCHEMA);
    migrate(conn);
    globalForDb.db = conn;
  }
  return globalForDb.db;
}

type Value = string | number | null;

/** Upsert a row; columns are taken from the object keys. */
export function upsert(table: string, row: Record<string, Value | undefined>) {
  const cols = Object.keys(row);
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  db()
    .prepare(sql)
    .run(...cols.map((c) => row[c] ?? null));
}

export function saveRaw(provider: Source, kind: string, key: string, data: unknown) {
  upsert("raw", {
    provider,
    kind,
    key,
    data: JSON.stringify(data),
    fetched_at: new Date().toISOString(),
  });
}

export function hasRaw(provider: Source, kind: string, key: string): boolean {
  return (
    db().prepare("SELECT 1 FROM raw WHERE provider = ? AND kind = ? AND key = ?").get(provider, kind, key) !==
    undefined
  );
}

export function readRaw<T>(provider: Source, kind: string): T[] {
  const rows = db()
    .prepare("SELECT data FROM raw WHERE provider = ? AND kind = ?")
    .all(provider, kind) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

export function getToken<T>(provider: Source): T | null {
  const row = db().prepare("SELECT data FROM tokens WHERE provider = ?").get(provider) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}

export function setToken(provider: Source, data: unknown) {
  upsert("tokens", { provider, data: JSON.stringify(data) });
}
