import { chartsInUnit } from '../standardChartSets';

const charts = [
  { id: 'a', kind: 'line', unit: 'kg', data: [{ x: '1 Nov', value: 1500 }], series: [{ key: 'value', name: 'kg per day' }] },
  { id: 'b', kind: 'compare', unit: 'kg', data: [{ name: 'Tomato', prev: 2000, now: 3000 }] },
  { id: 'c', kind: 'scatter', unit: 'scatter', yLabel: 'kg', data: [{ x: 3, y: 500 }] },
  { id: 'd', kind: 'columns', unit: 'entries', data: [{ value: 4 }] },
];

test('converts only charts in the stored unit', () => {
  const out = chartsInUnit(charts, { from: 'kg', factor: 0.001, unit: 't', scatter: 'y', decimals: 2 });
  expect(out[0]).toMatchObject({ unit: 't', data: [{ x: '1 Nov', value: 1.5 }], series: [{ name: 't per day' }] });
  expect(out[1].data[0]).toMatchObject({ prev: 2, now: 3 });
  expect(out[2]).toMatchObject({ yLabel: 't', data: [{ x: 3, y: 0.5 }] });
  expect(out[3]).toBe(charts[3]);
});

test('factor 1 leaves the charts as they are', () => {
  expect(chartsInUnit(charts, { from: 'kg', factor: 1, unit: 'kg' })).toBe(charts);
});
