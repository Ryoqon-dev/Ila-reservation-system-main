CREATE TABLE IF NOT EXISTS booking_access (booking_id TEXT PRIMARY KEY REFERENCES bookings(id), code_hash TEXT NOT NULL UNIQUE);
