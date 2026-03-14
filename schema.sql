CREATE TABLE IF NOT EXISTS licenses (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  key               TEXT NOT NULL UNIQUE,
  plan              TEXT NOT NULL DEFAULT 'standard',
  active            BOOLEAN NOT NULL DEFAULT true,
  stripe_customer_id TEXT,
  stripe_payment_id  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);

CREATE TABLE IF NOT EXISTS templates (
  version      TEXT PRIMARY KEY,
  data         BYTEA NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
