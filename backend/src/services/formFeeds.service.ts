/**
 * A data path (feed) for each form: its records as CSV, GeoJSON or JSON for
 * Power BI, Excel or any other system, and a copy in an ArcGIS related table
 * linked to Agro_Structures by GlobalID (Relationship class 1 : N).
 *
 * Every record of a form belongs to ONE field (or ONE site for the pump room),
 * so each form is 1 : N with the shapes. Fertigation and irrigation are entered
 * for a group of fields but saved one row per field, so they are 1 : N too and
 * need no bridge table.
 *
 * Feeds are read-only. Staff names are left out unless the organisation turns
 * them on for that form.
 */
import crypto from 'crypto';
import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { arcgisPost, parseFeatureServiceUrl } from './arcgis.service';

export type FeedFormat = 'csv' | 'geojson' | 'json';
type ColType = 'string' | 'double' | 'integer' | 'date';
interface Col { name: string; type: ColType; sql: string; personal?: boolean }
interface FeedForm {
  id: string;
  label: string;
  page: string;
  linkBy: 'field' | 'site';
  /** FROM … JOIN … — must expose aliases f (fields, field forms), s (sites) and the date expression. */
  from: string;
  date: string;
  order: string;
  cols: Col[];
}

const FIELD_LINK: Col[] = [
  { name: 'STRUCT_GLOBALID', type: 'string', sql: 'f.gis_external_id' },
  { name: 'KEYID', type: 'string', sql: 'f.key_id' },
  { name: 'FIELD_NAME', type: 'string', sql: 'f.name' },
  { name: 'SITE', type: 'string', sql: 's.name' },
];
const FIELD_JOIN = `JOIN fields f ON f.id = x.field_id
  LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
  LEFT JOIN sites s ON s.id = fa.site_id`;

