-- Separate from account approval and the original clubs table.
CREATE TABLE IF NOT EXISTS club_profiles (
 club_id TEXT PRIMARY KEY NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','REGULAR','ASSOCIATE','NEW')),
 type_date TEXT NOT NULL DEFAULT '',
 division TEXT NOT NULL DEFAULT '' CHECK(division IN ('','PERFORMANCE','VOLUNTEER','SPORTS','CULTURE_ACADEMIC')),
 member_count INTEGER CHECK(member_count IS NULL OR (typeof(member_count)='integer' AND member_count BETWEEN 0 AND 100000)),
 advisor TEXT NOT NULL DEFAULT '',
 version TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((type='' AND type_date='') OR (type<>'' AND length(type_date)=10 AND type_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS club_profiles_type_division ON club_profiles(type,division);
