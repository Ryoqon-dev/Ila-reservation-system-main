-- Additive: no changes to bookings, clubs, penalties or existing authentication tables.
CREATE TABLE IF NOT EXISTS reservation_readers (
 id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservation_reader_sessions (
 token TEXT PRIMARY KEY NOT NULL, reader_id TEXT NOT NULL REFERENCES reservation_readers(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, expires INTEGER NOT NULL, last_activity INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_reader_session_owner ON reservation_reader_sessions(reader_id,version);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_reader_session_expiry ON reservation_reader_sessions(expires);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservation_share_links (
 id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 date_from TEXT NOT NULL, date_to TEXT NOT NULL, rooms_json TEXT NOT NULL,
 expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_share_link_expiry ON reservation_share_links(revoked,expires);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reservation_share_sessions (
 token TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL REFERENCES reservation_share_links(id) ON DELETE CASCADE,
 expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_share_session_link ON reservation_share_sessions(link_id,expires);
