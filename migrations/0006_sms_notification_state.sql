CREATE TABLE sms_notification_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
