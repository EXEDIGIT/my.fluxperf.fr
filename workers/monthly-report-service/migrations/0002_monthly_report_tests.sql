PRAGMA foreign_keys = ON;

-- Test deliveries are deliberately separate from the real monthly history.
CREATE TABLE IF NOT EXISTS monthly_report_test_runs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  report_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_test_runs_client
  ON monthly_report_test_runs(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monthly_report_test_deliveries (
  id TEXT PRIMARY KEY,
  test_run_id TEXT NOT NULL REFERENCES monthly_report_test_runs(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  attempts INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL,
  brevo_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monthly_report_test_deliveries_run
  ON monthly_report_test_deliveries(test_run_id, created_at);
