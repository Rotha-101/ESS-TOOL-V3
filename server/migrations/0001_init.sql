-- Shared Graph Repository — D1 (SQLite) schema.
--
-- Two tables. Graph payloads live in R2, not here: they are ~0.84 MB each and
-- fetched rarely, while this metadata is listed on every sync.

CREATE TABLE IF NOT EXISTS graphs (
  id              TEXT PRIMARY KEY,
  project         TEXT NOT NULL,
  data_date       TEXT NOT NULL,              -- plant-local YYYY-MM-DD
  revision        INTEGER NOT NULL DEFAULT 1,

  -- Identity, written from the access key rather than the client, so
  -- attribution cannot be spoofed by editing local settings.
  user_id         TEXT NOT NULL,
  engineer_name   TEXT NOT NULL,
  machine_name    TEXT,

  app_version     TEXT,
  generated_at    TEXT NOT NULL,
  uploaded_at     TEXT NOT NULL,

  -- The full GraphRecordMeta as sent (with identity fields corrected).
  -- Kept whole so the client receives exactly the shape it stores locally.
  meta_json       TEXT NOT NULL,

  payload_key     TEXT NOT NULL,
  payload_bytes   INTEGER NOT NULL,
  payload_sha256  TEXT NOT NULL,
  payload_codec   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graphs_project_date ON graphs (project, data_date DESC);
-- Backs the idempotency check on re-upload of an unchanged graph.
CREATE INDEX IF NOT EXISTS idx_graphs_dedupe ON graphs (project, data_date, payload_sha256);

CREATE TABLE IF NOT EXISTS access_keys (
  id           TEXT PRIMARY KEY,
  -- SHA-256 of the key. The plaintext is shown once at issue and never stored,
  -- so a database copy does not hand over working credentials.
  key_hash     TEXT NOT NULL UNIQUE,
  user_name    TEXT NOT NULL,
  user_email   TEXT,
  role         TEXT NOT NULL CHECK (role IN ('engineer', 'viewer', 'admin')),
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);
