-- P0: one cloud save row per user + career slot.
-- Existing users are preserved as the stable legacy/first slot. The opaque
-- game-state blob remains server-unread; metadata_json mirrors the small local
-- career summary contract so future cloud slot pickers need no blob parsing.
CREATE TABLE saves_v2 (
  user_id INTEGER NOT NULL REFERENCES users(id),
  slot_id TEXT NOT NULL DEFAULT 'legacy',
  save_blob TEXT NOT NULL,
  metadata_json TEXT,
  save_revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slot_id)
);

INSERT INTO saves_v2 (user_id, slot_id, save_blob, metadata_json, save_revision, updated_at)
SELECT user_id, 'legacy', save_blob, NULL, save_revision, updated_at
FROM saves;

DROP TABLE saves;
ALTER TABLE saves_v2 RENAME TO saves;
CREATE INDEX IF NOT EXISTS idx_saves_user_updated ON saves(user_id, updated_at DESC);
