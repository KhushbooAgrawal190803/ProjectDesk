-- =============================================
-- System Console: encrypted shared workbook
-- All stored data is ciphertext only — no plaintext ever reaches the server.
-- Passphrase is derived client-side; key material never leaves the browser.
-- =============================================

-- Singleton metadata row: KDF salt + schema version
-- Rotating kdf_salt after a wipe makes every previous snapshot undecryptable
-- even if someone has a database backup, because the passphrase (in the admin's
-- memory / sessionStorage) was never persisted server-side.
CREATE TABLE IF NOT EXISTS system_console_meta (
  id          INTEGER  PRIMARY KEY,
  kdf_salt    TEXT     NOT NULL,
  version     INTEGER  NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT  singleton CHECK (id = 1)
);

-- Encrypted cells — 100 rows × 100 cols
-- cipher_text and iv are hex-encoded AES-GCM output.
CREATE TABLE IF NOT EXISTS system_console_cells (
  id          UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  row_index   SMALLINT NOT NULL CHECK (row_index BETWEEN 0 AND 99),
  col_index   SMALLINT NOT NULL CHECK (col_index BETWEEN 0 AND 99),
  cipher_text TEXT     NOT NULL,
  iv          TEXT     NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT  unique_cell UNIQUE (row_index, col_index)
);

CREATE INDEX IF NOT EXISTS idx_console_cells_updated ON system_console_cells(updated_at);

-- ── Row Level Security ─────────────────────────────────────────────────────
-- No permissive policies are created.
-- All access goes through createServiceClient() (service role bypasses RLS).
-- Direct JWT-authenticated clients cannot read or write any cell data.
ALTER TABLE system_console_meta  ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_console_cells ENABLE ROW LEVEL SECURITY;