export const FEED_FORMS: Record<string, FeedForm> = {
  ecph: {
    id: 'ecph', label: 'EC/PH Entry', page: '/ecph-entry', linkBy: 'field',
    from: `ecph_entries x ${FIELD_JOIN} LEFT JOIN ecph_valve_readings r ON r.ecph_entry_id = x.id`,
    date: 'x.date', order: 'x.date DESC, x.time DESC NULLS LAST, r.valve_number',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: `x.id::text || COALESCE('-' || r.valve_number::text, '')` },
      ...FIELD_LINK,
      { name: 'DATE', type: 'date', sql: 'x.date' },
      { name: 'TIME', type: 'string', sql: 'x.time::text' },
      { name: 'VALVE', type: 'string', sql: 'r.valve_number::text' },
      { name: 'EC_IN', type: 'double', sql: 'r.ec_in' },
      { name: 'EC_OUT', type: 'double', sql: 'r.ec' },
      { name: 'PH_IN', type: 'double', sql: 'r.ph_in' },
      { name: 'PH_OUT', type: 'double', sql: 'r.ph' },
      { name: 'DRAIN', type: 'double', sql: 'r.drain' },
      { name: 'DRAIN_PCT', type: 'double', sql: 'r.percent_drain' },
      { name: 'DRIP_VOLUME', type: 'double', sql: 'r.drip_volume' },
      { name: 'WATER_QTY', type: 'double', sql: 'COALESCE(r.qty_of_water, x.qty_of_water)' },
      { name: 'CYCLE', type: 'double', sql: 'COALESCE(r.cycle, x.cycle)' },
      { name: 'TOTAL_WATER', type: 'double', sql: 'COALESCE(r.total_water_qty, x.total_water_qty)' },
    ],
  },
  fertigation: {
    id: 'fertigation', label: 'Fertigation Entry', page: '/fertigation/entry', linkBy: 'field',
    from: `fertigation_entries x ${FIELD_JOIN} LEFT JOIN recipes rc ON rc.id = x.recipe_id`,
    date: 'x.date', order: 'x.date DESC',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: 'x.id::text' },
      ...FIELD_LINK,
      { name: 'DATE', type: 'date', sql: 'x.date' },
      { name: 'WEEK', type: 'integer', sql: 'x.week_number' },
      { name: 'RECIPE', type: 'string', sql: 'rc.name' },
      { name: 'FLOW_RATE', type: 'double', sql: 'x.flow_rate' },
      { name: 'FREQUENCY', type: 'double', sql: 'x.frequency' },
      { name: 'VALVES', type: 'integer', sql: 'x.valves_count' },
      { name: 'DAILY_WATER', type: 'double', sql: 'x.daily_water' },
      { name: 'TOTAL_FERTILIZER', type: 'double', sql: 'x.total_fertilizer' },
      { name: 'FERTILIZERS', type: 'string', sql: 'x.fertilizers::text' },
    ],
  },
  irrigation: {
    id: 'irrigation', label: 'Irrigation Entry', page: '/irrigation/entry', linkBy: 'field',
    from: `irrigation_records x ${FIELD_JOIN}`,
    date: 'x.date', order: 'x.date DESC',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: 'x.id::text' },
      ...FIELD_LINK,
      { name: 'DATE', type: 'date', sql: 'x.date' },
      { name: 'SEGMENT', type: 'string', sql: 'x.segment_id::text' },
      { name: 'CROP', type: 'string', sql: 'x.crop' },
      { name: 'AREA_HA', type: 'double', sql: 'x.area_ha' },
      { name: 'FLOW_M3_HR', type: 'double', sql: 'x.flow_rate_m3_hr' },
      { name: 'CYCLE_HR', type: 'double', sql: 'x.cycle_duration_hr' },
      { name: 'VOLUME_M3', type: 'double', sql: 'x.volume_m3' },
      { name: 'AUTHORIZED_BY', type: 'string', sql: 'x.authorized_by', personal: true },
    ],
  },
  harvest: {
    id: 'harvest', label: 'Harvest Entry', page: '/harvest/entry', linkBy: 'field',
    from: `harvests x ${FIELD_JOIN} LEFT JOIN crops c ON c.id = x.crop_id LEFT JOIN crop_varieties v ON v.id = x.variety_id`,
    date: 'x.date', order: 'x.date DESC',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: 'x.id::text' },
      ...FIELD_LINK,
      { name: 'DATE', type: 'date', sql: 'x.date' },
      { name: 'WEEK', type: 'integer', sql: 'x.week_number' },
      { name: 'CROP', type: 'string', sql: 'c.name' },
      { name: 'VARIETY', type: 'string', sql: 'v.name' },
      { name: 'QUANTITY', type: 'double', sql: 'x.total_quantity' },
      { name: 'NOTES', type: 'string', sql: 'x.notes', personal: true },
    ],
  },
  'crop-rotation': {
    id: 'crop-rotation', label: 'Crop Rotation', page: '/admin/crop-history', linkBy: 'field',
    from: `crop_history x ${FIELD_JOIN} LEFT JOIN crops c ON c.id = x.crop_id LEFT JOIN crop_varieties v ON v.id = x.variety_id`,
    date: 'x.start_date', order: 'x.start_date DESC',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: 'x.id::text' },
      ...FIELD_LINK,
      { name: 'CROP', type: 'string', sql: 'c.name' },
      { name: 'VARIETY', type: 'string', sql: 'v.name' },
      { name: 'START_DATE', type: 'date', sql: 'x.start_date' },
      { name: 'END_DATE', type: 'date', sql: 'x.end_date' },
      { name: 'SEASON', type: 'string', sql: 'x.season_id::text' },
    ],
  },
  'pump-room': {
    id: 'pump-room', label: 'Pump Room', page: '/pump-room', linkBy: 'site',
    from: `(
      SELECT id, site_id, record_date, meter_id, usage_area, 'water' AS kind, reading_1, usage_1, reading_2, usage_2, deleted_at FROM pump_room_water
      UNION ALL SELECT id, site_id, record_date, meter_id, usage_area, 'electricity', reading_1, usage_1, reading_2, usage_2, deleted_at FROM pump_room_electricity
      UNION ALL SELECT id, site_id, record_date, meter_id, usage_area, 'fogger', reading_1, usage_1, reading_2, usage_2, deleted_at FROM pump_room_fogger
    ) x JOIN sites s ON s.id = x.site_id`,
    date: 'x.record_date', order: 'x.record_date DESC, x.kind',
    cols: [
      { name: 'RECORD_ID', type: 'string', sql: `x.kind || '-' || x.id::text` },
      { name: 'SITE_KEYID', type: 'string', sql: 's.key_id' },
      { name: 'SITE', type: 'string', sql: 's.name' },
      { name: 'DATE', type: 'date', sql: 'x.record_date' },
      { name: 'TYPE', type: 'string', sql: 'x.kind' },
      { name: 'METER', type: 'string', sql: 'x.meter_id::text' },
      { name: 'USAGE_AREA', type: 'string', sql: 'x.usage_area' },
      { name: 'READING_1', type: 'double', sql: 'x.reading_1' },
      { name: 'USAGE_1', type: 'double', sql: 'x.usage_1' },
      { name: 'READING_2', type: 'double', sql: 'x.reading_2' },
      { name: 'USAGE_2', type: 'double', sql: 'x.usage_2' },
    ],
  },
};

