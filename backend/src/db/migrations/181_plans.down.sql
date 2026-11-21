DROP TRIGGER IF EXISTS trg_plan_limit_sites ON sites;
DROP TRIGGER IF EXISTS trg_plan_limit_fields ON fields;
DROP TRIGGER IF EXISTS trg_plan_limit_users ON users;
DROP FUNCTION IF EXISTS agro_plan_limit();
ALTER TABLE organizations DROP COLUMN IF EXISTS billing_email;
ALTER TABLE organizations DROP COLUMN IF EXISTS plan_renews_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS plan_overrides;
ALTER TABLE organizations DROP COLUMN IF EXISTS plan;
DROP TABLE IF EXISTS plan_editions;
