-- Migrazione tabella sorgenti di traffico (GDPR-friendly, nessun IP o dato personale)
CREATE TABLE IF NOT EXISTS traffic_sources (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL,
  utm_medium TEXT,
  referrer TEXT,
  landing_path TEXT NOT NULL DEFAULT '/',
  device_type TEXT NOT NULL DEFAULT 'desktop'
);

CREATE INDEX IF NOT EXISTS idx_traffic_sources_date
  ON traffic_sources (date DESC);

CREATE INDEX IF NOT EXISTS idx_traffic_sources_source_date
  ON traffic_sources (source, date DESC);