export function feedForm(id: string): FeedForm {
  const f = FEED_FORMS[id];
  if (!f) throw new AppError(`Unknown form "${id}". Forms: ${Object.keys(FEED_FORMS).join(', ')}`, 'NOT_FOUND', 404);
  return f;
}

/** "ecph.csv" → { form: 'ecph', format: 'csv' } */
export function parseFeedFile(file: string): { form: string; format: FeedFormat } {
  const m = /^([a-z0-9-]+)\.(csv|geojson|json)$/i.exec(file || '');
  if (!m) throw new AppError('Use <form>.csv, <form>.geojson or <form>.json', 'VALIDATION_ERROR', 400);
  feedForm(m[1].toLowerCase());
  return { form: m[1].toLowerCase(), format: m[2].toLowerCase() as FeedFormat };
}

export interface FeedQuery { keyid?: string; since?: string; limit?: number; includeNames?: boolean; withGeometry?: boolean }

/** The SQL and parameters for one form's rows (exported for tests). */
export function buildFeedSql(orgId: string, formId: string, q: FeedQuery = {}) {
  const form = feedForm(formId);
  const cols = form.cols.filter((c) => q.includeNames || !c.personal);
  const params: any[] = [orgId];
  const where = [form.linkBy === 'field' ? 'f.organization_id = $1' : 's.organization_id = $1'];
  if (form.id === 'pump-room') where.push('x.deleted_at IS NULL');
  if (q.keyid) {
    params.push(String(q.keyid).trim());
    where.push(form.linkBy === 'field' ? `UPPER(f.key_id) = UPPER($${params.length})` : `UPPER(s.key_id) = UPPER($${params.length})`);
  }
  if (q.since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.since)) throw new AppError('since must be YYYY-MM-DD', 'VALIDATION_ERROR', 400);
    params.push(q.since);
    where.push(`${form.date} >= $${params.length}::date`);
  }
  const limit = Math.min(Math.max(Number(q.limit) || 50000, 1), 200000);
  const select = cols.map((c) => `${c.type === 'date' ? `to_char(${c.sql}, 'YYYY-MM-DD')` : c.sql} AS "${c.name}"`);
  if (q.withGeometry) {
    select.push(form.linkBy === 'field'
      ? 'ST_AsGeoJSON(ST_PointOnSurface(f.polygon), 7)::json AS "__geom"'
      : 'ST_AsGeoJSON(ST_PointOnSurface(s.geom), 7)::json AS "__geom"');
  }
  const sql = `SELECT ${select.join(', ')} FROM ${form.from} WHERE ${where.join(' AND ')} ORDER BY ${form.order} LIMIT ${limit}`;
  return { sql, params, cols };
}

export async function feedRows(orgId: string, formId: string, q: FeedQuery = {}) {
  const { sql, params, cols } = buildFeedSql(orgId, formId, q);
  const res = await dbPool.query(sql, params);
  return { rows: res.rows as Array<Record<string, any>>, cols };
}

