-- Bmail — complete schema for fresh deploys
-- Usage: wrangler d1 execute bmail --remote --file=schema.sql
--        wrangler d1 execute bmail --local  --file=schema.sql
-- Existing installs: npm run db:migrate:remote (applies 0001–0012 in order)

CREATE TABLE emails (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  sender           TEXT    NOT NULL,
  recipient        TEXT    NOT NULL,
  subject          TEXT    NOT NULL DEFAULT '',
  body             TEXT    NOT NULL DEFAULT '',
  message_id       TEXT,
  in_reply_to      TEXT,
  notify           INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  sender_display   TEXT,
  starred          INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'inbox',
  status_changed_at INTEGER NOT NULL DEFAULT 0,
  read             INTEGER NOT NULL DEFAULT 0,
  tags             TEXT,
  cc               TEXT
);

CREATE UNIQUE INDEX idx_emails_message_id ON emails (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_emails_created_at        ON emails (created_at);
CREATE INDEX idx_emails_status            ON emails (status);
CREATE INDEX idx_emails_status_changed_at ON emails (status_changed_at);

CREATE VIRTUAL TABLE emails_fts USING fts5 (
  subject,
  body,
  content     = 'emails',
  content_rowid = 'id'
);

CREATE TRIGGER emails_ai AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts (rowid, subject, body) VALUES (new.id, new.subject, new.body);
END;

CREATE TRIGGER emails_ad AFTER DELETE ON emails BEGIN
  INSERT INTO emails_fts (emails_fts, rowid, subject, body) VALUES ('delete', old.id, old.subject, old.body);
END;

CREATE TRIGGER emails_au AFTER UPDATE ON emails BEGIN
  INSERT INTO emails_fts (emails_fts, rowid, subject, body) VALUES ('delete', old.id, old.subject, old.body);
  INSERT INTO emails_fts (rowid, subject, body) VALUES (new.id, new.subject, new.body);
END;

CREATE TABLE attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id     INTEGER NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  filename     TEXT,
  content_type TEXT,
  r2_key       TEXT    NOT NULL,
  size         INTEGER
);

CREATE INDEX idx_attachments_email_id ON attachments (email_id);

CREATE TABLE blocklist (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT    NOT NULL UNIQUE
);

-- Allowlist for SMS notifications. kind='sender' matches message.from;
-- kind='alias' matches message.to (the recipient address on this account).
-- An alias pattern is the easiest way to notify on all inbound mail.
CREATE TABLE allowed_notifications (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT    NOT NULL,
  kind    TEXT    NOT NULL CHECK (kind IN ('sender', 'alias')),
  UNIQUE (pattern, kind)
);

CREATE TABLE nonces (
  nonce      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  ip       TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE sent (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   TEXT,
  from_address TEXT    NOT NULL,
  to_address   TEXT    NOT NULL,
  subject      TEXT,
  body         TEXT,
  in_reply_to  TEXT,
  created_at   INTEGER NOT NULL,
  cc_address   TEXT,
  bcc_address  TEXT
);

CREATE INDEX sent_created_at_idx ON sent (created_at DESC);
CREATE INDEX sent_message_id_idx ON sent (message_id);

CREATE TABLE contacts (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  avatar_url TEXT
);
