import { coerceRow, parseCrop } from '../importer';
import { TARGETS } from '../targets';

jest.mock('../../../db/client', () => ({ dbPool: { query: jest.fn(), connect: jest.fn() } }));

describe('coerceRow', () => {
  const map = { field_name: 'F', date: 'D', valve_number: 'V', ph_out: 'P', percent_drain: 'Dr' };
  test('reads a valve row from the EC/pH record', () => {
    const { values, error } = coerceRow({ F: 'NH 14', D: '17/09/2025', V: '1', P: '7.51', Dr: '0.527778' }, TARGETS.ecph_full, map);
    expect(error).toBeNull();
    expect(values).toMatchObject({ date: '2025-09-17', valve_number: 1, ph_out: 7.51, percent_drain: 52.78 });
  });
  test('a pH typed without its decimal point is reported, not stored', () => {
    expect(coerceRow({ F: 'NH 14', D: '2025-09-17', V: '1', P: '700' }, TARGETS.ecph_full, map).error).toMatch(/pH out 700 is outside 0–14/);
  });
  test('"2,3" is not valve 23', () => {
    expect(coerceRow({ F: 'NH 1', D: '2025-12-04', V: '2,3' }, TARGETS.ecph_full, map).error).toMatch(/Cannot read "2,3" as a whole number/);
  });
  test('an unreadable required date is an error', () => {
    expect(coerceRow({ F: 'NH 14', D: '31/02/2025', V: '1' }, TARGETS.ecph_full, map).error).toMatch(/as a date/);
  });
  test('fertilizer columns become one amount per product', () => {
    const { values } = coerceRow({ F: 'NH 21', D: '2025-09-21', MKP: '0.064', MAP: '0.32', Urea: '' }, TARGETS.fertigation, { field_name: 'F', date: 'D', fertilizer_columns: ['MKP', 'MAP', 'Urea'] });
    expect(values.fertilizer_columns).toEqual({ MKP: 0.064, MAP: 0.32 });
  });
});

describe('parseCrop', () => {
  const rows = [
    { crop_id: 'c1', crop_name: 'Capsicum', variety_id: 'v1', variety_name: 'Sven RZ' },
    { crop_id: 'c2', crop_name: 'Tomato', variety_id: null, variety_name: null },
  ];
  test('crop and variety from "Capsicum Yellow Sven RZ"', () => {
    expect(parseCrop('Capsicum Yellow Sven RZ', rows)).toMatchObject({ cropId: 'c1', varietyId: 'v1' });
  });
  test('crop without a known variety', () => {
    expect(parseCrop('Plum Tomato', rows)).toMatchObject({ cropId: 'c2', varietyId: null });
  });
  test('unknown crop', () => {
    expect(parseCrop('Fig', rows).cropId).toBeNull();
  });
});
