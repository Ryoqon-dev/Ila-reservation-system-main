-- Settings and three bounded branding images, separate from bookings and club accounts.
CREATE TABLE IF NOT EXISTS site_content (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1),
 version TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 settings TEXT NOT NULL,
 image_versions TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS site_images (
 slot TEXT PRIMARY KEY NOT NULL CHECK(slot IN ('logo','wordmark','campus')),
 revision TEXT NOT NULL,
 mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 data BLOB NOT NULL
);
