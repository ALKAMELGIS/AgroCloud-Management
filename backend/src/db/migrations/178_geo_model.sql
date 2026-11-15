-- Migration 178: the system's own geodatabase model.
--
-- Zones, sites, farm areas and fields are drawn in AgroCloud itself (no ArcGIS
-- layer needed). Each level gets:
--   * a geometry (fields already have `polygon`),
--   * a permanent readable key (KeyID) that never changes once set,
--   * a subtype code, whose list, names and colours live in geo_subtypes,
-- plus coded/range domains for attributes and an edit history.
-- Everything is additive: no existing column is renamed or rewritten, and forms
-- keep linking to fields by their UUID.

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Geometry, KeyID and subtype on the hierarchy -----------------------------
ALTER TABLE countries  ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326);
ALTER TABLE sites      ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326);
ALTER TABLE farm_areas ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326);

ALTER TABLE countries  ADD COLUMN IF NOT EXISTS key_id VARCHAR(40);
ALTER TABLE sites      ADD COLUMN IF NOT EXISTS key_id VARCHAR(40);
ALTER TABLE farm_areas ADD COLUMN IF NOT EXISTS key_id VARCHAR(40);
ALTER TABLE fields     ADD COLUMN IF NOT EXISTS key_id VARCHAR(40);

ALTER TABLE countries  ADD COLUMN IF NOT EXISTS subtype_code SMALLINT;
ALTER TABLE sites      ADD COLUMN IF NOT EXISTS subtype_code SMALLINT;
ALTER TABLE farm_areas ADD COLUMN IF NOT EXISTS subtype_code SMALLINT;
ALTER TABLE fields     ADD COLUMN IF NOT EXISTS subtype_code SMALLINT;

ALTER TABLE countries  ADD COLUMN IF NOT EXISTS geom_updated_at TIMESTAMPTZ;
ALTER TABLE sites      ADD COLUMN IF NOT EXISTS geom_updated_at TIMESTAMPTZ;
ALTER TABLE farm_areas ADD COLUMN IF NOT EXISTS geom_updated_at TIMESTAMPTZ;
ALTER TABLE fields     ADD COLUMN IF NOT EXISTS geom_updated_at TIMESTAMPTZ;

-- Where the current shape came from: 'arcgis' (imported) or 'agrocloud' (drawn / edited here).
ALTER TABLE countries  ADD COLUMN IF NOT EXISTS geom_source VARCHAR(12);
ALTER TABLE sites      ADD COLUMN IF NOT EXISTS geom_source VARCHAR(12);
ALTER TABLE farm_areas ADD COLUMN IF NOT EXISTS geom_source VARCHAR(12);
ALTER TABLE fields     ADD COLUMN IF NOT EXISTS geom_source VARCHAR(12);

CREATE INDEX IF NOT EXISTS idx_countries_geom  ON countries  USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_sites_geom      ON sites      USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_farm_areas_geom ON farm_areas USING GIST (geom);

-- 2. Subtypes ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_subtypes (
  class_key   VARCHAR(20)  NOT NULL CHECK (class_key IN ('zone', 'site', 'farm_area', 'field')),
  code        SMALLINT     NOT NULL,
  name_en     VARCHAR(80)  NOT NULL,
  name_ar     VARCHAR(80)  NOT NULL,
  key_prefix  VARCHAR(6),
  fill_color  VARCHAR(9)   NOT NULL DEFAULT '#1f7a4d',
  line_color  VARCHAR(9)   NOT NULL DEFAULT '#165c3a',
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (class_key, code)
);

