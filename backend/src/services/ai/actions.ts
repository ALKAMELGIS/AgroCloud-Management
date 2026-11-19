import { dbPool } from '../../db/client';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { canOperateWorkforce } from '../../utils/roleAccess';
import { createTask } from '../task.service';
import { logAuditEvent } from '../auditLog.service';
import type { ToolContext } from './tools';

/**
 * AI Agent actions. The model can only PROPOSE one: the proposal is checked
 * against the user's permissions and sites, stored as 'pending', and shown as a
 * card. It runs only when the same user presses Confirm, through the normal
 * service, and is written to the audit log. Proposals expire after 24 hours.
 *
 * To add an action: add an entry to KINDS (check → summary + payload, run → result).
 */

export interface Requester { userId: string; role: string; orgId: string; siteIds: string[] | null }

interface Checked { payload: Record<string, any>; title: string; lines: Array<[string, string]> }

interface ActionKind {
  description: string;
  input_schema: Record<string, any>;
  allowed: (role: string) => boolean;
  check: (input: any, r: Requester) => Promise<Checked>;
  run: (payload: Record<string, any>, r: Requester) => Promise<{ entity: string; id: string; link: string; label: string }>;
}

async function findField(name: string, r: Requester) {
  const params: any[] = [r.orgId, String(name).trim()];
  let site = '';
  if (r.siteIds !== null) { params.push(r.siteIds); site = ` AND l.site_id = ANY($${params.length}::uuid[])`; }
  const { rows } = await dbPool.query(
    `SELECT l.field_id, l.field_name, l.site_name FROM bi.dim_location l
      WHERE l.organization_id = $1 AND NOT l.is_deleted${site}
        AND (LOWER(l.field_name) = LOWER($2) OR LOWER(l.gis_farm_code) = LOWER($2))
      LIMIT 2`,
    params,
  );
  if (!rows.length) throw new AppError(`No field "${name}" among the fields this user can see.`, 'NOT_FOUND', 404);
  return rows[0];
}

async function findUser(who: string, r: Requester) {
  const { rows } = await dbPool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(name), ''), email) AS label FROM users
      WHERE organization_id = $1 AND is_active IS NOT FALSE
        AND (LOWER(email) = LOWER($2) OR LOWER(name) = LOWER($2))
      LIMIT 2`,
    [r.orgId, String(who).trim()],
  );
  if (rows.length !== 1) throw new AppError(rows.length ? `More than one user is called "${who}"; use the email.` : `No user "${who}" in this organisation.`, 'NOT_FOUND', 404);
  return rows[0];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const KINDS: Record<string, ActionKind> = {
  create_task: {
    description: 'Create a task in Tasks (optionally on a field, with a due date and an assignee).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        field: { type: 'string', description: 'Field name or ArcGIS Farm_Code' },
        assignee: { type: 'string', description: 'User name or email in the same organisation' },
      },
      required: ['title'],
    },
    allowed: (role) => canOperateWorkforce(role as any),
    async check(input, r) {
      const title = String(input?.title || '').trim().slice(0, 500);
      if (!title) throw new AppError('A task needs a title.', 'VALIDATION_ERROR', 400);
      const priority = ['urgent', 'high', 'medium', 'low'].includes(input?.priority) ? input.priority : 'medium';
      const due = input?.due_date ? String(input.due_date) : null;
      if (due && !DATE.test(due)) throw new AppError('due_date must be YYYY-MM-DD.', 'VALIDATION_ERROR', 400);
      const field = input?.field ? await findField(input.field, r) : null;
      const assignee = input?.assignee ? await findUser(input.assignee, r) : null;
      const lines: Array<[string, string]> = [['Priority', priority]];
      if (field) lines.push(['Field', `${field.field_name} · ${field.site_name}`]);
      if (due) lines.push(['Due', due]);
      if (assignee) lines.push(['Assigned to', assignee.label]);
      if (input?.description) lines.push(['Details', String(input.description).slice(0, 300)]);
      return {
        title: `New task: ${title}`,
        lines,
        payload: {
          title,
          description: input?.description ? String(input.description).slice(0, 5000) : undefined,
          priority,
          due_date: due || undefined,
          field_id: field?.field_id,
          assigned_to: assignee?.id,
        },
      };
    },
    async run(payload, r) {
      const task = await createTask({ ...payload, assigned_by: r.userId } as any);
      return { entity: 'task', id: task.id, link: '/tasks', label: task.title };
    },
  },
};

export const PROPOSE_TOOL = {
  name: 'propose_action',
  description: `Propose a change for the user to confirm. Nothing changes until the user presses Confirm on the card, so never say it is done.
