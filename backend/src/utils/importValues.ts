/* Values typed in old farm spreadsheets, read into the shapes the database stores. */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n: number) => String(n).padStart(2, '0');
function ymd(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1990 || y > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Dates from old sheets in any common shape -> YYYY-MM-DD. Day/month order is read
 * as day first (as written in the Gulf); when the second number cannot be a month
 * the order is month first. Excel serial numbers are accepted. Unreadable -> undefined.
 */
export function normalizeDate(raw: string): string | undefined {
  const v = raw.trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (b > 12 && a <= 12) return ymd(y, a, b);
    return ymd(y, b, a);
  }
  m = v.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3,9})\.?[-\s/.,]+(\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return ymd(+m[3], mo, +m[1]);
  }
  m = v.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2}),?[\s-]+(\d{2,4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return ymd(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000);
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return undefined;
}

/** Times as HH:MM(:SS), with AM/PM, or as an Excel day fraction -> HH:MM:SS. */
export function normalizeTime(raw: string): string | undefined {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    let h = +m[1];
    const ap = m[4]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || +m[2] > 59) return undefined;
    return `${pad2(h)}:${m[2]}:${m[3] || '00'}`;
  }
  if (/^0?\.\d+$/.test(v)) {
    const secs = Math.round(Number(v) * 86400);
    return `${pad2(Math.floor(secs / 3600) % 24)}:${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}`;
  }
  return undefined;
}
