jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn() } }));
jest.mock('../task.service', () => ({ createTask: jest.fn(async (d: any) => ({ id: 't-1', title: d.title })) }));
jest.mock('../auditLog.service', () => ({ logAuditEvent: jest.fn(async () => undefined) }));

import { dbPool } from '../../db/client';
import { createTask } from '../task.service';
import { logAuditEvent } from '../auditLog.service';
import { propose, confirm, cancel } from '../ai/actions';

const query = dbPool.query as jest.Mock;
const ctx = (over: any = {}) => ({ orgId: 'org', userId: 'u1', role: 'worker', siteIds: ['s1'], lang: 'en' as const, ...over });
const actor = (over: any = {}) => ({ userId: 'u1', role: 'worker', orgId: 'org', siteIds: ['s1'], ...over });

beforeEach(() => {
  query.mockReset();
  (createTask as jest.Mock).mockClear();
  (logAuditEvent as jest.Mock).mockClear();
});

test('propose stores a pending action and changes no business data', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/FROM bi\.dim_location/.test(sql)) return { rows: [{ field_id: 'f1', field_name: 'GH-02', site_name: 'Site 1' }] };
    if (/INSERT INTO ai_actions/.test(sql)) return { rows: [{ id: 'a1' }] };
    return { rows: [] };
  });
  const card = await propose('create_task', { title: 'Check drippers', field: 'GH-02', due_date: '2026-11-21' }, ctx(), 'c1');
  expect(card).toMatchObject({ kind: 'action', id: 'a1', status: 'pending', title: 'New task: Check drippers' });
  expect(createTask).not.toHaveBeenCalled();
  const fieldSql = query.mock.calls.find((c) => /dim_location/.test(String(c[0])))!;
  expect(String(fieldSql[0])).toMatch(/l\.site_id = ANY\(\$3::uuid\[\]\)/);
  expect(fieldSql[1]).toEqual(['org', 'GH-02', ['s1']]);
  const sqls = query.mock.calls.map((c) => String(c[0]));
  expect(sqls.some((s) => /INSERT INTO tasks/.test(s))).toBe(false);
});

test('a role that cannot create tasks cannot even propose one', async () => {
  await expect(propose('create_task', { title: 'x' }, ctx({ role: 'viewer' }), null)).rejects.toThrow(/cannot do this action/);
  expect(query).not.toHaveBeenCalled();
});

test('unknown action kinds and bad dates are refused', async () => {
  await expect(propose('delete_everything', {}, ctx(), null)).rejects.toThrow(/Unknown action/);
  await expect(propose('create_task', { title: 'x', due_date: 'tomorrow' }, ctx(), null)).rejects.toThrow(/YYYY-MM-DD/);
});

test('confirm runs once for the same user and writes the audit log', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/SELECT \*, created_at/.test(sql)) return { rows: [{ id: 'a1', kind: 'create_task', status: 'pending', stale: false, payload: { title: 'Check drippers', priority: 'high' } }] };
    if (/SET status = 'done'/.test(sql)) return { rowCount: 1, rows: [{ id: 'a1' }] };
    return { rows: [], rowCount: 1 };
  });
  const out = await confirm('a1', actor());
  expect(out.status).toBe('done');
  expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Check drippers', assigned_by: 'u1' }));
  expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ entity: 'task', entityId: 't-1', metadata: expect.objectContaining({ source: 'ai_assistant' }) }));
  const own = query.mock.calls.find((c) => /SELECT \*, created_at/.test(String(c[0])))!;
  expect(String(own[0])).toMatch(/user_id = \$2 AND organization_id = \$3/);
});

test('a second confirm (double click) does not run the action again', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/SELECT \*, created_at/.test(sql)) return { rows: [{ id: 'a1', kind: 'create_task', status: 'pending', stale: false, payload: { title: 'x' } }] };
    if (/SET status = 'done'/.test(sql)) return { rowCount: 0, rows: [] };
    return { rows: [] };
  });
  await expect(confirm('a1', actor())).rejects.toThrow(/already handled/);
  expect(createTask).not.toHaveBeenCalled();
});

test('old proposals expire and handled ones cannot be cancelled', async () => {
  query.mockImplementation(async (sql: string) => (/SELECT \*, created_at/.test(sql)
    ? { rows: [{ id: 'a1', kind: 'create_task', status: 'pending', stale: true, payload: {} }] } : { rows: [] }));
  await expect(confirm('a1', actor())).rejects.toThrow(/older than 24 hours/);
  query.mockImplementation(async () => ({ rows: [{ id: 'a1', status: 'done', stale: false }] }));
  await expect(cancel('a1', actor())).rejects.toThrow(/already done/);
});
