import { toIsoDate, toNumber } from './dashboardUtils';
import { STATUS } from '../../theme/formIdentity';

/*
 * The six standard charts for each form (line, pie, ranked bars, comparison,
 * scatter, columns), computed only from the records loaded for the dashboard.
 * Nothing here invents a value: a chart without data shows "No data".
 */

const DAY = 86400000;
const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Structure type from a field / location name: GH-01 → Greenhouse, NH → Nethouse, PIVOT → PIVOT, PLOT → Farm Plots. */
export function structureType(name) {
  const s = String(name || '').toUpperCase();
  if (/^GH|GREEN/.test(s)) return 'Greenhouse';
  if (/^NH|NET/.test(s)) return 'Nethouse';
  if (/PIVOT/.test(s)) return 'PIVOT';
  if (/PLOT|FARM/.test(s)) return 'Farm Plots';
  return 'Other';
}

/** ISO week label (W45) of a YYYY-MM-DD date. */
function isoWeek(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - first) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

/** Group values by ISO week, in date order: [{ x: 'W45', value }] (sum or count). */
function weekly(points, how = 'sum') {
  const acc = new Map();
  [...points].sort((a, b) => a.date.localeCompare(b.date)).forEach(({ date, value }) => {
    if (!date) return;
    const k = `${date.slice(0, 4)}-W${isoWeek(date)}`;
    const cur = acc.get(k) || { x: `W${isoWeek(date)}`, value: 0 };
    cur.value += how === 'count' ? 1 : (Number.isFinite(value) ? value : 0);
    acc.set(k, cur);
  });
  return [...acc.values()].map((r) => ({ ...r, value: round(r.value, 1) })).slice(-12);
}

/** Sum by day: [{ x: '16 Oct', value }] over the last `days` days that have data. */
function daily(points, days = 45) {
  const acc = {};
  points.forEach(({ date, value }) => { if (date && Number.isFinite(value)) acc[date] = (acc[date] || 0) + value; });
  return Object.keys(acc).sort().slice(-days).map((d) => ({ x: shortDate(d), value: round(acc[d], 1) }));
}

function sumBy(rows, keyFn, valFn) {
  const acc = {};
  rows.forEach((r) => {
    const k = keyFn(r); const v = valFn(r);
    if (k && Number.isFinite(v) && v > 0) acc[k] = (acc[k] || 0) + v;
  });
  return Object.entries(acc).map(([name, value]) => ({ name, value: round(value, 1) })).sort((a, b) => b.value - a.value);
}

/** Top parts of one whole, the rest folded into "Other" so the pie stays readable. */
function topParts(items, n = 4) {
  if (items.length <= n + 1) return items;
  const rest = items.slice(n).reduce((s, x) => s + x.value, 0);
  return [...items.slice(0, n), { name: 'Other', value: round(rest, 1) }];
}

/** Two equal windows counted back from the latest date: previous vs current, per group. */
function twoWindows(rows, dateFn, keyFn, valFn, days) {
  const dates = rows.map(dateFn).filter(Boolean).sort();
  if (!dates.length) return [];
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime();
  const acc = {};
  rows.forEach((r) => {
    const d = dateFn(r); const v = valFn(r); const k = keyFn(r);
    if (!d || !k || !Number.isFinite(v)) return;
    const age = Math.floor((end - new Date(`${d}T00:00:00Z`).getTime()) / DAY);
    if (age < 0 || age >= days * 2) return;
    const g = (acc[k] = acc[k] || { x: k, prev: 0, now: 0 });
    g[age < days ? 'now' : 'prev'] += v;
  });
  return Object.values(acc)
    .map((g) => ({ ...g, prev: round(g.prev, 1), now: round(g.now, 1) }))
    .filter((g) => g.prev > 0 || g.now > 0)
    .sort((a, b) => (b.now + b.prev) - (a.now + a.prev))
    .slice(0, 6);
}

/* ---------------- EC / pH ---------------- */

