import type { PoolClient } from 'pg';
import { dbPool } from '../../db/client';
import { resolveHarvestPlanting } from '../../utils/harvestPlantingLink';
import {
  normalizeDate, normalizeTime, normalizePercent, normalizeFlag, leadingDays, canonicalFieldName,
} from '../../utils/importValues';
import { FieldSpec, TargetSpec } from './targets';

/*
 * Excel import: read every row, resolve the field and crop, drop rows that are
 * already in the system (or twice in the file), then write in one transaction.
 * The check (dry run) runs the same code without writing, so its numbers match.
 */

export type Row = Record<string, string>;
export type Mapping = Record<string, string | string[]>;
type Values = Record<string, unknown>;
type Item = { ref: string | number; fieldId: string | null; values: Values; cropId: string | null; varietyId: string | null; key: string };

export type ImportStats = {
  total: number;
  toInsert: number;
  skipped: number;
  duplicatesInFile: number;
  /** Total or subtotal lines (a quantity with no field and no date) left out without an error. */
  summaryRows: number;
  valvesInserted?: number;
  productsCreated?: number;
  /** Product names the import would add (the page adds up batches without counting a name twice). */
  newProducts?: string[];
  errorCount: number;
  errors: Array<{ row: number | string; reason: string }>;
  preview: Values[];
  unmappedHeaders: string[];
  cropResolution: { fromHistory: number; fromColumn: number; unresolved: number };
};

const MAX_ERRORS = 300;
const TYPE_WORD: Record<string, string> = { int: 'whole number', number: 'number', date: 'date', time: 'time', percent: 'percentage' };
/** Round to the column's two decimals the same way on both sides, so a value read back from the database keys the same. */
const round2 = (n: unknown): number | null => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const r2 = (n: unknown) => { const v = round2(n); return v === null ? '' : v.toFixed(2); };
const hhmm = (t: unknown) => (t ? String(t).slice(0, 5) : '');
const rowRef = (row: Row, idx: number): string | number => (row.__ref ? String(row.__ref) : idx + 2);

/* ─── Values ──────────────────────────────────────────────────────── */

function coerceValue(raw: string, f: FieldSpec): unknown {
  const v = (raw ?? '').trim();
  if (v === '') return f.type === 'flag' ? false : null;
  switch (f.type) {
    case 'int': {
      // Whole numbers only: "2,3" (two valves) or "4 ( Bay-8 )" is not the number 23 or 4.
      const plain = /^-?\d{1,3}(,\d{3})+$/.test(v) ? v.replace(/,/g, '') : v;
      if (!/^-?\d+(\.0+)?$/.test(plain)) return f.required ? undefined : null;
      return parseInt(plain, 10);
    }
    case 'number': {
      const n = Number(v.replace(/,/g, '').replace(/%/g, ''));
      return Number.isFinite(n) ? n : f.required ? undefined : null;
    }
    case 'percent': return normalizePercent(v) ?? null;
    case 'flag': return normalizeFlag(v);
    case 'date': return normalizeDate(v);
    case 'time': return normalizeTime(v) ?? (f.required ? undefined : null);
    default: return v;
  }
}

export function coerceRow(row: Row, target: TargetSpec, mapping: Mapping): { values: Values; error: string | null } {
  const values: Values = {};
  for (const f of target.fields) {
    const src = mapping[f.key];
    if (f.type === 'columns') {
      const cols = Array.isArray(src) ? src : [];
      const parts: Record<string, number> = {};
      cols.forEach((c) => {
        const n = Number(String(row[c] ?? '').replace(/,/g, '').trim());
        if (Number.isFinite(n) && n !== 0 && String(row[c] ?? '').trim() !== '') parts[c] = Math.round(n * 10000) / 10000;
      });
      values[f.key] = parts;
      continue;
    }
    const col = typeof src === 'string' ? src : '';
    const raw = col ? (row[col] ?? '') : '';
    const val = coerceValue(raw, f);
    if (val === undefined) {
      if (f.required) return { values, error: `Cannot read "${String(raw).trim()}" as a ${TYPE_WORD[f.type] || f.type} in column "${col}"` };
      values[f.key] = null;
      continue;
    }
    if (f.required && (val === null || val === '')) {
      return { values, error: `${f.label} is empty (column "${col || '?'}")` };
    }
    if (typeof val === 'number' && ((f.min !== undefined && val < f.min) || (f.max !== undefined && val > f.max))) {
      return { values, error: `${f.label} ${val} is outside ${f.min}–${f.max} (column "${col}"); fix the cell or leave it empty` };
    }
    values[f.key] = val;
  }
  return { values, error: null };
}

