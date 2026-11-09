-- Support private club penalty history without scanning every club's records.
CREATE INDEX IF NOT EXISTS penalties_club_history ON penalties(club_id,voided,date DESC,created_at DESC);
