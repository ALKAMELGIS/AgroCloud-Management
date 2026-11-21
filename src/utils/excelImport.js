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

/** Sheets laid out like the biggest one (half or more of its columns) are picked by default. */
export function similarSheets(sheets) {
  if (!sheets.length) return [];
  const main = sheets.reduce((a, s) => (s.rows.length > a.rows.length ? s : a), sheets[0]);
  const base = new Set(main.headers.map(norm));
  return sheets.filter((s) => {
    const hit = s.headers.filter((h) => base.has(norm(h))).length;
    return hit / Math.max(1, Math.min(base.size, s.headers.length)) >= 0.5;
  }).map((s) => s.name);
}

/** Target field key -> best header: exact key, label or alias first, then a contained name. */
export function autoMap(fields, headers) {
  const used = new Set();
  const out = {};
  const H = headers.filter((h) => !h.startsWith('__')).map((h) => [norm(h), h]);
  const names = (f) => [f.key, f.label, ...(f.aliases || [])].map(norm).filter(Boolean);
  fields.forEach((f) => {
    const hit = H.find(([k, h]) => !used.has(h) && names(f).includes(k));
    if (hit) { out[f.key] = hit[1]; used.add(hit[1]); }
  });
  fields.forEach((f) => {
    if (out[f.key]) return;
    const hit = H.find(([k, h]) => !used.has(h) && k.length >= 3 && names(f).some((n) => n.length >= 3 && (k.includes(n) || n.includes(k))));
    if (hit) { out[f.key] = hit[1]; used.add(hit[1]); }
  });
  return out;
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
    a.errorCount += s.errorCount ?? (s.errors || []).length;
    if (s.valvesInserted !== undefined) a.valvesInserted = (a.valvesInserted || 0) + s.valvesInserted;
    (s.errors || []).forEach((e) => { if (a.errors.length < maxErrors) a.errors.push(e); });
    ['fromHistory', 'fromColumn', 'unresolved'].forEach((k) => { a.cropResolution[k] += s.cropResolution?.[k] || 0; });
    if (!a.preview.length && s.preview) a.preview = s.preview;
    return a;
  }, { total: 0, toInsert: 0, skipped: 0, errorCount: 0, errors: [], preview: [], cropResolution: { fromHistory: 0, fromColumn: 0, unresolved: 0 }, unmappedHeaders: first.stats?.unmappedHeaders || [] });
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
  const head = target.fields.map((f) => f.label);
  const ex = target.fields.map((f) => EX[f.key] ?? '');
  const ws = XLSX.utils.aoa_to_sheet([head, ex]);
  ws['!cols'] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `AgroCloud-${target.key}-template.xlsx`);
}
