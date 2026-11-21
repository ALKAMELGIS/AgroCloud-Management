import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';

/*
 * Commercial editions (migration 181). Limits are enforced in the database by
 * agro_plan_limit(); this service reads the plan, usage and modules for the UI.
 */

export type PlanKind = 'sites' | 'fields' | 'users';
export const PLAN_KINDS: PlanKind[] = ['sites', 'fields', 'users'];
export const MODULES = ['core', 'gis', 'operations', 'remote_sensing', 'ai', 'api'] as const;

export type Edition = {
  key: string;
  label: string;
  limits: Record<PlanKind, number | null>;
  modules: string[];
};

function mapEdition(r: any): Edition {
  return {
    key: r.key,
    label: r.label,
    limits: { sites: r.max_sites ?? null, fields: r.max_fields ?? null, users: r.max_users ?? null },
    modules: r.modules || [],
  };
}

export async function listEditions(): Promise<Edition[]> {
  const r = await dbPool.query('SELECT * FROM plan_editions ORDER BY sort_order');
  return r.rows.map(mapEdition);
}

/** The organization's edition with overrides applied, its usage and renewal. */
export async function getOrganizationPlan(orgId: string) {
  const r = await dbPool.query(
    `SELECT o.plan, o.plan_overrides, o.plan_renews_at, o.billing_email, e.*,
            (SELECT count(*) FROM sites  s WHERE s.organization_id = o.id AND s.deleted_at IS NULL)::int AS used_sites,
            (SELECT count(*) FROM fields f WHERE f.organization_id = o.id AND f.deleted_at IS NULL)::int AS used_fields,
            (SELECT count(*) FROM users  u WHERE u.organization_id = o.id AND u.deleted_at IS NULL AND u.is_active = true)::int AS used_users
       FROM organizations o JOIN plan_editions e ON e.key = o.plan
      WHERE o.id = $1`,
    [orgId],
  );
  const row = r.rows[0];
  if (!row) throw new AppError('Organization not found', 'NOT_FOUND', 404);
  const ed = mapEdition(row);
  const ov = (row.plan_overrides || {}) as Record<string, unknown>;
  const limits = { ...ed.limits };
  PLAN_KINDS.forEach((k) => { if (Number.isFinite(Number(ov[k])) && ov[k] !== null) limits[k] = Number(ov[k]); });
  const modules = Array.isArray(ov.modules) ? (ov.modules as string[]) : ed.modules;
  return {
    plan: ed.key,
    label: ed.label,
    limits,
    usage: { sites: row.used_sites, fields: row.used_fields, users: row.used_users },
    modules,
    renewsAt: row.plan_renews_at ? new Date(row.plan_renews_at).toISOString().slice(0, 10) : null,
    billingEmail: row.billing_email || null,
    editions: await listEditions(),
  };
}

export async function setBillingEmail(orgId: string, email: string | null) {
  await dbPool.query('UPDATE organizations SET billing_email = $2, updated_at = NOW() WHERE id = $1', [orgId, email]);
}

/** Platform admin: move an organization to an edition, with optional overrides and renewal date. */
export async function setOrganizationPlan(orgId: string, data: { plan: string; overrides?: Record<string, unknown>; renewsAt?: string | null }) {
  const ed = await dbPool.query('SELECT key FROM plan_editions WHERE key = $1', [data.plan]);
  if (!ed.rowCount) throw new AppError(`Unknown plan ${data.plan}`, 'VALIDATION_ERROR', 400);
  const r = await dbPool.query(
    `UPDATE organizations SET plan = $2, plan_overrides = COALESCE($3::jsonb, plan_overrides), plan_renews_at = $4, updated_at = NOW()
      WHERE id = $1 RETURNING id`,
    [orgId, data.plan, data.overrides ? JSON.stringify(data.overrides) : null, data.renewsAt ?? null],
  );
  if (!r.rowCount) throw new AppError('Organization not found', 'NOT_FOUND', 404);
  return getOrganizationPlan(orgId);
}

const WORD: Record<string, string> = { sites: 'sites', fields: 'fields', users: 'active users' };

/** "PLAN_LIMIT:fields:25" from the database trigger -> a message people can act on. */
export function planLimitMessage(dbMessage: string): { kind: string; limit: number; message: string } | null {
  const m = /PLAN_LIMIT:(\w+):(\d+)/.exec(dbMessage || '');
  if (!m) return null;
  const limit = Number(m[2]);
  return {
    kind: m[1],
    limit,
    message: `Your plan allows ${limit} ${WORD[m[1]] || m[1]}. Remove one or ask your AgroCloud account manager to change the plan.`,
  };
}