/* ─── Lookups ─────────────────────────────────────────────────────── */

type CropRow = { crop_id: string; crop_name: string; variety_id: string | null; variety_name: string | null };

async function loadFields(orgId: string): Promise<Map<string, string>> {
  // Only this organization's fields: a name in an old sheet must never land on another tenant's field.
  const r = await dbPool.query('SELECT id, name FROM fields WHERE deleted_at IS NULL AND organization_id = $1', [orgId]);
  const m = new Map<string, string>();
  r.rows.forEach((x: any) => { const k = canonicalFieldName(x.name); if (!m.has(k)) m.set(k, x.id); });
  return m;
}

async function loadCrops(): Promise<CropRow[]> {
  const r = await dbPool.query(
    `SELECT c.id AS crop_id, c.name AS crop_name, cv.id AS variety_id, cv.name AS variety_name
       FROM crops c LEFT JOIN crop_varieties cv ON cv.crop_id = c.id ORDER BY length(c.name) DESC`,
  );
  return r.rows;
}

/** "Capsicum Yellow Sven RZ" -> the longest crop name it contains, and the variety when it matches. */
export function parseCrop(text: string, rows: CropRow[]): { cropId: string | null; varietyId: string | null; cropName: string | null; varietyName: string | null } {
  const s = (text || '').trim().toLowerCase();
  const none = { cropId: null, varietyId: null, cropName: null, varietyName: null };
  if (!s) return none;
  const crops = new Map<string, CropRow>();
  rows.forEach((x) => { const k = x.crop_name.toLowerCase(); if (!crops.has(k)) crops.set(k, x); });
  for (const [name, c] of crops) {
    if (!s.includes(name)) continue;
    const rest = s.replace(name, '').trim();
    const v = rest ? rows.find((x) => x.crop_id === c.crop_id && x.variety_name && (x.variety_name.toLowerCase() === rest || rest.includes(x.variety_name.toLowerCase()))) : null;
    return { cropId: c.crop_id, varietyId: v?.variety_id ?? null, cropName: c.crop_name, varietyName: v?.variety_name ?? null };
  }
  return none;
}

type HistoryRow = { field_id: string; crop_id: string; variety_id: string | null; start_date: string; end_date: string | null };

async function loadHistory(fieldIds: string[]): Promise<HistoryRow[]> {
  if (!fieldIds.length) return [];
  const r = await dbPool.query(
    `SELECT field_id, crop_id, variety_id, start_date::text, end_date::text FROM crop_history WHERE field_id = ANY($1::uuid[]) ORDER BY start_date`,
    [fieldIds],
  );
  return r.rows;
}

function cropFromHistory(fieldId: string, date: string, hist: HistoryRow[]) {
  const h = hist.find((x) => x.field_id === fieldId && x.start_date <= date && (!x.end_date || x.end_date >= date));
  return h ? { cropId: h.crop_id, varietyId: h.variety_id } : { cropId: null, varietyId: null };
}

/* ─── Keys: what makes a row the same record ──────────────────────── */

function keyOf(target: string, fieldId: string | null, v: Values, productId?: string | null): string {
  switch (target) {
    case 'harvests': return [fieldId, v.date, v.batch_number || '', v.segment_id || '', r2(v.total_quantity), hhmm(v.start_time)].join('|');
    case 'ecph':
    case 'ecph_full': return [fieldId, v.date, hhmm(v.time)].join('|');
    case 'fertigation': return [fieldId, v.date, r2(v.daily_water), r2(v.total_fertilizer)].join('|');
    case 'pesticide_applications': return [fieldId, v.date, productId || String(v.product_name || '').toLowerCase(), hhmm(v.start_time)].join('|');
    case 'pesticide_products': return String(v.name || '').trim().toLowerCase();
    default: return JSON.stringify(v);
  }
}

