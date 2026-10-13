import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

// All times are whole milliseconds. Cone stations are free text ("A", "B", "Slalom"...); '' means "not recorded".
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS season_classes (
  id INTEGER PRIMARY KEY,
  season_year INTEGER NOT NULL,
  name TEXT NOT NULL,
  pax_class TEXT NOT NULL DEFAULT '',
  pax_index REAL NOT NULL DEFAULT 1,
  is_ladies INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (season_year, name)
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  club_member_id TEXT NOT NULL DEFAULT '',
  dedicated_number TEXT NOT NULL DEFAULT '',
  last_class TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cars TEXT NOT NULL DEFAULT '[]',
  legacy_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,                 -- YYYY-MM-DD
  season_year INTEGER NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  event_number TEXT NOT NULL DEFAULT '',
  counts_for_points INTEGER NOT NULL DEFAULT 1,
  run_groups TEXT NOT NULL DEFAULT '[]',     -- [{name,color}]
  cone_stations TEXT NOT NULL DEFAULT '[]',  -- ["A","B",...]
  rules TEXT NOT NULL DEFAULT '{}',          -- see scoring.ts EventRules
  current_run_group TEXT NOT NULL DEFAULT '',
  current_session INTEGER NOT NULL DEFAULT 1,
  legacy_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  car_number TEXT NOT NULL DEFAULT '',
  car TEXT NOT NULL DEFAULT '',
  car_color TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  pax_class TEXT NOT NULL DEFAULT '',
  pax_index REAL NOT NULL DEFAULT 1,
  is_ladies INTEGER NOT NULL DEFAULT 0,
  run_group TEXT NOT NULL DEFAULT '',
  checked_in INTEGER NOT NULL DEFAULT 0,
  teched INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  is_rookie INTEGER NOT NULL DEFAULT 0,
  worker_role TEXT NOT NULL DEFAULT '',
  legacy_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS reg_event ON registrations(event_id);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,               -- order cars were run in at this event
  session INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Q',   -- Q queued, R on course, F finished
  queue_pos REAL NOT NULL DEFAULT 0,
  raw_ms INTEGER NOT NULL DEFAULT 0,
  cones INTEGER NOT NULL DEFAULT 0,
  dnf INTEGER NOT NULL DEFAULT 0,
  rerun INTEGER NOT NULL DEFAULT 0,
  off_course INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  legacy_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS runs_event ON runs(event_id, status);
CREATE TABLE IF NOT EXISTS cone_hits (
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  station TEXT NOT NULL DEFAULT '',
  cones INTEGER NOT NULL,
  PRIMARY KEY (run_id, station)
);
CREATE TABLE IF NOT EXISTS timer_log (
  id INTEGER PRIMARY KEY,
  event_id INTEGER,
  at TEXT NOT NULL,
  source TEXT NOT NULL,     -- hardware, simulated, manual
  kind TEXT NOT NULL,       -- start, finish, time, split
  value_ms INTEGER,
  run_id INTEGER
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  event_id INTEGER,
  at TEXT NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL
);
`;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
