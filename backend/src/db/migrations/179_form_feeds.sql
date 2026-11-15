-- Migration 179: a data path (feed) for each form, for ArcGIS, Power BI and other systems.
--
-- form_feeds  : one row per organisation and form: sync settings and the ArcGIS
--               related table the records are copied to (never the shapes layer).
-- feed_keys   : read-only keys, each limited to ONE form of ONE organisation.
--               Only a SHA-256 hash is stored; the key is shown once.

CREATE TABLE IF NOT EXISTS form_feeds (
  organization_id  UUID        NOT NULL,
  form             VARCHAR(40) NOT NULL,
  arcgis_table_url TEXT,
  arcgis_layer_id  UUID,
  sync_mode        VARCHAR(10) NOT NULL DEFAULT 'off' CHECK (sync_mode IN ('off', 'save', 'hourly', 'daily')),
  include_names    BOOLEAN     NOT NULL DEFAULT false,
  last_synced_at   TIMESTAMPTZ,
  last_sync_count  INT,
  last_error       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, form)
);

CREATE TABLE IF NOT EXISTS feed_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID        NOT NULL,
  form            VARCHAR(40) NOT NULL,
  key_hash        CHAR(64)    NOT NULL UNIQUE,
  key_prefix      VARCHAR(16) NOT NULL,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used       TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feed_keys_org_form ON feed_keys (organization_id, form) WHERE revoked_at IS NULL;
