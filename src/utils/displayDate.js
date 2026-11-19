/**
 * One date style for the whole app: "19 Nov 2026" (and "19 Nov 2026, 07:30"
 * when a time matters). Inputs stay ISO; this is only for reading.
 */
const D = { day: 'numeric', month: 'short', year: 'numeric' };

export function displayDate(value) {
  if (!value) return '–';
  const d = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', D);
}

export function displayDateTime(value) {
  if (!value) return '–';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const time = d.getHours() || d.getMinutes() ? `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  return `${d.toLocaleDateString('en-GB', D)}${time}`;
}

export function displayDay(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-GB', { weekday: 'long', ...D });
}
