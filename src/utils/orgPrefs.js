import { useSyncExternalStore } from 'react';

/*
 * Organization preferences from Settings > General (organization.settings):
 * units, first day of week, currency, language. Values are stored in metric;
 * these helpers only change what is shown.
 */

export const DEFAULT_PREFS = {
  language: 'en',
  timezone: 'Asia/Dubai',
  default_currency: 'AED',
  week_start: 'saturday',
  units: { area: 'm2', yield: 'kg', water: 'm3' },
};

let prefs = DEFAULT_PREFS;
const listeners = new Set();

export function normalizePrefs(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return {
    ...DEFAULT_PREFS,
    ...s,
    units: { ...DEFAULT_PREFS.units, ...(s.units && typeof s.units === 'object' ? s.units : {}) },
  };
}

export function setOrgPrefs(settings) {
  prefs = normalizePrefs(settings);
  listeners.forEach((fn) => fn());
}

export function getOrgPrefs() {
  return prefs;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOrgPrefs() {
  return useSyncExternalStore(subscribe, getOrgPrefs, getOrgPrefs);
}

const WEEK_DAY = { sunday: 0, monday: 1, saturday: 6 };

/** Start (00:00 local) of the week containing `date`, by the organization's first day. */
export function weekStartOf(date = new Date(), p = prefs) {
  const first = WEEK_DAY[p.week_start] ?? 6;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - first + 7) % 7));
  return d;
}

// kind -> chosen unit -> { unit label, factor from the stored unit, decimals }
const CONVERT = {
  yield: { kg: { unit: 'kg', f: 1, dp: 0 }, t: { unit: 't', f: 0.001, dp: 2 } },
  water: { m3: { unit: 'm³', f: 1, dp: 1 }, gal: { unit: 'gal', f: 264.172, dp: 0 } },
  area: { m2: { unit: 'm²', f: 1, dp: 0 }, dunam: { unit: 'dunam', f: 0.001, dp: 1 }, acre: { unit: 'acre', f: 1 / 4046.856, dp: 2 } },
};

/** How a stored metric value of `kind` shows: { factor, unit, decimals }. */
export function unitFor(kind, p = prefs) {
  const table = CONVERT[kind];
  if (!table) return { factor: 1, unit: '', decimals: 0 };
  const c = table[p.units?.[kind]] || Object.values(table)[0];
  return { factor: c.f, unit: c.unit, decimals: c.dp };
}

/** Convert and format; `decimals` overrides the unit's default only for the stored unit. */
export function showQty(value, kind, { decimals, p = prefs } = {}) {
  const n = value == null || value === '' ? NaN : Number(value);
  const u = unitFor(kind, p);
  if (!Number.isFinite(n)) return { text: '–', unit: u.unit };
  const dp = u.factor === 1 && decimals != null ? decimals : u.decimals;
  return { text: (n * u.factor).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 }), unit: u.unit, value: n * u.factor };
}
