-- Legacy password-only sessions cannot survive the MFA rollout.
DELETE FROM sessions;
--> statement-breakpoint
UPDATE club_accounts SET password_cipher='';
--> statement-breakpoint
CREATE TRIGGER club_password_hash_only_insert BEFORE INSERT ON club_accounts
WHEN NEW.password_cipher<>'' BEGIN SELECT RAISE(ABORT,'PASSWORD_HASH_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER club_password_hash_only_update BEFORE UPDATE OF password_cipher ON club_accounts
WHEN NEW.password_cipher<>'' BEGIN SELECT RAISE(ABORT,'PASSWORD_HASH_ONLY'); END;
--> statement-breakpoint
CREATE TABLE admin_security (
 id INTEGER PRIMARY KEY CHECK(id=1),
 secret TEXT NOT NULL,
 last_step INTEGER NOT NULL DEFAULT -1,
 revision TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_session_security (
 token TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE,
 last_activity INTEGER NOT NULL,
 verified INTEGER NOT NULL CHECK(verified=1)
);
--> statement-breakpoint
CREATE TABLE admin_challenges (
 token TEXT PRIMARY KEY,
 password_hash TEXT NOT NULL,
 secret TEXT NOT NULL DEFAULT '',
 expires INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE admin_recovery_codes (
 code_hash TEXT PRIMARY KEY,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE admin_factor_changes (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
 secret TEXT NOT NULL,
 expires INTEGER NOT NULL,
 revision TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE privacy_state (id INTEGER PRIMARY KEY CHECK(id=1),ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)));
--> statement-breakpoint
INSERT INTO privacy_state VALUES(1,0);
--> statement-breakpoint
-- Reauthentication must not invalidate an already verified CSV/reset snapshot.
CREATE TABLE admin_security_log (id TEXT PRIMARY KEY,action TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER admin_security_log_bound AFTER INSERT ON admin_security_log BEGIN
 DELETE FROM admin_security_log WHERE id IN (SELECT id FROM admin_security_log ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 1000);
END;

--> statement-breakpoint
CREATE TRIGGER privacy_club_contacts_insert BEFORE INSERT ON club_contacts
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.contacts<>'' AND NEW.contacts NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_club_contacts_update BEFORE UPDATE OF contacts ON club_contacts
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.contacts<>'' AND NEW.contacts NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_club_profiles_insert BEFORE INSERT ON club_profiles
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.advisor<>'' AND NEW.advisor NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_club_profiles_update BEFORE UPDATE OF advisor ON club_profiles
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.advisor<>'' AND NEW.advisor NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_bookings_insert BEFORE INSERT ON bookings
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.representative<>'' AND NEW.representative NOT LIKE 'enc:v1:%') OR (NEW.phone<>'' AND NEW.phone NOT LIKE 'enc:v1:%') OR (NEW.note<>'' AND NEW.note NOT LIKE 'enc:v1:%') OR (NEW.reason<>'' AND NEW.reason NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_bookings_update BEFORE UPDATE OF representative,phone,note,reason ON bookings
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.representative<>'' AND NEW.representative NOT LIKE 'enc:v1:%') OR (NEW.phone<>'' AND NEW.phone NOT LIKE 'enc:v1:%') OR (NEW.note<>'' AND NEW.note NOT LIKE 'enc:v1:%') OR (NEW.reason<>'' AND NEW.reason NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_penalties_insert BEFORE INSERT ON penalties
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.content<>'' AND NEW.content NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER privacy_penalties_update BEFORE UPDATE OF content ON penalties
WHEN (SELECT ready FROM privacy_state WHERE id=1)=1 AND ((NEW.content<>'' AND NEW.content NOT LIKE 'enc:v1:%'))
BEGIN SELECT RAISE(ABORT,'PLAINTEXT_PII_BLOCKED'); END;