export function ecphCharts(readings, targets) {
  const byDay = {};
  readings.forEach((r) => {
    const d = toIsoDate(r.rawDate || r.date);
    if (!d) return;
    const b = (byDay[d] = byDay[d] || { ecIn: [], ecOut: [], phIn: [], phOut: [] });
    ['ecIn', 'ecOut', 'phIn', 'phOut'].forEach((k) => { if (r[k] > 0) b[k].push(r[k]); });
  });
  const days = Object.keys(byDay).sort().slice(-45);
  const series = days.map((d) => ({
    x: shortDate(d),
    ecIn: round(mean(byDay[d].ecIn)), ecOut: round(mean(byDay[d].ecOut)),
    phIn: round(mean(byDay[d].phIn)), phOut: round(mean(byDay[d].phOut)),
  }));

  const [lo, hi] = targets.ecOut;
  const status = { good: 0, warn: 0, out: 0, none: 0 };
  readings.forEach((r) => {
    if (!(r.ecOut > 0)) { status.none += 1; return; }
    const m = (hi - lo) * 0.1;
    if (r.ecOut < lo || r.ecOut > hi) status.out += 1;
    else if (r.ecOut <= lo + m || r.ecOut >= hi - m) status.warn += 1;
    else status.good += 1;
  });
  const statusData = [
    { name: 'In range', value: status.good, c: STATUS.good.color },
    { name: 'Watch', value: status.warn, c: '#c4761a' },
    { name: 'Out of range', value: status.out, c: STATUS.out.color },
    { name: 'No reading', value: status.none, c: '#9aa39c' },
  ].filter((s) => s.value > 0);

  const perField = {};
  readings.forEach((r) => { if (r.ecOut > 0) (perField[r.fieldName] = perField[r.fieldName] || []).push(r.ecOut); });

  const scatter = readings
    .filter((r) => r.ecOut > 0 && r.percentDrain > 0)
    .slice(-400)
    .map((r) => ({ x: round(r.percentDrain * 100, 1), y: r.ecOut, group: structureType(r.fieldName) }));

  return [
    { id: 'ecph-ec', kind: 'line', title: 'EC in and out · daily mean', unit: 'mS/cm', band: targets.ecOut,
      data: series, series: [{ key: 'ecIn', name: 'EC in' }, { key: 'ecOut', name: 'EC out' }] },
    { id: 'ecph-status', kind: 'pie', title: 'Readings by status', unit: 'readings',
      data: statusData.map(({ name, value }) => ({ name, value })), colors: statusData.map((s) => s.c) },
    { id: 'ecph-field', kind: 'rank', title: 'Average EC out by field', unit: 'mS/cm', target: hi,
      data: Object.entries(perField).map(([name, v]) => ({ name, value: round(mean(v)) })) },
    { id: 'ecph-ph', kind: 'line', title: 'pH in and out · daily mean', unit: 'pH', band: targets.phOut,
      data: series, series: [{ key: 'phIn', name: 'pH in' }, { key: 'phOut', name: 'pH out' }] },
    { id: 'ecph-drain', kind: 'scatter', title: 'Drain % vs EC out', unit: 'scatter', xLabel: 'Drain %', yLabel: 'EC out mS/cm', data: scatter },
    { id: 'ecph-week', kind: 'columns', title: 'Readings per week', unit: 'readings',
      data: weekly(readings.map((r) => ({ date: toIsoDate(r.rawDate || r.date), value: 1 })), 'count') },
  ];
}

/* ---------------- Fertigation ---------------- */

export function fertigationCharts(entries, fieldName) {
  const rows = entries.map((e) => ({
    date: toIsoDate(e.date),
    field: fieldName(e),
    fert: toNumber(e.totalFertilizer),
    water: toNumber(e.dailyWater),
    products: e.fertilizers && typeof e.fertilizers === 'object' ? e.fertilizers : {},
  }));
  const products = {};
  rows.forEach((r) => Object.entries(r.products).forEach(([n, q]) => {
    const v = toNumber(q); if (v > 0) products[n] = (products[n] || 0) + v;
  }));
  const productData = Object.entries(products).map(([name, value]) => ({ name, value: round(value, 1) })).sort((a, b) => b.value - a.value);

  return [
    { id: 'fert-day', kind: 'line', title: 'Fertiliser applied per day', unit: 'kg',
      data: daily(rows.map((r) => ({ date: r.date, value: r.fert }))), series: [{ key: 'value', name: 'kg per day' }] },
    { id: 'fert-product', kind: 'pie', title: 'Share by product', unit: 'kg', data: topParts(productData) },
    { id: 'fert-field', kind: 'rank', title: 'Fertiliser by field', unit: 'kg', data: sumBy(rows, (r) => r.field, (r) => r.fert) },
    { id: 'fert-compare', kind: 'compare', title: 'Last week vs this week by field', unit: 'kg',
      data: twoWindows(rows, (r) => r.date, (r) => r.field, (r) => r.fert, 7),
      series: [{ key: 'prev', name: 'Last week' }, { key: 'now', name: 'This week' }] },
    { id: 'fert-scatter', kind: 'scatter', title: 'Water vs fertiliser per entry', unit: 'scatter', xLabel: 'Fertiliser kg', yLabel: 'Water m³',
      data: rows.filter((r) => r.fert > 0 && r.water > 0).slice(-400).map((r) => ({ x: r.fert, y: r.water, group: structureType(r.field) })) },
    { id: 'fert-week', kind: 'columns', title: 'Entries per week', unit: 'entries',
      data: weekly(rows.map((r) => ({ date: r.date, value: 1 })), 'count') },
  ];
}

