-- Additive only: existing bookings, receipts, openings, accounts and settings are untouched.
CREATE TABLE IF NOT EXISTS opening_schedule_batches (
 id TEXT PRIMARY KEY NOT NULL,
 opens_at INTEGER NOT NULL,
 targets_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS opening_schedule_targets (
 date TEXT NOT NULL,
 room TEXT NOT NULL CHECK(room IN ('심정실','진리실','창의실')),
 batch_id TEXT NOT NULL REFERENCES opening_schedule_batches(id) ON DELETE CASCADE,
 PRIMARY KEY(date,room)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS opening_schedule_batch_targets ON opening_schedule_targets(batch_id,date,room);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS opening_schedule_time ON opening_schedule_batches(status,opens_at,id);