-- Field / farm-area subtypes mirror the Structure_Type domain of Agro_Structures (same codes).
INSERT INTO geo_subtypes (class_key, code, name_en, name_ar, key_prefix, fill_color, line_color, sort_order) VALUES
  ('zone', 1, 'Region', 'منطقة', NULL, '#e8f2ec', '#165c3a', 1),
  ('site', 1, 'Farm site', 'موقع مزرعة', 'S', '#e8f2ec', '#1f7a4d', 1),
  ('site', 2, 'Nursery site', 'موقع مشتل', 'S', '#f1f7e8', '#4d7c0f', 2),
  ('site', 9, 'Unassigned', 'غير مخصص', 'S', '#f3f5f2', '#6b746e', 9),
  ('farm_area', 1000, 'Greenhouse', 'بيت محمي', 'A', '#ffffff', '#267300', 1),
  ('farm_area', 1001, 'Nethouse', 'بيت شبكي', 'A', '#e6f4ff', '#005ce6', 2),
  ('farm_area', 1002, 'Glasshouse', 'بيت زجاجي', 'A', '#eef6f6', '#2f7f7f', 3),
  ('farm_area', 1003, 'Retractable Roof Houses', 'بيت بسقف متحرك', 'A', '#f3ecff', '#6a3fb5', 4),
  ('farm_area', 1004, 'Cravo', 'كرافو', 'A', '#fdeee6', '#b5532a', 5),
  ('farm_area', 1005, 'Dates Farm', 'مزرعة نخيل', 'A', '#f6efdc', '#8a6d1d', 6),
  ('farm_area', 1006, 'PIVOT', 'محوري', 'A', '#e6ffd9', '#38a800', 7),
  ('farm_area', 1007, 'Farm Plots', 'قطع زراعية', 'A', '#fff4d6', '#a87000', 8),
  ('field', 1000, 'Greenhouse', 'بيت محمي', 'F', '#ffffff', '#267300', 1),
  ('field', 1001, 'Nethouse', 'بيت شبكي', 'F', '#e6f4ff', '#005ce6', 2),
  ('field', 1002, 'Glasshouse', 'بيت زجاجي', 'F', '#eef6f6', '#2f7f7f', 3),
  ('field', 1003, 'Retractable Roof Houses', 'بيت بسقف متحرك', 'F', '#f3ecff', '#6a3fb5', 4),
  ('field', 1004, 'Cravo', 'كرافو', 'F', '#fdeee6', '#b5532a', 5),
  ('field', 1005, 'Dates Farm', 'مزرعة نخيل', 'F', '#f6efdc', '#8a6d1d', 6),
  ('field', 1006, 'PIVOT', 'محوري', 'F', '#e6ffd9', '#38a800', 7),
  ('field', 1007, 'Farm Plots', 'قطع زراعية', 'F', '#fff4d6', '#a87000', 8)
ON CONFLICT (class_key, code) DO NOTHING;

