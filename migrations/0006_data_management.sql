-- A reset closes a semester without destroying its records.
CREATE TABLE penalty_closures (penalty_id TEXT PRIMARY KEY REFERENCES penalties(id) ON DELETE CASCADE,reset_id TEXT NOT NULL);
--> statement-breakpoint
CREATE VIEW penalty_records AS SELECT p.*,(SELECT pc.reset_id FROM penalty_closures pc WHERE pc.penalty_id=p.id) AS reset_id FROM penalties p;
--> statement-breakpoint
CREATE TABLE penalty_periods (club_id TEXT PRIMARY KEY REFERENCES clubs(id),start_date TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX penalties_current ON penalties(voided,club_id,date);
--> statement-breakpoint
CREATE INDEX penalties_export_date ON penalties(date,id);
--> statement-breakpoint
CREATE INDEX bookings_export_date ON bookings(date,start,id);
--> statement-breakpoint
CREATE INDEX audit_export_date ON audit(substr(created_at,1,10),id);
--> statement-breakpoint
CREATE TABLE data_revision (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO data_revision VALUES(1,0);
--> statement-breakpoint
-- Existing application writes already append an audit record in the same batch.
CREATE TRIGGER audit_data_revision AFTER INSERT ON audit BEGIN UPDATE data_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TABLE data_jobs (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('reset','cleanup')),
 params TEXT NOT NULL,
 label TEXT NOT NULL,
 target_name TEXT NOT NULL,
 total INTEGER NOT NULL,
 points INTEGER NOT NULL,
 processed INTEGER NOT NULL DEFAULT 0,
 step INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'ready',
 export_position INTEGER NOT NULL DEFAULT 0,
 export_cursor TEXT,
 export_ready INTEGER NOT NULL DEFAULT 0,
 authorized_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 expires INTEGER NOT NULL,
 completed_at TEXT
);
--> statement-breakpoint
CREATE INDEX data_jobs_time ON data_jobs(created_at,id);
--> statement-breakpoint
CREATE TABLE data_metrics (
 id INTEGER PRIMARY KEY CHECK(id=1),
 account_id TEXT NOT NULL,
 token_cipher TEXT NOT NULL,
 cache TEXT,
 refreshed_at TEXT
);
