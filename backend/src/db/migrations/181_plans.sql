-- Editions and limits per organization (commercial plan, phase 2).
-- Existing organizations stay on Enterprise (no limits) so nothing that runs today breaks;
-- the platform admin moves an organization to another edition.

CREATE TABLE IF NOT EXISTS plan_editions (
  key         VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(60) NOT NULL,
  max_sites   INT,            -- NULL = no limit
  max_fields  INT,
  max_users   INT,
  modules     TEXT[] NOT NULL DEFAULT '{}',
  sort_order  INT NOT NULL DEFAULT 0
);

INSERT INTO plan_editions (key, label, max_sites, max_fields, max_users, modules, sort_order) VALUES
  ('starter',      'Starter',               1,    25,   10,   ARRAY['core'], 1),
  ('professional', 'Professional',          3,    150,  50,   ARRAY['core','gis','operations'], 2),
  ('enterprise',   'Enterprise',            NULL, NULL, NULL, ARRAY['core','gis','operations','remote_sensing','ai','api'], 3),
  ('government',   'Government & research', NULL, NULL, NULL, ARRAY['core','gis','operations','remote_sensing','ai','api'], 4)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, max_sites = EXCLUDED.max_sites, max_fields = EXCLUDED.max_fields,
  max_users = EXCLUDED.max_users, modules = EXCLUDED.modules, sort_order = EXCLUDED.sort_order;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'enterprise' REFERENCES plan_editions(key);
-- Per-organization overrides, e.g. {"fields": 200, "modules": ["core","gis","ai"]} for an add-on.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_renews_at DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email VARCHAR(200);

-- Limit check in the database, so every path that adds a site, field or user is covered
-- (forms, ArcGIS import, staff enrollment). Raises PLAN_LIMIT:<what>:<limit>.
CREATE OR REPLACE FUNCTION agro_plan_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  what TEXT := TG_ARGV[0];
  lim  INT;
  cnt  INT;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT (
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
     ) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE((o.plan_overrides ->> what)::int,
                  CASE what WHEN 'sites' THEN e.max_sites WHEN 'fields' THEN e.max_fields ELSE e.max_users END)
    INTO lim
    FROM organizations o LEFT JOIN plan_editions e ON e.key = o.plan
   WHERE o.id = NEW.organization_id;
  IF lim IS NULL THEN RETURN NEW; END IF;
  -- One writer at a time per organization and kind, so two requests cannot both take the last place.
  PERFORM pg_advisory_xact_lock(hashtext('agro_plan:' || NEW.organization_id::text || ':' || what));
  IF what = 'users' THEN
    SELECT count(*) INTO cnt FROM users WHERE organization_id = NEW.organization_id AND deleted_at IS NULL AND is_active = true;
  ELSE
    EXECUTE format('SELECT count(*) FROM %I WHERE organization_id = $1 AND deleted_at IS NULL', TG_TABLE_NAME)
      INTO cnt USING NEW.organization_id;
  END IF;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT:%:%', what, lim USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plan_limit_sites ON sites;
CREATE TRIGGER trg_plan_limit_sites BEFORE INSERT OR UPDATE OF organization_id, deleted_at ON sites
  FOR EACH ROW EXECUTE FUNCTION agro_plan_limit('sites');
DROP TRIGGER IF EXISTS trg_plan_limit_fields ON fields;
CREATE TRIGGER trg_plan_limit_fields BEFORE INSERT OR UPDATE OF organization_id, deleted_at ON fields
  FOR EACH ROW EXECUTE FUNCTION agro_plan_limit('fields');
DROP TRIGGER IF EXISTS trg_plan_limit_users ON users;
CREATE TRIGGER trg_plan_limit_users BEFORE INSERT OR UPDATE OF organization_id, deleted_at ON users
  FOR EACH ROW EXECUTE FUNCTION agro_plan_limit('users');
