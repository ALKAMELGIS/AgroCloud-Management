import * as XLSX from 'xlsx';

/*
 * Reading years of old farm workbooks: every sheet, the real header row (old
 * sheets often have a title above it), dates as YYYY-MM-DD, and a reference
 * ("Sheet · row") on every row so errors point back to the cell.
 */

const pad2 = (n) => String(n).padStart(2, '0');
const isEmpty = (v) => v === '' || v === null || v === undefined;

export function cellText(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    // Time-only cells come back on 30/31 Dec 1899.
    if (v.getFullYear() < 1900) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return isEmpty(v) ? '' : String(v).trim();
}

/** Index of the header row: the first of the top rows with the most text cells. */
export function findHeaderRow(matrix, scan = 20) {
  let best = 0;
  let bestScore = -1;
  matrix.slice(0, scan).forEach((row, i) => {
    const cells = (row || []).map(cellText).filter(Boolean);
    const text = cells.filter((c) => !/^-?\d+([.,]\d+)?$/.test(c)).length;
    const score = cells.length >= 2 ? text * 2 + cells.length : -1;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function uniqueHeaders(row) {
  const seen = {};
  return (row || []).map((h, i) => {
    let name = cellText(h).replace(/\s+/g, ' ') || `Column ${i + 1}`;
    if (seen[name]) { seen[name] += 1; name = `${name} (${seen[name]})`; } else seen[name] = 1;
    return name;
  });
}

/** One sheet as { name, headers, rows }; each row carries __ref = "Sheet · row N". */
export function sheetToRows(name, sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });
  if (!matrix.length) return { name, headers: [], rows: [] };
  const h = findHeaderRow(matrix);
  const headers = uniqueHeaders(matrix[h]);
  const headerKey = headers.join('|').toLowerCase();
  const rows = [];
  for (let i = h + 1; i < matrix.length; i += 1) {
    const r = matrix[i] || [];
    const obj = {};
    let filled = 0;
    headers.forEach((col, c) => { const t = cellText(r[c]); obj[col] = t; if (t) filled += 1; });
    if (!filled) continue;
    // A header repeated inside the sheet (printed pages) is not data.
    if (headers.map((col) => obj[col]).join('|').toLowerCase() === headerKey) continue;
    obj.__ref = `${name} · row ${i + 1}`;
    rows.push(obj);
  }
  return { name, headers, rows };
}

export function readWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  return wb.SheetNames.map((n) => sheetToRows(n, wb.Sheets[n])).filter((s) => s.rows.length > 0);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-()/#.%:]+/g, '');

const words = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim()} `;

/** How well a header names a target field: exact name 100, else the longest name found as whole words in it. */
function matchScore(f, header) {
  const h = norm(header);
  if (!h) return 0;
  const names = [f.key.replace(/_/g, ' '), f.label, ...(f.aliases || [])];
  if (names.map(norm).includes(h)) return 100;
  const hw = words(header);
  let best = 0;
  names.forEach((n) => {
    const nw = words(n);
    if (nw.trim().length >= 2 && hw.includes(nw)) best = Math.max(best, nw.trim().length * 2);
  });
  return best;
}

/** Target field key -> header, best match first; a header is used once. */
export function autoMap(fields, headers) {
  const H = headers.filter((h) => !h.startsWith('__'));
  const pairs = [];
  fields.filter((f) => f.type !== 'columns').forEach((f) => H.forEach((h) => {
    const sc = matchScore(f, h);
    if (sc > 0) pairs.push([sc + (f.required ? 0.5 : 0), f.key, h]);
  }));
  pairs.sort((a, b) => b[0] - a[0]);
  const out = {};
  const used = new Set();
  pairs.forEach(([, k, h]) => { if (!out[k] && !used.has(h)) { out[k] = h; used.add(h); } });
  return out;
}

/** Share of the form's required fields a sheet's headers can fill (0..1). */
export function sheetFit(sheet, fields) {
  const req = fields.filter((f) => f.required);
  if (!req.length) return 0;
  return Object.keys(autoMap(req, sheet.headers)).length / req.length;
}

/** True when 85% or more of the other sheets' rows are already on the main sheet (first six shared columns). */
function holdsOthers(main, others) {
  const cols = main.headers.filter((h) => others.every((o) => o.headers.includes(h))).slice(0, 6);
  if (cols.length < 2) return false;
  const sig = (r) => cols.map((c) => String(r[c] ?? '').trim().toLowerCase()).join('\u0001');
  const inMain = new Set(main.rows.map(sig));
  let n = 0;
  let hit = 0;
  others.forEach((o) => o.rows.forEach((r) => { n += 1; if (inMain.has(sig(r))) hit += 1; }));
  return n > 0 && hit / n >= 0.85;
}

const ALL_SHEET = /\b(all|total|master|summary)\b|كل|جميع/i;

/**
 * Sheets to import by default: the ones whose columns fill every required field
 * of the form, laid out like the largest of them. When one of them already holds
 * the others (an "All" sheet), it is picked alone so nothing comes in twice.
 * Without a form, sheets laid out like the biggest one.
 */
export function pickSheets(sheets, fields) {
  if (!sheets.length) return [];
  let pool = sheets;
  if (fields && fields.length) {
    const fit = sheets.map((s) => [s, sheetFit(s, fields)]);
    const best = Math.max(...fit.map((x) => x[1]));
    if (best <= 0) return [];
    pool = fit.filter((x) => x[1] === best).map((x) => x[0]);
  }
  const main = pool.reduce((a, s) => (s.rows.length > a.rows.length ? s : a), pool[0]);
  const base = new Set(main.headers.map(norm));
  const alike = pool.filter((s) => {
    const hit = s.headers.filter((h) => base.has(norm(h))).length;
    return hit / Math.max(1, Math.min(base.size, s.headers.length)) >= 0.5;
  });
  const others = alike.filter((s) => s !== main);
  if (others.length >= 2 && (ALL_SHEET.test(main.name) || holdsOthers(main, others))) return [main.name];
  return alike.map((s) => s.name);
}

/** Without a form: sheets laid out like the biggest one. */
export function similarSheets(sheets) {
  return pickSheets(sheets, null);
}

/** Rows that repeat another row in every mapped column (the same record on two sheets). */
export function dropDuplicateRows(rows, columns) {
  const cols = [...new Set(columns.flat().filter(Boolean))];
  if (!cols.length) return { rows, dropped: 0 };
  const seen = new Map();
  const out = [];
  const droppedRefs = [];
  rows.forEach((r) => {
    const k = cols.map((c) => String(r[c] ?? '').trim().toLowerCase()).join('\u0001');
    if (seen.has(k)) { droppedRefs.push({ row: r.__ref, same: seen.get(k) }); return; }
    seen.set(k, r.__ref);
    out.push(r);
  });
  return { rows: out, dropped: droppedRefs.length, droppedRefs };
}

const NOT_AMOUNT = /week|date|valve|flow|qty|quantity|frequency|total|station|system|crop|stage|farm|field|operator|author|method|recipe|^column \d+|^\d+$|time|name|number|\bid\b/i;

/** Columns that hold one amount per product (fertilizer kg): numbers only, not already used, not metadata. */
export function amountColumns(rows, headers, used) {
  const sample = rows.slice(0, 400);
  return headers.filter((h) => {
    if (h.startsWith('__') || used.has(h) || NOT_AMOUNT.test(h)) return false;
    const vals = sample.map((r) => String(r[h] ?? '').trim()).filter(Boolean);
    return vals.length >= Math.max(3, sample.length * 0.05) && vals.every((v) => /^-?\d+([.,]\d+)?$/.test(v));
  });
}

/** Merged cells leave blanks under the first row of a group: carry the value down. */
export function fillDown(rows, columns) {
  const prev = {};
  rows.forEach((r) => {
    columns.forEach((c) => {
      if (!c) return;
      if (isEmpty(r[c]) && prev[c] !== undefined) r[c] = prev[c];
      else if (!isEmpty(r[c])) prev[c] = r[c];
    });
  });
  return rows;
}

/** Batches of about `size` rows that never split rows sharing a key (one reading's valves). */
export function chunkRows(rows, size, keyOf = null) {
  const out = [];
  let cur = [];
  rows.forEach((r, i) => {
    if (cur.length >= size && (!keyOf || keyOf(r) !== keyOf(rows[i - 1]))) { out.push(cur); cur = []; }
    cur.push(r);
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Add up the results of several batches into one. */
export function mergeResults(parts, maxErrors = 300) {
  const first = parts[0];
  if (!first) return null;
  const stats = parts.reduce((a, p) => {
    const s = p.stats || {};
    a.total += s.total || 0;
    a.toInsert += s.toInsert || 0;
    a.skipped += s.skipped || 0;
    a.duplicatesInFile += s.duplicatesInFile || 0;
    a.summaryRows += s.summaryRows || 0;
    (s.newProducts || []).forEach((n) => a.newProducts.add(String(n).trim().toLowerCase()));
    if (s.productsCreated !== undefined) a.productsCreated = a.newProducts.size || (a.productsCreated || 0) + s.productsCreated;
    a.errorCount += s.errorCount ?? (s.errors || []).length;
    if (s.valvesInserted !== undefined) a.valvesInserted = (a.valvesInserted || 0) + s.valvesInserted;
    (s.errors || []).forEach((e) => { if (a.errors.length < maxErrors) a.errors.push(e); });
    ['fromHistory', 'fromColumn', 'unresolved'].forEach((k) => { a.cropResolution[k] += s.cropResolution?.[k] || 0; });
    if (!a.preview.length && s.preview) a.preview = s.preview;
    return a;
  }, { total: 0, toInsert: 0, skipped: 0, duplicatesInFile: 0, summaryRows: 0, newProducts: new Set(), errorCount: 0, errors: [], preview: [], cropResolution: { fromHistory: 0, fromColumn: 0, unresolved: 0 }, unmappedHeaders: first.stats?.unmappedHeaders || [] });
  stats.newProducts = [...stats.newProducts];
  return { dryRun: first.dryRun, target: first.target, demo: !!first.demo, stats };
}

/** Earliest and latest YYYY-MM-DD in a column. */
export function dateSpan(rows, col) {
  if (!col) return null;
  let min = null;
  let max = null;
  rows.forEach((r) => {
    const v = String(r[col] || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return;
    const d = v.slice(0, 10);
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  });
  return min ? { min, max } : null;
}

/** An empty workbook with the target's columns and one example row. */
export function downloadTemplate(target) {
  const EX = { field_name: 'NH-01', date: '2024-03-15', time: '07:30', total_quantity: 125.5, crop_name: 'Tomato Cherry', valve_number: 1, ec_in: 2.1, ec_out: 2.6, ph_in: 6.0, ph_out: 6.3, week_number: 11 };
  const plain = target.fields.filter((f) => f.type !== 'columns');
  const extra = target.fields.some((f) => f.type === 'columns') ? ['MKP', 'Calcium Nitrate', 'Potassium Sulphate'] : [];
  const head = [...plain.map((f) => f.label), ...extra];
  const ex = [...plain.map((f) => EX[f.key] ?? ''), ...extra.map(() => 0.5)];
  const ws = XLSX.utils.aoa_to_sheet([head, ex]);
  ws['!cols'] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `AgroCloud-${target.key}-template.xlsx`);
}