export function toCsv(rows: Array<Record<string, any>>, cols: Col[]): string {
  const cell = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Stop spreadsheet formula injection, then quote when needed.
    const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = cols.map((c) => c.name).join(',');
  return `﻿${[header, ...rows.map((r) => cols.map((c) => cell(r[c.name])).join(','))].join('\r\n')}\r\n`;
}

export function toGeoJson(rows: Array<Record<string, any>>, cols: Col[]) {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: r.__geom || null,
      properties: Object.fromEntries(cols.map((c) => [c.name, r[c.name] ?? null])),
    })),
  };
}

// ── Read keys ──────────────────────────────────────────────────────────────

const hash = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export async function createFeedKey(orgId: string, formId: string, userId?: string) {
  feedForm(formId);
  const raw = `feed_${formId.replace(/-/g, '')}_${crypto.randomBytes(24).toString('hex')}`;
  const prefix = raw.slice(0, raw.indexOf('_', 5) + 5);
  const res = await dbPool.query(
    `INSERT INTO feed_keys (organization_id, form, key_hash, key_prefix, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, form, key_prefix, created_at`,
    [orgId, formId, hash(raw), prefix, userId || null],
  );
  return { ...res.rows[0], key: raw };
}

export async function revokeFeedKey(orgId: string, id: string) {
  const res = await dbPool.query(
    'UPDATE feed_keys SET revoked_at = NOW() WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL',
    [id, orgId],
  );
  return res.rowCount ?? 0;
}

