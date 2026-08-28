-- Pitch cloud-save schema (ROADMAP.md item 7, v1).
--
-- Trimmed from PocketRPG's reference (howellsryan/pocketrpg): no characters
-- table — Pitch has one save per account, not many, so `saves` hangs
-- straight off `users`. `oauth_identities` still sits between them (rather
-- than saves.provider/provider_user_id directly) so a second provider can be
-- linked to the same account later without a schema change.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id);

-- One row per account — "store what we can to restore a browser session,"
-- not a multi-slot save system (see ROADMAP.md's 80/20 cut). save_blob is
-- the exact base64 envelope src/modules/db.js's exportSaveFile() already
-- produces for the .pitch file, so the server never needs to understand the
-- save format. save_revision is carried now as a last-write-wins counter —
-- bumped on every write, not yet enforced as a conflict precondition; that's
-- the cheap future-proofing hook for the multi-device conflict UI v1 skips.
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  save_blob TEXT NOT NULL,
  save_revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
