jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn(), connect: jest.fn() } }));

import { buildFeedSql, parseFeedFile, toCsv, toGeoJson, tableDefinition, FEED_FORMS } from '../formFeeds.service';

const ORG = '00000000-0000-4000-8000-000000000001';

describe('form feeds', () => {
  it('reads <form>.<format> and refuses anything else', () => {
    expect(parseFeedFile('ecph.csv')).toEqual({ form: 'ecph', format: 'csv' });
    expect(parseFeedFile('crop-rotation.GeoJSON')).toEqual({ form: 'crop-rotation', format: 'geojson' });
    expect(() => parseFeedFile('ecph.xlsx')).toThrow();
    expect(() => parseFeedFile('users.csv')).toThrow();
    expect(() => parseFeedFile('../ecph.csv')).toThrow();
  });

  it('scopes every form to the organisation and filters by KeyID with parameters', () => {
    for (const id of Object.keys(FEED_FORMS)) {
      const { sql, params } = buildFeedSql(ORG, id, { keyid: "ZONE-1'; DROP TABLE x;--", since: '2026-01-01' });
      expect(params[0]).toBe(ORG);
      expect(params).toContain("ZONE-1'; DROP TABLE x;--");
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).toMatch(/organization_id = \$1/);
    }
    expect(() => buildFeedSql(ORG, 'ecph', { since: "2026'" })).toThrow();
  });

  it('leaves staff names out unless turned on', () => {
    expect(buildFeedSql(ORG, 'irrigation').cols.map((c) => c.name)).not.toContain('AUTHORIZED_BY');
    expect(buildFeedSql(ORG, 'irrigation', { includeNames: true }).cols.map((c) => c.name)).toContain('AUTHORIZED_BY');
    expect(tableDefinition('harvest').fields.map((f: any) => f.name)).not.toContain('NOTES');
  });

  it('links field forms by GlobalID and the pump room by site', () => {
    for (const f of Object.values(FEED_FORMS)) {
      const names = f.cols.map((c) => c.name);
      expect(names[0]).toBe('RECORD_ID');
      expect(names).toContain(f.linkBy === 'field' ? 'STRUCT_GLOBALID' : 'SITE_KEYID');
    }
  });

  it('writes CSV safely for Excel and Power BI', () => {
    const cols = [{ name: 'A', type: 'string' as const, sql: '' }, { name: 'B', type: 'double' as const, sql: '' }];
    const csv = toCsv([{ A: '=HYPERLINK("x")', B: -1.5 }, { A: 'a,"b"', B: null }], cols);
    expect(csv.startsWith('﻿A,B\r\n')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")",-1.5`);
    expect(csv).toContain('"a,""b""",');
  });

  it('builds GeoJSON points and an ArcGIS table definition', () => {
    const gj = toGeoJson([{ RECORD_ID: '1', __geom: { type: 'Point', coordinates: [55, 24] } }], [{ name: 'RECORD_ID', type: 'string', sql: '' }]);
    expect(gj.features[0]).toEqual({ type: 'Feature', geometry: { type: 'Point', coordinates: [55, 24] }, properties: { RECORD_ID: '1' } });
    const def = tableDefinition('ecph');
    expect(def.name).toBe('AgroCloud_ecph');
    expect(def.type).toBe('Table');
    expect(def.fields.find((f: any) => f.name === 'STRUCT_GLOBALID')).toMatchObject({ type: 'esriFieldTypeString' });
    expect(def.fields.find((f: any) => f.name === 'DATE')).toMatchObject({ type: 'esriFieldTypeDateOnly' });
  });
});

// Runs each form's SQL on a real PostGIS database when FEEDS_PG is set (CI skips it).
const PG = process.env.FEEDS_PG;
(PG ? describe : describe.skip)('form feeds on PostgreSQL', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = jest.requireActual('pg');
  const client = new Client({ connectionString: PG });
  beforeAll(() => client.connect());
  afterAll(() => client.end());
  it.each(Object.keys(FEED_FORMS))('%s runs', async (id) => {
    for (const q of [{}, { keyid: 'X', since: '2026-01-01', withGeometry: true, includeNames: true }]) {
      const { sql, params } = buildFeedSql(ORG, id, q);
      await expect(client.query(sql, params)).resolves.toBeTruthy();
    }
  });
});
