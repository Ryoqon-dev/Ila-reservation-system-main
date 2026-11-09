CREATE TABLE IF NOT EXISTS content_entries (
 id TEXT PRIMARY KEY NOT NULL,
 section TEXT NOT NULL CHECK(section IN ('guide','equipment','board')),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 position INTEGER NOT NULL,
 visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 version TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 image_revision TEXT,
 mime TEXT,
 data BLOB,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_entries_section ON content_entries(section,position,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS club_contacts (
 club_id TEXT PRIMARY KEY NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 contacts TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS room_layout (
 id INTEGER PRIMARY KEY CHECK(id=1),
 version TEXT NOT NULL,
 overrides TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO room_layout VALUES(1,'initial','{}','');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS club_room_assignments (
 club_id TEXT PRIMARY KEY NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 space_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS club_room_space ON club_room_assignments(space_id);
