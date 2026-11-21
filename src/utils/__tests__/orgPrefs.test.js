import { normalizePrefs, weekStartOf, showQty, unitFor } from '../orgPrefs';

describe('orgPrefs', () => {
  test('week starts on the organization day', () => {
    const wed = new Date(2026, 10, 18, 15, 0); // Wednesday 18 Nov 2026
    expect(weekStartOf(wed, normalizePrefs({ week_start: 'saturday' })).getDate()).toBe(14);
    expect(weekStartOf(wed, normalizePrefs({ week_start: 'sunday' })).getDate()).toBe(15);
    expect(weekStartOf(wed, normalizePrefs({ week_start: 'monday' })).getDate()).toBe(16);
    const sat = new Date(2026, 10, 21);
    expect(weekStartOf(sat, normalizePrefs({})).getDate()).toBe(21);
  });

  test('converts stored metric values to the chosen unit', () => {
    const p = normalizePrefs({ units: { yield: 't', water: 'gal' } });
    expect(showQty(112839, 'yield', { p })).toMatchObject({ text: '112.84', unit: 't' });
    expect(showQty(10, 'water', { p }).unit).toBe('gal');
    expect(Math.round(showQty(10, 'water', { p }).value)).toBe(2642);
    expect(showQty(1234.5, 'yield', { decimals: 0, p: normalizePrefs({}) })).toMatchObject({ text: '1,235', unit: 'kg' });
    expect(unitFor('area', normalizePrefs({ units: { area: 'dunam' } })).unit).toBe('dunam');
  });

  test('unknown or missing values fall back safely', () => {
    expect(showQty(null, 'yield').text).toBe('–');
    expect(normalizePrefs(null).units.water).toBe('m3');
  });
});
