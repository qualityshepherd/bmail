-- Every distinct recipient address that has cleared the blocklist and wasn't
-- classified spam gets recorded here, permanently (unlike the emails table,
-- which ages Trash/Spam out after 30 days). This is the allow-list a
-- catch-all lockdown ("known-only" mode) checks against - see pipeline.js.
CREATE TABLE known_recipients (
  address TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);
