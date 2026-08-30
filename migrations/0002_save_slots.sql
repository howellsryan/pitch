-- P0: one cloud save row per user + career slot.
-- Existing users are preserved as the stable legacy/first slot.
CREATE TABLE saves_v2 (
  user_id INTEGER NOT NULL,
  slot_id TEXT NOT NULL DEFAULT 'legacy',
  save_blob TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO saves_v2 (user_id, slot_id, save_blob, revision, updated_at)
SELECT user_id, 'legacy', save_blob, revision, updated_at
FROM saves;

DROP TABLE saves;
ALTER TABLE saves_v2 RENAME TO saves;
CREATE INDEX IF NOT EXISTS idx_saves_user_updated ON saves(user_id, updated_at DESC);
