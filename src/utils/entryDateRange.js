import { intersectDateRange } from './seasonListDates';
import { weekStartOf } from './orgPrefs';

export const DATE_PRESETS = [
  { id: 'season', label: 'This season' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: '90days', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
];

function toISO(d) {
  return d.toISOString().split('T')[0];
}

export function getDateRangeForPreset(preset, seasonRange = {}) {
  const today = new Date();
  const todayStr = toISO(today);
  const bounds = {
    startDate: seasonRange.startDate || seasonRange.start_date || '',
    endDate: seasonRange.endDate || seasonRange.end_date || '',
  };

  let raw;
  switch (preset) {
    case 'season':
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
    case 'today':
      raw = { startDate: todayStr, endDate: todayStr };
      break;
    case 'week': {
      // First day of the week from Settings > General (Saturday by default).
      const start = weekStartOf(today);
      raw = { startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`, endDate: todayStr };
      break;
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      raw = { startDate: toISO(first), endDate: todayStr };
      break;
    }
    case '90days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      raw = { startDate: toISO(d), endDate: todayStr };
      break;
    }
    case 'all':
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
    default:
      raw = { startDate: bounds.startDate, endDate: bounds.endDate };
      break;
  }

  const clipped = (preset === 'season' || preset === 'all' || !bounds.startDate)
    ? raw
    : intersectDateRange(raw, bounds);
  return {
    ...(clipped.startDate ? { start_date: clipped.startDate } : {}),
    ...(clipped.endDate ? { end_date: clipped.endDate } : {}),
  };
}