-- 3. Domains -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_domains (
  key       VARCHAR(40) PRIMARY KEY,
  name_en   VARCHAR(80) NOT NULL,
  name_ar   VARCHAR(80) NOT NULL,
  kind      VARCHAR(10) NOT NULL CHECK (kind IN ('coded', 'range')),
  min_value NUMERIC,
  max_value NUMERIC,
  unit      VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS geo_domain_values (
  domain_key VARCHAR(40) NOT NULL REFERENCES geo_domains(key) ON DELETE CASCADE,
  code       VARCHAR(40) NOT NULL,
  name_en    VARCHAR(80) NOT NULL,
  name_ar    VARCHAR(80) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (domain_key, code)
);

INSERT INTO geo_domains (key, name_en, name_ar, kind, min_value, max_value, unit) VALUES
  ('irrigation_system', 'Irrigation system', 'نظام الري', 'coded', NULL, NULL, NULL),
  ('soil_type',         'Soil type',         'نوع التربة', 'coded', NULL, NULL, NULL),
  ('status',            'Status',            'الحالة',     'coded', NULL, NULL, NULL),
  ('dripper_count',     'Drippers',          'عدد النقاطات', 'range', 0, 1000000, 'count')
ON CONFLICT (key) DO NOTHING;

INSERT INTO geo_domain_values (domain_key, code, name_en, name_ar, sort_order) VALUES
  ('irrigation_system', 'drip',      'Drip',            'تنقيط',       1),
  ('irrigation_system', 'sprinkler', 'Sprinkler',       'رش',          2),
  ('irrigation_system', 'pivot',     'Centre pivot',    'محوري',       3),
  ('irrigation_system', 'flood',     'Flood',           'غمر',         4),
  ('irrigation_system', 'hydro',     'Hydroponic',      'زراعة مائية', 5),
  ('soil_type', 'sand',       'Sand',        'رملية',       1),
  ('soil_type', 'loamy_sand', 'Loamy sand',  'رملية طميية', 2),
  ('soil_type', 'loam',       'Loam',        'طميية',       3),
  ('soil_type', 'clay',       'Clay',        'طينية',       4),
  ('soil_type', 'substrate',  'Substrate',   'وسط زراعي',   5),
  ('status', 'active',   'Active',   'نشط',    1),
  ('status', 'fallow',   'Fallow',   'بور',     2),
  ('status', 'planned',  'Planned',  'مخطط',    3),
  ('status', 'retired',  'Retired',  'متوقف',   4)
ON CONFLICT (domain_key, code) DO NOTHING;

-- 4. Edit history -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_edit_history (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID,
  class_key       VARCHAR(20) NOT NULL,
  feature_id      UUID        NOT NULL,
  key_id          VARCHAR(40),
  operation       VARCHAR(20) NOT NULL,           -- draw | edit | delete | import | subtype
  geom_before     geometry(Geometry, 4326),
  geom_after      geometry(Geometry, 4326),
  attrs           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  edited_by       UUID,
  edited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_geo_edit_history_feature ON geo_edit_history (class_key, feature_id, edited_at DESC);

-- 5. KeyID: backfill, then assign on insert, then never change ------------------
-- Zone: its code (MH). Site: ZONE-Snn. Farm area: SITE-Ann. Field: SITE-Fnnn.
UPDATE countries SET key_id = UPPER(code) WHERE key_id IS NULL AND code IS NOT NULL;

UPDATE sites s SET key_id = x.k FROM (
  SELECT s2.id, UPPER(c.code) || '-S' || LPAD(ROW_NUMBER() OVER (PARTITION BY s2.country_id ORDER BY s2.created_at, s2.id)::text, 2, '0') AS k
  FROM sites s2 JOIN countries c ON c.id = s2.country_id
) x WHERE x.id = s.id AND s.key_id IS NULL;

UPDATE farm_areas fa SET key_id = x.k FROM (
  SELECT fa2.id, s.key_id || '-A' || LPAD(ROW_NUMBER() OVER (PARTITION BY fa2.site_id ORDER BY fa2.created_at, fa2.id)::text, 2, '0') AS k
  FROM farm_areas fa2 JOIN sites s ON s.id = fa2.site_id
  WHERE s.key_id IS NOT NULL
) x WHERE x.id = fa.id AND fa.key_id IS NULL;

-- Field: ZONE_ID-Farm_Code when the field carries the ArcGIS business key (Farm_Code
-- already starting with the zone is used as it is), otherwise SITE-Fnnn.
CREATE OR REPLACE FUNCTION geo_field_key(zone TEXT, farm TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  WITH k AS (SELECT regexp_replace(UPPER(TRIM(zone)), '\s+', '-', 'g') AS z, regexp_replace(UPPER(TRIM(farm)), '\s+', '-', 'g') AS f)
  SELECT CASE WHEN NULLIF(k.z, '') IS NULL OR NULLIF(k.f, '') IS NULL THEN NULL
              WHEN k.f LIKE k.z || '-%' THEN LEFT(k.f, 40)
              ELSE LEFT(k.z || '-' || k.f, 40) END
    FROM k
$$;

UPDATE fields f SET key_id = x.k FROM (
  SELECT id, geo_field_key(gis_zone_id, gis_farm_code) AS k,
         ROW_NUMBER() OVER (PARTITION BY organization_id, geo_field_key(gis_zone_id, gis_farm_code) ORDER BY created_at, id) AS n
    FROM fields WHERE deleted_at IS NULL AND geo_field_key(gis_zone_id, gis_farm_code) IS NOT NULL
) x WHERE x.id = f.id AND x.n = 1 AND f.key_id IS NULL;

UPDATE fields f SET key_id = x.k FROM (
  SELECT f2.id, s.key_id || '-F' || LPAD(ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY f2.created_at, f2.id)::text, 3, '0') AS k
  FROM fields f2 JOIN farm_areas fa ON fa.id = f2.farm_area_id JOIN sites s ON s.id = fa.site_id
  WHERE s.key_id IS NOT NULL
) x WHERE x.id = f.id AND f.key_id IS NULL;

CREATE OR REPLACE FUNCTION geo_next_key(prefix TEXT, sep TEXT, width INT, existing TEXT[]) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE n INT := 0; k TEXT; m INT;
BEGIN
  FOREACH k IN ARRAY COALESCE(existing, ARRAY[]::TEXT[]) LOOP
    IF k LIKE prefix || sep || '%' THEN
      m := NULLIF(regexp_replace(substr(k, length(prefix || sep) + 1), '[^0-9]', '', 'g'), '')::INT;
      IF m IS NOT NULL AND m > n THEN n := m; END IF;
    END IF;
  END LOOP;
  RETURN prefix || sep || LPAD((n + 1)::text, width, '0');
END $$;

CREATE OR REPLACE FUNCTION geo_assign_key() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE parent_key TEXT;
BEGIN
  -- One exception: a field numbered by the system (SITE-Fnnn) takes its ArcGIS key
  -- (ZONE_ID-Farm_Code) once, when it is first linked to the layer. Forms link by id.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'fields' THEN
    IF OLD.key_id ~ '-F[0-9]{3}$' AND OLD.gis_farm_code IS NULL
       AND NEW.key_id IS NOT DISTINCT FROM geo_field_key(NEW.gis_zone_id, NEW.gis_farm_code) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.key_id IS NOT NULL AND NEW.key_id IS DISTINCT FROM OLD.key_id THEN
    RAISE EXCEPTION 'key_id is permanent and cannot be changed (%).', OLD.key_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.key_id IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'countries' THEN
    NEW.key_id := UPPER(NEW.code);
  ELSIF TG_TABLE_NAME = 'sites' THEN
    SELECT key_id INTO parent_key FROM countries WHERE id = NEW.country_id;
    IF parent_key IS NOT NULL THEN
      NEW.key_id := geo_next_key(parent_key, '-S', 2, ARRAY(SELECT key_id FROM sites WHERE country_id = NEW.country_id AND key_id IS NOT NULL));
    END IF;
  ELSIF TG_TABLE_NAME = 'farm_areas' THEN
    SELECT key_id INTO parent_key FROM sites WHERE id = NEW.site_id;
    IF parent_key IS NOT NULL THEN
      NEW.key_id := geo_next_key(parent_key, '-A', 2, ARRAY(SELECT key_id FROM farm_areas WHERE site_id = NEW.site_id AND key_id IS NOT NULL));
    END IF;
  ELSIF TG_TABLE_NAME = 'fields' THEN
    NEW.key_id := geo_field_key(NEW.gis_zone_id, NEW.gis_farm_code);
    IF NEW.key_id IS NOT NULL THEN RETURN NEW; END IF;
    SELECT s.key_id INTO parent_key FROM farm_areas fa JOIN sites s ON s.id = fa.site_id WHERE fa.id = NEW.farm_area_id;
    IF parent_key IS NOT NULL THEN
      NEW.key_id := geo_next_key(parent_key, '-F', 3, ARRAY(
        SELECT f.key_id FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id
        WHERE fa.site_id = (SELECT site_id FROM farm_areas WHERE id = NEW.farm_area_id) AND f.key_id IS NOT NULL));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_countries_key ON countries;
CREATE TRIGGER trg_countries_key BEFORE INSERT OR UPDATE OF key_id ON countries FOR EACH ROW EXECUTE FUNCTION geo_assign_key();
DROP TRIGGER IF EXISTS trg_sites_key ON sites;
CREATE TRIGGER trg_sites_key BEFORE INSERT OR UPDATE OF key_id ON sites FOR EACH ROW EXECUTE FUNCTION geo_assign_key();
DROP TRIGGER IF EXISTS trg_farm_areas_key ON farm_areas;
CREATE TRIGGER trg_farm_areas_key BEFORE INSERT OR UPDATE OF key_id ON farm_areas FOR EACH ROW EXECUTE FUNCTION geo_assign_key();
DROP TRIGGER IF EXISTS trg_fields_key ON fields;
CREATE TRIGGER trg_fields_key BEFORE INSERT OR UPDATE OF key_id ON fields FOR EACH ROW EXECUTE FUNCTION geo_assign_key();

-- One KeyID per organisation level (soft: existing duplicates are reported, not fatal).
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_sites_key_id ON sites (key_id) WHERE key_id IS NOT NULL AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_areas_key_id ON farm_areas (key_id) WHERE key_id IS NOT NULL AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fields_key_id ON fields (organization_id, key_id) WHERE key_id IS NOT NULL AND deleted_at IS NULL;
  -- Relationship key with Agro_Structures: one field per ZONE_ID + Farm_Code.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fields_gis_key ON fields (organization_id, UPPER(gis_zone_id), UPPER(gis_farm_code))
    WHERE gis_zone_id IS NOT NULL AND gis_farm_code IS NOT NULL AND deleted_at IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Duplicate key_id values found; unique KeyID indexes not created.';
END $$;
