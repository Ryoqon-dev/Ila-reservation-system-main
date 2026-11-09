-- Additive migration: existing clubs, bookings, receipts and administrator stay intact.
CREATE TABLE IF NOT EXISTS club_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL UNIQUE REFERENCES clubs(id),
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_cipher TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','SUSPENDED')),
  session_token TEXT UNIQUE,
  session_expires INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT
);
