import { normalizeDate, normalizeTime } from '../importValues';

describe('normalizeDate', () => {
  test.each([
    ['2023-01-05', '2023-01-05'],
    ['2023/1/5', '2023-01-05'],
    ['05/01/2023', '2023-01-05'],
    ['5-1-23', '2023-01-05'],
    ['01/25/2023', '2023-01-25'],
    ['25.01.2023', '2023-01-25'],
    ['5 Jan 2023', '2023-01-05'],
    ['5-January-2023', '2023-01-05'],
    ['Jan 5, 2023', '2023-01-05'],
    ['44931', '2023-01-05'],
    ['2023-01-05T00:00:00.000Z', '2023-01-05'],
  ])('%s -> %s', (raw, want) => expect(normalizeDate(raw)).toBe(want));

  test.each(['31/02/2023', 'tomorrow', '13/13/2023', '12'])('rejects %s', (raw) => expect(normalizeDate(raw)).toBeUndefined());
});

describe('normalizeTime', () => {
  test.each([
    ['7:30', '07:30:00'],
    ['07:30:15', '07:30:15'],
    ['7:30 PM', '19:30:00'],
    ['12:05 am', '00:05:00'],
    ['0.3125', '07:30:00'],
  ])('%s -> %s', (raw, want) => expect(normalizeTime(raw)).toBe(want));
  test('rejects 25:00', () => expect(normalizeTime('25:00')).toBeUndefined());
});

import { normalizePercent, normalizeFlag, leadingDays, canonicalFieldName } from '../importValues';

describe('other import values', () => {
  test('percent', () => {
    expect(normalizePercent('0.527778')).toBe(52.78);
    expect(normalizePercent('52.8%')).toBe(52.8);
    expect(normalizePercent('35')).toBe(35);
    expect(normalizePercent('x')).toBeUndefined();
  });
  test('flags and days', () => {
    expect(normalizeFlag('√')).toBe(true);
    expect(normalizeFlag('N/A')).toBe(false);
    expect(leadingDays('3 days')).toBe(3);
    expect(leadingDays('when dry')).toBeUndefined();
  });
  test('field names', () => {
    expect(canonicalFieldName('NH 01')).toBe(canonicalFieldName('NH-1'));
    expect(canonicalFieldName('GH -02')).toBe(canonicalFieldName('GH-02'));
    expect(canonicalFieldName('BL-7')).toBe(canonicalFieldName('BL -07'));
    expect(canonicalFieldName('NH 13')).not.toBe(canonicalFieldName('NH 1'));
  });
});
