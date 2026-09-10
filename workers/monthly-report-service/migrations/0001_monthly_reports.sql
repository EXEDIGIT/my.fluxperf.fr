PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monthly_reports (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  source_properties_json TEXT NOT NULL,
  report_json TEXT,
  insight TEXT,
  impact_json TEXT,
  error_message TEXT,
  template_version TEXT,
  created_at TEXT NOT NULL,
  generated_at TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(client_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_queue
  ON monthly_reports(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period_key);

CREATE TABLE IF NOT EXISTS monthly_report_deliveries (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  idempotency_key TEXT NOT NULL,
  brevo_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(report_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_deliveries_queue
  ON monthly_report_deliveries(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS monthly_report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT REFERENCES monthly_reports(id) ON DELETE CASCADE,
  delivery_id TEXT REFERENCES monthly_report_deliveries(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monthly_events_report ON monthly_report_events(report_id, created_at DESC);