async function existingKeys(target: string, orgId: string, items: Item[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (target === 'pesticide_products') {
    const r = await dbPool.query('SELECT lower(name) AS n FROM pesticide_products WHERE organization_id = $1 OR organization_id IS NULL', [orgId]);
    r.rows.forEach((x: any) => set.add(x.n.trim()));
    return set;
  }
  const ids = [...new Set(items.map((i) => i.fieldId).filter(Boolean))] as string[];
  const dates = items.map((i) => String(i.values.date || '')).filter(Boolean).sort();
  if (!ids.length || !dates.length) return set;
  const args = [ids, dates[0], dates[dates.length - 1]];
  const q = (sql: string) => dbPool.query(sql, args);
  if (target === 'harvests') {
    (await q(`SELECT field_id, to_char(date,'YYYY-MM-DD') AS date, batch_number, segment_id, total_quantity, start_time::text AS start_time
                FROM harvests WHERE field_id = ANY($1::uuid[]) AND date BETWEEN $2 AND $3`)).rows
      .forEach((x: any) => set.add(keyOf(target, x.field_id, x)));
  } else if (target === 'ecph' || target === 'ecph_full') {
    (await q(`SELECT field_id, to_char(date,'YYYY-MM-DD') AS date, time::text AS time FROM ecph_entries WHERE field_id = ANY($1::uuid[]) AND date BETWEEN $2 AND $3`)).rows
      .forEach((x: any) => set.add(keyOf(target, x.field_id, x)));
  } else if (target === 'fertigation') {
    (await q(`SELECT field_id, to_char(date,'YYYY-MM-DD') AS date, daily_water, total_fertilizer FROM fertigation_entries WHERE field_id = ANY($1::uuid[]) AND date BETWEEN $2 AND $3`)).rows
      .forEach((x: any) => set.add(keyOf(target, x.field_id, x)));
  } else if (target === 'pesticide_applications') {
    (await q(`SELECT field_id, to_char(application_date,'YYYY-MM-DD') AS date, product_id, application_start_time AS start_time
                FROM pesticide_applications WHERE field_id = ANY($1::uuid[]) AND application_date BETWEEN $2 AND $3`)).rows
      .forEach((x: any) => set.add(keyOf(target, x.field_id, { date: x.date, start_time: x.start_time }, x.product_id)));
  }
  return set;
}

/* ─── Writers ─────────────────────────────────────────────────────── */

type Ctx = { client: PoolClient; orgId: string; userId: string; fileName: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

async function writeHarvest(ctx: Ctx, it: Item) {
  const v = it.values;
  const link = await resolveHarvestPlanting({ fieldId: it.fieldId!, harvestDate: String(v.date), segmentId: v.segment_id ? String(v.segment_id) : null }, ctx.client);
  await ctx.client.query(
    `INSERT INTO harvests (field_id, date, total_quantity, notes, start_time, end_time, shift_number, week_number, batch_number, segment_id,
                           harvested_area_ha, packhouse, authorized_by, crop_id, variety_id, open_field_planting_id, planting_record_id,
                           organization_id, extra_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [it.fieldId, v.date, v.total_quantity, v.notes ?? null, v.start_time ?? null, v.end_time ?? null,
      v.shift_number ? String(v.shift_number).slice(0, 20) : null, v.week_number != null ? String(v.week_number) : null,
      v.batch_number ? String(v.batch_number).slice(0, 100) : null, v.segment_id ? String(v.segment_id).slice(0, 100) : null,
      v.harvested_area_ha ?? null, v.packhouse ? String(v.packhouse).slice(0, 100) : null, v.authorized_by ? String(v.authorized_by).slice(0, 100) : null,
      it.cropId, it.varietyId, link.openFieldPlantingId, link.plantingRecordId, ctx.orgId,
      JSON.stringify({ source: 'excel', file: ctx.fileName, ref: it.ref, crop: v.crop_name ?? null, variety: v.variety_name ?? null })],
  );
}

async function writeEcph(ctx: Ctx, group: Item[], withValves: boolean): Promise<number> {
  const first = group[0];
  const v = first.values;
  const r = await ctx.client.query(
    `INSERT INTO ecph_entries (field_id, date, time, qty_of_water, cycle, total_water_qty, field_total_water_based_on_drip,
                               weather_condition, irrigation_status, crop_id, variety_id, organization_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [first.fieldId, v.date, v.time ?? null, v.qty_of_water ?? null, v.cycle ?? null, v.total_water_qty ?? null, v.total_water_drip ?? null,
      v.weather_condition ?? null, v.irrigation_status ?? null, first.cropId, first.varietyId, ctx.orgId],
  );
  if (!withValves) return 0;
  const entryId = r.rows[0].id;
  let n = 0;
  for (const it of group) {
    const x = it.values;
    if (x.valve_number == null) continue;
    await ctx.client.query(
      `INSERT INTO ecph_valve_readings (ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph, drain, percent_drain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entryId, x.valve_number, x.drip_volume ?? null, x.ec_in ?? null, x.ec_out ?? null, x.ph_in ?? null, x.ph_out ?? null, x.drain_volume ?? null, x.percent_drain ?? null],
    );
    n += 1;
  }
  return n;
}

async function writeFertigation(ctx: Ctx, it: Item) {
  const v = it.values;
  const parts = (v.fertilizer_columns || {}) as Record<string, number>;
  await ctx.client.query(
    `INSERT INTO fertigation_entries (field_id, date, week_number, flow_rate, frequency, valves_count, daily_water, fertilizers, total_fertilizer,
                                      crop_id, variety_id, organization_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [it.fieldId, v.date, v.week_number ?? null, v.flow_rate ?? null, v.frequency ?? null, v.valves_count ?? null, v.daily_water ?? null,
      Object.keys(parts).length ? JSON.stringify(parts) : null, v.total_fertilizer ?? null, it.cropId, it.varietyId, ctx.orgId],
  );
}

async function writeProduct(ctx: Ctx, v: Values) {
  const pests = String(v.target_pests || '').split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
  const phiDays = leadingDays(String(v.phi || '')) ?? 0;
  const r = await ctx.client.query(
    `INSERT INTO pesticide_products (name, active_ingredient, phi_days, phi_text, target_pests, target_crops, max_individual_dose, max_total_dose,
                                     max_applications, growth_stage, spray_interval, re_entry_interval, bumble_bee_interval, chemical_category,
                                     has_label_msds, is_active, organization_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16,$17) RETURNING id`,
    [String(v.name).trim().slice(0, 200), v.active_ingredient ? String(v.active_ingredient).slice(0, 200) : null, phiDays, v.phi ?? null,
      JSON.stringify(pests), v.target_crops ?? null, v.max_individual_dose ? String(v.max_individual_dose).slice(0, 200) : null,
      v.max_total_dose ? String(v.max_total_dose).slice(0, 200) : null, v.max_applications ? String(v.max_applications).slice(0, 100) : null,
      v.growth_stage ? String(v.growth_stage).slice(0, 200) : null, v.spray_interval ? String(v.spray_interval).slice(0, 100) : null,
      v.re_entry_interval ? String(v.re_entry_interval).slice(0, 200) : null, v.bumble_bee_interval ? String(v.bumble_bee_interval).slice(0, 200) : null,
      v.chemical_category ? String(v.chemical_category).slice(0, 100) : null, !!v.has_label_msds, ctx.orgId, ctx.userId],
  );
  return r.rows[0].id as string;
}

async function writeApplication(ctx: Ctx, it: Item, productId: string, productPhi: number) {
  const v = it.values;
  const phi = v.phi_days != null ? Number(v.phi_days) : productPhi;
  const clear = (v.clear_date as string) || addDays(String(v.date), Number.isFinite(phi) ? phi : 0);
  const notes = `Imported from ${ctx.fileName} (${it.ref})`;
  await ctx.client.query(
    `INSERT INTO pesticide_applications (field_id, product_id, application_date, phi_end_date, dosage, target_pest, operator_name, weather_conditions,
        approval_status, approved_at, notes, organization_id, created_by, crop_name, variety, segment_id, scouting_date, justification, percent_seen,
        application_start_time, application_end_time, active_ingredient, rate_per_ha, unit_price, cost, uom, total_quantity_applied,
        machinery_used, verified_by, phi_day_before_sent, phi_cleared_sent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',NOW(),$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,true,true)`,
    [it.fieldId, productId, v.date, clear, v.dosage ?? null, v.justification ? String(v.justification).slice(0, 200) : null,
      v.operator_name ? String(v.operator_name).slice(0, 200) : null, v.weather ?? null, notes, ctx.orgId, ctx.userId,
      v.crop_name ? String(v.crop_name).slice(0, 200) : null, v.variety ? String(v.variety).slice(0, 200) : null, v.segment_id ?? null,
      v.scouting_date ?? null, v.justification ? String(v.justification).slice(0, 200) : null, v.percent_seen ? String(v.percent_seen).slice(0, 200) : null,
      v.start_time ? String(v.start_time).slice(0, 5) : null, v.end_time ? String(v.end_time).slice(0, 5) : null,
      v.active_ingredient ? String(v.active_ingredient).slice(0, 200) : null, v.rate_per_ha ?? null, v.unit_price ?? null, v.cost ?? null,
      v.uom ? String(v.uom).slice(0, 20) : null, v.total_quantity_applied ?? null,
      v.machinery ? String(v.machinery).slice(0, 200) : null, v.verified_by ? String(v.verified_by).slice(0, 200) : null],
  );
}

/* ─── Run ─────────────────────────────────────────────────────────── */

export async function runImport(input: {
  rows: Row[]; headers: string[]; target: TargetSpec; mapping: Mapping; dryRun: boolean;
  orgId: string; userId: string; fileName: string; options?: Record<string, unknown>;
}): Promise<{ dryRun: boolean; target: string; headers: string[]; stats: ImportStats }> {
  const { rows, headers, target, mapping, dryRun, orgId, userId, fileName, options = {} } = input;
  const used = new Set(Object.values(mapping).flat());
  const stats: ImportStats = {
    total: rows.length, toInsert: 0, skipped: 0, duplicatesInFile: 0, summaryRows: 0, errorCount: 0, errors: [], preview: [],
    unmappedHeaders: headers.filter((h) => !h.startsWith('__') && !used.has(h)),
    cropResolution: { fromHistory: 0, fromColumn: 0, unresolved: 0 },
  };
  const fail = (ref: string | number, reason: string) => {
    stats.errorCount += 1;
    if (stats.errors.length < MAX_ERRORS) stats.errors.push({ row: ref, reason });
  };

  const fields = target.needsField ? await loadFields(orgId) : new Map<string, string>();
  const crops = target.needsField && target.key !== 'pesticide_applications' ? await loadCrops() : [];

  // 1. Read and resolve every row.
  const items: Item[] = [];
  rows.forEach((row, i) => {
    const ref = rowRef(row, i);
    if (target.needsField) {
      const fieldCol = typeof mapping.field_name === 'string' ? mapping.field_name : '';
      const dateCol = typeof mapping.date === 'string' ? mapping.date : '';
      if (fieldCol && dateCol && !String(row[fieldCol] ?? '').trim() && !String(row[dateCol] ?? '').trim()) { stats.summaryRows += 1; return; }
    }
    const { values, error } = coerceRow(row, target, mapping);
    if (error) { fail(ref, error); return; }
    let fieldId: string | null = null;
    if (target.needsField) {
      fieldId = fields.get(canonicalFieldName(String(values.field_name ?? ''))) || null;
      if (!fieldId) { fail(ref, `No field named "${values.field_name}" in this organization. Add it under Zones & sites, or fix the name`); return; }
    }
    if (target.key === 'fertigation') {
      const parts = (values.fertilizer_columns || {}) as Record<string, number>;
      if (values.total_fertilizer == null && Object.keys(parts).length) {
        values.total_fertilizer = Object.values(parts).reduce((a, b) => a + b, 0);
      }
      ['flow_rate', 'daily_water', 'total_fertilizer'].forEach((k) => { values[k] = round2(values[k]); });
    }
    if (target.key === 'harvests') values.total_quantity = round2(values.total_quantity);
    items.push({ ref, fieldId, values, cropId: null, varietyId: null, key: '' });
  });

  // 2. Crop: from the sheet, else from Crop Rotation on that date.
  if (crops.length || target.needsField) {
    const hist = await loadHistory([...new Set(items.map((x) => x.fieldId).filter(Boolean))] as string[]);
    items.forEach((it) => {
      if (target.key === 'pesticide_applications' || target.key === 'pesticide_products') return;
      const text = [it.values.crop_name, it.values.variety_name].filter(Boolean).join(' ');
      const p = text ? parseCrop(text, crops) : { cropId: null, varietyId: null };
      if (p.cropId) { it.cropId = p.cropId; it.varietyId = p.varietyId; stats.cropResolution.fromColumn += 1; return; }
      const h = it.fieldId ? cropFromHistory(it.fieldId, String(it.values.date), hist) : { cropId: null, varietyId: null };
      it.cropId = h.cropId; it.varietyId = h.varietyId;
      if (h.cropId) stats.cropResolution.fromHistory += 1; else stats.cropResolution.unresolved += 1;
    });
  }

  // 3. Products for spray records.
  const products = new Map<string, { id: string; phi: number }>();
  if (target.key === 'pesticide_applications') {
    const r = await dbPool.query(
      `SELECT id, lower(trim(name)) AS n, phi_days FROM pesticide_products WHERE (organization_id = $1 OR organization_id IS NULL) AND is_active IS NOT FALSE
        ORDER BY organization_id NULLS LAST`, [orgId]);
    r.rows.forEach((x: any) => { if (!products.has(x.n)) products.set(x.n, { id: x.id, phi: Number(x.phi_days) || 0 }); });
  }
  const missingProducts = new Map<string, Values>();
  const kept: Item[] = [];
  items.forEach((it) => {
    let productId: string | null = null;
    if (target.key === 'pesticide_applications') {
      const n = String(it.values.product_name || '').trim().toLowerCase();
      productId = products.get(n)?.id || null;
      if (!productId) {
        if (!options.createMissingProducts) { fail(it.ref, `Product "${it.values.product_name}" is not in the catalog. Import the PPP data sheet first, or let the import add it`); return; }
        if (!missingProducts.has(n)) missingProducts.set(n, { name: String(it.values.product_name).trim(), active_ingredient: it.values.active_ingredient, phi: it.values.phi_days != null ? `${it.values.phi_days} days` : null });
      }
    }
    it.key = keyOf(target.key, it.fieldId, it.values, productId);
    kept.push(it);
  });

  // 4. Already in the system, or twice in the file.
  const have = await existingKeys(target.key, orgId, kept);
  const seen = new Set<string>();
  const fresh: Item[] = [];
  const groupKey = (it: Item) => `${it.key}`;
  const valveSeen = new Set<string>();
  for (const it of kept) {
    if (target.key === 'ecph_full') {
      // Same reading (field, date, time) is one entry; the same valve twice is a duplicate row.
      const vk = `${it.key}|${it.values.valve_number}`;
      if (have.has(it.key)) { stats.skipped += 1; continue; }
      if (valveSeen.has(vk)) { stats.duplicatesInFile += 1; continue; }
      valveSeen.add(vk);
      fresh.push(it);
      continue;
    }
    if (have.has(it.key)) { stats.skipped += 1; continue; }
    if (seen.has(it.key)) { stats.duplicatesInFile += 1; continue; }
    seen.add(it.key);
    fresh.push(it);
  }
  const groups = new Map<string, Item[]>();
  if (target.key === 'ecph_full') fresh.forEach((it) => { const k = groupKey(it); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(it); });

  stats.toInsert = target.key === 'ecph_full' ? groups.size : fresh.length;
  if (target.key === 'ecph_full') stats.valvesInserted = fresh.length;
  if (target.key === 'pesticide_applications') { stats.productsCreated = missingProducts.size; stats.newProducts = [...missingProducts.values()].map((v) => String(v.name)); }
  stats.preview = fresh.slice(0, 5).map((it) => ({ row: it.ref, ...it.values }));

  if (dryRun || !fresh.length) return { dryRun, target: target.key, headers, stats };

  // 5. Write everything in one transaction.
  const client = await dbPool.connect();
  const ctx: Ctx = { client, orgId, userId, fileName };
  try {
    await client.query('BEGIN');
    if (target.key === 'harvests') for (const it of fresh) await writeHarvest(ctx, it);
    else if (target.key === 'ecph_full') for (const g of groups.values()) await writeEcph(ctx, g, true);
    else if (target.key === 'ecph') for (const it of fresh) await writeEcph(ctx, [it], false);
    else if (target.key === 'fertigation') for (const it of fresh) await writeFertigation(ctx, it);
    else if (target.key === 'pesticide_products') for (const it of fresh) await writeProduct(ctx, it.values);
    else if (target.key === 'pesticide_applications') {
      for (const [n, v] of missingProducts) {
        const id = await writeProduct(ctx, v);
        products.set(n, { id, phi: leadingDays(String(v.phi || '')) ?? 0 });
      }
      for (const it of fresh) {
        const p = products.get(String(it.values.product_name || '').trim().toLowerCase())!;
        await writeApplication(ctx, it, p.id, p.phi);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { dryRun, target: target.key, headers, stats };
}
