-- Two single-row counters, same shape as sms_notification_state: id=1 is a
-- global (not per-IP) burst window, id=2 is a rolling daily cap. A stolen
-- session sending across many IPs evades the per-IP cap in send_attempts
-- but not these - they count every send regardless of where it came from.
CREATE TABLE send_volume_state (
  id INTEGER PRIMARY KEY CHECK (id IN (1, 2)),
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
