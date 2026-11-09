-- Login sessions and the exclusive rental lease are independent.
CREATE TABLE IF NOT EXISTS club_sessions (
 token TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 last_seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS club_sessions_account ON club_sessions(account_id,created_at,token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS club_sessions_expiry ON club_sessions(expires);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS club_rental_leases (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
 token TEXT NOT NULL REFERENCES club_sessions(token) ON DELETE CASCADE,
 expires INTEGER NOT NULL
);
--> statement-breakpoint
-- Preserve the existing browser login through the update.
INSERT OR IGNORE INTO club_sessions(token,account_id,version,expires,created_at,last_seen)
 SELECT session_token,id,version,session_expires,unixepoch()*1000,unixepoch()*1000
 FROM club_accounts WHERE session_token IS NOT NULL AND session_expires>unixepoch()*1000;
--> statement-breakpoint
INSERT OR IGNORE INTO club_rental_leases(account_id,token,expires)
 SELECT a.id,s.token,unixepoch()*1000+180000 FROM club_accounts a JOIN club_sessions s ON s.account_id=a.id
 WHERE a.status='APPROVED' AND s.version=a.version AND s.token=a.session_token;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS club_sessions_revoke AFTER UPDATE OF version ON club_accounts
WHEN NEW.version<>OLD.version BEGIN
 DELETE FROM club_sessions WHERE account_id=NEW.id;
END;
