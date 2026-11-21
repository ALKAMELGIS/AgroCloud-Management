import * as XLSX from 'xlsx';
import { cellText, findHeaderRow, sheetToRows, similarSheets, autoMap, fillDown, chunkRows, mergeResults } from '../excelImport';

test('cellText turns dates and times into stored shapes', () => {
  expect(cellText(new Date(2023, 0, 5))).toBe('2023-01-05');
  expect(cellText(new Date(1899, 11, 30, 7, 30))).toBe('07:30');
  expect(cellText(12.5)).toBe('12.5');
  expect(cellText('  NH-01 ')).toBe('NH-01');
});

test('finds the header below a title and keeps a sheet/row reference', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['AL MAHA FARM HARVEST 2023'],
    [],
    ['Date', 'Location', 'Qty kg'],
    ['2023-01-05', 'NH-01', 120],
    ['', '', ''],
    ['Date', 'Location', 'Qty kg'],
    ['2023-01-06', 'NH-02', 98],
  ]);
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  expect(findHeaderRow(m)).toBe(1);
  const sh = sheetToRows('Jan 2023', ws);
  expect(sh.headers).toEqual(['Date', 'Location', 'Qty kg']);
  expect(sh.rows).toHaveLength(2);
  expect(sh.rows[1]).toMatchObject({ Location: 'NH-02', 'Qty kg': '98' });
  expect(sh.rows[0].__ref).toMatch(/^Jan 2023 · row \d+$/);
});

test('picks sheets laid out like the main one', () => {
  const a = { name: '2022', headers: ['Date', 'Location', 'Qty'], rows: [1, 2, 3] };
  const b = { name: '2023', headers: ['date', 'location', 'qty', 'notes'], rows: [1] };
  const c = { name: 'Summary', headers: ['Month', 'Total'], rows: [1] };
  expect(similarSheets([a, b, c])).toEqual(['2022', '2023']);
});

test('maps columns by key, label and Arabic alias', () => {
  const fields = [
    { key: 'field_name', label: 'Field name', aliases: ['location', 'الحقل'] },
    { key: 'date', label: 'Date', aliases: ['التاريخ'] },
    { key: 'total_quantity', label: 'Total quantity (kg)', aliases: ['الكمية'] },
  ];
  expect(autoMap(fields, ['التاريخ', 'الحقل', 'الكمية'])).toEqual({ date: 'التاريخ', field_name: 'الحقل', total_quantity: 'الكمية' });
  expect(autoMap(fields, ['NH LOCATION', 'Date', 'Total quantity (kg)'])).toEqual({ field_name: 'NH LOCATION', date: 'Date', total_quantity: 'Total quantity (kg)' });
});

test('fills merged cells down and keeps groups in one batch', () => {
  const rows = fillDown([{ d: '2023-01-05', v: 1 }, { d: '', v: 2 }, { d: '2023-01-06', v: 1 }], ['d']);
  expect(rows[1].d).toBe('2023-01-05');
  const batches = chunkRows(rows, 1, (r) => r.d);
  expect(batches.map((b) => b.length)).toEqual([2, 1]);
});

test('adds up batch results', () => {
  const part = (n, e) => ({ dryRun: true, target: 'harvests', stats: { total: n, toInsert: n - e, skipped: 0, errorCount: e, errors: Array(e).fill({ row: 'x', reason: 'y' }), cropResolution: { fromHistory: n - e, fromColumn: 0, unresolved: 0 } } });
  const m = mergeResults([part(10, 2), part(5, 1)]);
  expect(m.stats).toMatchObject({ total: 15, toInsert: 12, errorCount: 3 });
  expect(m.stats.errors).toHaveLength(3);
});