Kinds: ${Object.entries(KINDS).map(([k, v]) => `${k} — ${v.description}`).join(' | ')}.
Fill "input" with the fields of that kind. Ask the user for anything essential that is missing instead of guessing.`,
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: Object.keys(KINDS) },
      input: { type: 'object', description: 'Fields of the chosen kind', properties: KINDS.create_task.input_schema.properties },
    },
    required: ['kind', 'input'],
  },
};

export interface ActionArtifact {
  kind: 'action';
  id: string;
  action: string;
  title: string;
  lines: Array<[string, string]>;
  status: string;
  result?: any;
}

/** Called by the propose_action tool. Stores a pending proposal; changes no business data. */
export async function propose(kind: string, input: any, ctx: ToolContext, conversationId: string | null): Promise<ActionArtifact> {
  const def = KINDS[kind];
  if (!def) throw new AppError(`Unknown action ${kind}`, 'VALIDATION_ERROR', 400);
  const r: Requester = { userId: ctx.userId, role: ctx.role, orgId: ctx.orgId, siteIds: ctx.siteIds };
  if (!def.allowed(r.role)) throw new AppError('This user\'s role cannot do this action; tell them which screen or person can.', 'FORBIDDEN', 403);
  const checked = await def.check(input, r);
  const { rows } = await dbPool.query(
    `INSERT INTO ai_actions (organization_id, user_id, conversation_id, kind, payload, summary)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [r.orgId, r.userId, conversationId, kind, JSON.stringify(checked.payload), JSON.stringify({ title: checked.title, lines: checked.lines })],
  );
  return { kind: 'action', id: rows[0].id, action: kind, title: checked.title, lines: checked.lines, status: 'pending' };
}

async function ownPending(id: string, r: Requester) {
  const { rows } = await dbPool.query(
    `SELECT *, created_at < NOW() - INTERVAL '24 hours' AS stale FROM ai_actions
      WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
    [id, r.userId, r.orgId],
  );
  const row = rows[0];
  if (!row) throw new AppError('Action not found', 'NOT_FOUND', 404);
  if (row.status !== 'pending') throw new AppError(`This action is already ${row.status}.`, 'CONFLICT', 409);
  if (row.stale) {
    await dbPool.query(`UPDATE ai_actions SET status = 'expired', decided_at = NOW() WHERE id = $1`, [id]);
    throw new AppError('This proposal is older than 24 hours. Ask the assistant again.', 'CONFLICT', 409);
  }
  return row;
}

/** The user pressed Confirm: re-check permissions, run it, audit it. */
export async function confirm(id: string, r: Requester) {
  const row = await ownPending(id, r);
  const def = KINDS[row.kind];
  if (!def || !def.allowed(r.role)) throw new AppError('You cannot do this action.', 'FORBIDDEN', 403);
  // Claim it first so a double click cannot run it twice.
  const claimed = await dbPool.query(`UPDATE ai_actions SET status = 'done', decided_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
  if (!claimed.rowCount) throw new AppError('This action was already handled.', 'CONFLICT', 409);
  try {
    const result = await def.run(row.payload, r);
    await dbPool.query(`UPDATE ai_actions SET result = $2 WHERE id = $1`, [id, JSON.stringify(result)]);
    await logAuditEvent({
      userId: r.userId,
      action: 'CREATE',
      entity: result.entity as any,
      entityId: result.id,
      changes: row.payload,
      metadata: { source: 'ai_assistant', aiActionId: id, kind: row.kind },
    });
    return { id, status: 'done', result };
  } catch (e: any) {
    logger.error({ err: e?.message, id, kind: row.kind }, 'AI action failed');
    await dbPool.query(`UPDATE ai_actions SET status = 'failed', error = $2 WHERE id = $1`, [id, String(e?.message || 'failed').slice(0, 500)]);
    throw e;
  }
}

export async function cancel(id: string, r: Requester) {
  await ownPending(id, r);
  await dbPool.query(`UPDATE ai_actions SET status = 'cancelled', decided_at = NOW() WHERE id = $1 AND status = 'pending'`, [id]);
  return { id, status: 'cancelled' };
}

/** Current status of the action cards in stored messages (they change after the answer was saved). */
export async function overlayStatus(messages: any[], userId: string) {
  const ids = messages.flatMap((m) => (Array.isArray(m.artifacts) ? m.artifacts : []).filter((a: any) => a?.kind === 'action').map((a: any) => a.id));
  if (!ids.length) return messages;
  const { rows } = await dbPool.query(`SELECT id, status, result FROM ai_actions WHERE id = ANY($1::uuid[]) AND user_id = $2`, [ids, userId]);
  const by = new Map(rows.map((x: any) => [x.id, x]));
  return messages.map((m) => ({
    ...m,
    artifacts: (m.artifacts || []).map((a: any) => (a?.kind === 'action' && by.has(a.id) ? { ...a, status: (by.get(a.id) as any).status, result: (by.get(a.id) as any).result } : a)),
  }));
}