/** A key opens exactly one form of one organisation. */
export async function verifyFeedKey(raw: string, formId: string): Promise<string | null> {
  if (!raw || !raw.startsWith('feed_')) return null;
  const res = await dbPool.query(
    'SELECT id, organization_id FROM feed_keys WHERE key_hash = $1 AND form = $2 AND revoked_at IS NULL',
    [hash(raw), formId],
  );
  const row = res.rows[0];
  if (!row) return null;
  dbPool.query('UPDATE feed_keys SET last_used = NOW() WHERE id = $1', [row.id]).catch(() => {});
  return row.organization_id;
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function listFeeds(orgId: string) {
  const [settings, keys, counts] = await Promise.all([
    dbPool.query('SELECT * FROM form_feeds WHERE organization_id = $1', [orgId]),
    dbPool.query(
      `SELECT id, form, key_prefix, created_at, last_used FROM feed_keys
       WHERE organization_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`, [orgId]),
    Promise.all(Object.keys(FEED_FORMS).map(async (id) => {
      try {
        const { sql, params } = buildFeedSql(orgId, id, { limit: 200000 });
        const r = await dbPool.query(`SELECT COUNT(*)::int AS n FROM (${sql}) q`, params);
        return [id, r.rows[0]?.n ?? 0] as const;
      } catch (err: any) {
        logger.warn({ form: id, error: err?.message }, 'feed count failed');
        return [id, null] as const;
      }
    })),
  ]);
  const byForm = new Map(settings.rows.map((r: any) => [r.form, r]));
  const count = new Map(counts);
  return Object.values(FEED_FORMS).map((f) => {
    const s: any = byForm.get(f.id) || {};
    return {
      form: f.id, label: f.label, page: f.page, relation: '1:N', linkBy: f.linkBy,
      key: f.linkBy === 'field' ? 'GlobalID → STRUCT_GLOBALID' : 'Site KeyID → SITE_KEYID',
      columns: f.cols.map((c) => ({ name: c.name, type: c.type, personal: !!c.personal })),
      records: count.get(f.id) ?? null,
      arcgisTableUrl: s.arcgis_table_url || null,
      syncMode: s.sync_mode || 'off',
      includeNames: !!s.include_names,
      lastSyncedAt: s.last_synced_at || null,
      lastSyncCount: s.last_sync_count ?? null,
      lastError: s.last_error || null,
      keys: keys.rows.filter((k: any) => k.form === f.id),
    };
  });
}

export async function saveFeedSettings(orgId: string, formId: string, patch: { arcgisTableUrl?: string | null; syncMode?: string; includeNames?: boolean }) {
  feedForm(formId);
  if (patch.syncMode && !['off', 'save', 'hourly', 'daily'].includes(patch.syncMode)) {
    throw new AppError('syncMode must be off, save, hourly or daily', 'VALIDATION_ERROR', 400);
  }
  if (patch.arcgisTableUrl) {
    const { layerIndex } = parseFeatureServiceUrl(patch.arcgisTableUrl);
    if (layerIndex === null) throw new AppError('Give the table link with its number, …/FeatureServer/22', 'VALIDATION_ERROR', 400);
  }
  await dbPool.query(
    `INSERT INTO form_feeds (organization_id, form, arcgis_table_url, sync_mode, include_names, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 'off'), COALESCE($5, false), NOW())
     ON CONFLICT (organization_id, form) DO UPDATE SET
       arcgis_table_url = CASE WHEN $6 THEN EXCLUDED.arcgis_table_url ELSE form_feeds.arcgis_table_url END,
       sync_mode = COALESCE($4, form_feeds.sync_mode),
       include_names = COALESCE($5, form_feeds.include_names),
       updated_at = NOW()`,
    [orgId, formId, patch.arcgisTableUrl || null, patch.syncMode ?? null, patch.includeNames ?? null, patch.arcgisTableUrl !== undefined],
  );
}

// ── ArcGIS related tables ──────────────────────────────────────────────────

const ESRI_TYPE: Record<ColType, string> = {
  string: 'esriFieldTypeString', double: 'esriFieldTypeDouble', integer: 'esriFieldTypeInteger', date: 'esriFieldTypeDateOnly',
};

/** Hosted-table definition for addToDefinition (exported for tests). */
export function tableDefinition(formId: string, includeNames = false) {
  const form = feedForm(formId);
  const name = `AgroCloud_${form.id.replace(/-/g, '_')}`;
  return {
    name, type: 'Table', objectIdField: 'OBJECTID', globalIdField: 'GlobalID', hasAttachments: false,
    fields: [
      { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
      { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false },
      ...form.cols.filter((c) => includeNames || !c.personal).map((c) => ({
        name: c.name, alias: c.name, type: ESRI_TYPE[c.type], nullable: true, editable: true,
        ...(c.type === 'string' ? { length: c.name === 'FERTILIZERS' || c.name === 'NOTES' ? 4000 : 255 } : {}),
      })),
    ],
  };
}

async function connectionFor(orgId: string): Promise<{ serviceUrl: string; token: string | null; layerIndex: number }> {
  const res = await dbPool.query(
    `SELECT source_url, layer_index, auth_token FROM gis_layers
     WHERE organization_id = $1 AND source_type = 'arcgis_feature_service' AND source_url ILIKE '%Agro_Structures%'
     ORDER BY (auth_token IS NOT NULL) DESC, updated_at DESC NULLS LAST LIMIT 1`, [orgId]);
  const row = res.rows[0];
  if (!row) throw new AppError('Add the Agro_Structures layer in GIS configuration first', 'VALIDATION_ERROR', 400);
  const { baseUrl, layerIndex } = parseFeatureServiceUrl(row.source_url);
  return { serviceUrl: baseUrl, token: row.auth_token || null, layerIndex: layerIndex ?? row.layer_index ?? 21 };
}

/** Create the form's related table inside the Agro_Structures service (needs an owner/admin token). */
export async function createArcgisTable(orgId: string, formId: string) {
  const { serviceUrl, token } = await connectionFor(orgId);
  if (!token) throw new AppError('Creating a table needs a saved ArcGIS token with owner rights', 'VALIDATION_ERROR', 400);
  const settings = await dbPool.query('SELECT include_names FROM form_feeds WHERE organization_id = $1 AND form = $2', [orgId, formId]);
  const def = tableDefinition(formId, !!settings.rows[0]?.include_names);
  const adminUrl = `${serviceUrl.replace(/\/rest\/services\//i, '/rest/admin/services/')}/addToDefinition`;
  const out = await arcgisPost(adminUrl, { addToDefinition: JSON.stringify({ tables: [def] }) }, token);
  const created = (out.layers || out.tables || []).find((l: any) => l.name === def.name) || (out.layers || out.tables || [])[0];
  if (created?.id === undefined) throw new AppError('ArcGIS did not return the new table number', 'EXTERNAL_SERVICE_ERROR', 502);
  const url = `${serviceUrl}/${created.id}`;
  await saveFeedSettings(orgId, formId, { arcgisTableUrl: url });
  return { url, id: created.id, name: def.name };
}

/** Replace the related table's rows with the form's current records (no shapes are touched). */
export async function syncToArcgis(orgId: string, formId: string) {
  const s = await dbPool.query('SELECT arcgis_table_url, include_names FROM form_feeds WHERE organization_id = $1 AND form = $2', [orgId, formId]);
  const tableUrl: string | null = s.rows[0]?.arcgis_table_url || null;
  if (!tableUrl) throw new AppError('This form has no ArcGIS table yet', 'VALIDATION_ERROR', 400);
  const { token, layerIndex: shapesIndex, serviceUrl } = await connectionFor(orgId);
  const target = parseFeatureServiceUrl(tableUrl);
  if (target.layerIndex === null) throw new AppError('The ArcGIS table link has no table number', 'VALIDATION_ERROR', 400);
  if (target.baseUrl.toLowerCase() === serviceUrl.toLowerCase() && target.layerIndex === shapesIndex) {
    throw new AppError('Refusing to write into the Agro_Structures shapes layer', 'VALIDATION_ERROR', 400);
  }
  try {
    const { rows, cols } = await feedRows(orgId, formId, { includeNames: !!s.rows[0]?.include_names });
    const base = `${target.baseUrl}/${target.layerIndex}`;
    await arcgisPost(`${base}/deleteFeatures`, { where: '1=1' }, token);
    let added = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const features = rows.slice(i, i + 1000).map((r) => ({ attributes: Object.fromEntries(cols.map((c) => [c.name, r[c.name] ?? null])) }));
      const out = await arcgisPost(`${base}/addFeatures`, { features: JSON.stringify(features), rollbackOnFailure: 'true' }, token);
      const failed = (out.addResults || []).filter((x: any) => !x.success);
      if (failed.length) throw new AppError(`ArcGIS refused ${failed.length} records: ${failed[0]?.error?.description || 'unknown error'}`, 'EXTERNAL_SERVICE_ERROR', 502);
      added += features.length;
    }
    await dbPool.query(
      'UPDATE form_feeds SET last_synced_at = NOW(), last_sync_count = $3, last_error = NULL WHERE organization_id = $1 AND form = $2',
      [orgId, formId, added]);
    return { added };
  } catch (err: any) {
    await dbPool.query('UPDATE form_feeds SET last_error = $3 WHERE organization_id = $1 AND form = $2', [orgId, formId, String(err?.message || err).slice(0, 500)]);
    throw err;
  }
}

/** Runs the scheduled syncs: "save" every few minutes when records changed, hourly and daily. */
export async function runDueSyncs(now = new Date()) {
  const due = await dbPool.query(
    `SELECT organization_id, form, sync_mode, last_synced_at FROM form_feeds
     WHERE arcgis_table_url IS NOT NULL AND sync_mode <> 'off'`);
  for (const row of due.rows) {
    const last = row.last_synced_at ? new Date(row.last_synced_at).getTime() : 0;
    const age = now.getTime() - last;
    const every = row.sync_mode === 'daily' ? 24 * 3600e3 : row.sync_mode === 'hourly' ? 3600e3 : 5 * 60e3;
    if (age < every) continue;
    try {
      await syncToArcgis(row.organization_id, row.form);
    } catch (err: any) {
      logger.warn({ form: row.form, error: err?.message }, 'feed sync failed');
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startFeedSync() {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(() => { runDueSyncs().catch((err) => logger.warn({ error: err?.message }, 'feed sync loop')); }, 5 * 60e3);
}