/* ---------------- Irrigation ---------------- */

/** rows: [{ date (ISO), location, dailyTotal, frequency }] */
export function irrigationCharts(rows) {
  const clean = rows.map((r) => ({
    date: toIsoDate(r.date), location: r.location, water: toNumber(r.dailyTotal), cycles: toNumber(r.frequency),
  })).filter((r) => r.date);
  const byType = sumBy(clean, (r) => structureType(r.location), (r) => r.water);
  const cyclesDaily = daily(clean.map((r) => ({ date: r.date, value: r.cycles })));

  return [
    { id: 'irr-day', kind: 'line', title: 'Water applied per day', unit: 'm³',
      data: daily(clean.map((r) => ({ date: r.date, value: r.water }))), series: [{ key: 'value', name: 'm³ per day' }] },
    { id: 'irr-type', kind: 'pie', title: 'Water by structure type', unit: 'm³', data: byType },
    { id: 'irr-loc', kind: 'rank', title: 'Water by location', unit: 'm³', data: sumBy(clean, (r) => r.location, (r) => r.water) },
    { id: 'irr-compare', kind: 'compare', title: 'Last week vs this week', unit: 'm³',
      data: twoWindows(clean, (r) => r.date, (r) => structureType(r.location), (r) => r.water, 7),
      series: [{ key: 'prev', name: 'Last week' }, { key: 'now', name: 'This week' }] },
    { id: 'irr-scatter', kind: 'scatter', title: 'Cycles vs volume', unit: 'scatter', xLabel: 'Volume m³', yLabel: 'Cycles',
      data: clean.filter((r) => r.water > 0 && r.cycles > 0).slice(-400).map((r) => ({ x: r.water, y: r.cycles, group: structureType(r.location) })) },
    { id: 'irr-cycles', kind: 'line', title: 'Irrigation cycles per day', unit: 'cycles',
      data: cyclesDaily, series: [{ key: 'value', name: 'cycles per day' }] },
  ];
}

/* ---------------- Harvest ---------------- */

export function harvestCharts(entries, fieldName) {
  const rows = entries.map((e) => ({ date: toIsoDate(e.date), field: fieldName(e), kg: toNumber(e.totalQuantity), varieties: e.varieties || [] }));
  const crops = [];
  rows.forEach((r) => r.varieties.forEach((v) => crops.push({ date: r.date, name: v.variety || 'Unknown', kg: toNumber(v.quantity), field: r.field })));

  return [
    { id: 'harv-day', kind: 'line', title: 'Harvest per day', unit: 'kg',
      data: daily(rows.map((r) => ({ date: r.date, value: r.kg }))), series: [{ key: 'value', name: 'kg per day' }] },
    { id: 'harv-crop', kind: 'pie', title: 'Harvest by crop', unit: 'kg', data: topParts(sumBy(crops, (c) => c.name, (c) => c.kg)) },
    { id: 'harv-field', kind: 'rank', title: 'Harvest by field', unit: 'kg', data: sumBy(rows, (r) => r.field, (r) => r.kg) },
    { id: 'harv-compare', kind: 'compare', title: 'By crop · last 4 weeks vs the 4 before', unit: 'kg',
      data: twoWindows(crops, (c) => c.date, (c) => c.name, (c) => c.kg, 28),
      series: [{ key: 'prev', name: '4 weeks before' }, { key: 'now', name: 'Last 4 weeks' }] },
    { id: 'harv-scatter', kind: 'scatter', title: 'Each harvest entry over time', unit: 'scatter', xLabel: 'Day of season', yLabel: 'kg',
      data: (() => {
        const ds = rows.map((r) => r.date).filter(Boolean).sort();
        if (!ds.length) return [];
        const t0 = new Date(`${ds[0]}T00:00:00Z`).getTime();
        return rows.filter((r) => r.kg > 0 && r.date).slice(-400).map((r) => ({
          x: Math.round((new Date(`${r.date}T00:00:00Z`).getTime() - t0) / DAY), y: r.kg, group: structureType(r.field),
        }));
      })() },
    { id: 'harv-week', kind: 'columns', title: 'Harvest per week', unit: 'kg', data: weekly(rows.map((r) => ({ date: r.date, value: r.kg }))) },
  ];
}
