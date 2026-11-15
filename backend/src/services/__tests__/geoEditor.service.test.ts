jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../zoneAccess.service', () => ({ assertCanManageSite: jest.fn(), assertCanManageZone: jest.fn() }));

import { isGeoClass } from '../geoEditor.service';
import { fieldKey, isNotApplicable, planImport, structureCode } from '../geoImport.service';

const sq = { type: 'Polygon', coordinates: [[[55, 24], [55.001, 24], [55.001, 24.001], [55, 24]]] };
const mapping = { zoneId: 'ZONE_ID', farmCode: 'Farm_Code', farmName: 'Farm_Name', site: 'SITE', siteCode: 'Site_Code', structureType: 'Structure_Type', globalId: 'GlobalID' };
const f = (p: Record<string, any>, geometry: any = sq) => ({ properties: p, geometry });

describe('geo model', () => {
  it('recognises the four layers only', () => {
    expect(['zone', 'site', 'farm_area', 'field'].every(isGeoClass)).toBe(true);
    expect(isGeoClass('countries')).toBe(false);
  });

  it('maps Structure_Type codes and labels to the same subtype codes', () => {
    expect(structureCode(1000)).toBe(1000);
    expect(structureCode('1006')).toBe(1006);
    expect(structureCode('Nethouse')).toBe(1001);
    expect(structureCode('PIVOT')).toBe(1006);
    expect(structureCode('Retractable Roof Houses')).toBe(1003);
    expect(structureCode('Dates Farm')).toBe(1005);
    expect(structureCode('Farm Plots')).toBe(1007);
    expect(structureCode('7', new Map([['7', 'Glasshouse']]))).toBe(1002);
    expect(structureCode('')).toBeNull();
    expect(structureCode('Warehouse')).toBeNull();
  });

  it('builds the field KeyID from ZONE_ID and Farm_Code', () => {
    expect(fieldKey('mh', 'GH-01')).toBe('MH-GH-01');
    expect(fieldKey('MH', 'mh-gh-01')).toBe('MH-GH-01');
    expect(isNotApplicable('Not Applicable')).toBe(true);
    expect(isNotApplicable('Site 1')).toBe(false);
  });

  it('plans zones, sites, farm areas by structure and fields, and reports problems', () => {
    const { rows, issues } = planImport([
      f({ ZONE_ID: 'MH', SITE: 1, Farm_Code: 'GH-01', Farm_Name: 'GH 01', Structure_Type: 1000, GlobalID: '{A}' }),
      f({ ZONE_ID: 'MH', SITE: 1, Farm_Code: 'NH-01', Structure_Type: 'Nethouse' }),
      f({ ZONE_ID: 'MH', SITE: 3, Farm_Code: 'DF-01', Structure_Type: 'Dates Farm' }),
      f({ ZONE_ID: 'MH', SITE: 1, Farm_Code: 'gh-01', Structure_Type: 1000 }),
      f({ ZONE_ID: '', Farm_Code: 'X' }),
      f({ ZONE_ID: 'AD', Farm_Code: 'P1', Site_Code: 'AD-S2', Structure_Type: 'Odd' }),
      f({ ZONE_ID: 'AD', Farm_Code: 'P2' }, null),
    ], mapping, { site: new Map([['1', 'Site 1'], ['3', 'Not Applicable']]) });
    expect(rows.map((r) => r.key)).toEqual(['MH-GH-01', 'MH-NH-01', 'MH-DF-01', 'AD-P1']);
    expect(rows[0]).toMatchObject({ siteName: 'Site 1', siteKey: 'SITE 1', structure: 1000, areaName: 'Greenhouse', name: 'GH 01', globalId: '{A}' });
    expect(rows[1]).toMatchObject({ structure: 1001, areaName: 'Nethouse', name: 'NH-01' });
    expect(rows[2]).toMatchObject({ unassigned: true, siteName: 'Unassigned', areaName: 'Dates Farm' });
    expect(rows[3]).toMatchObject({ siteKey: 'AD-S2', siteName: 'AD-S2', structure: null, areaName: 'Odd' });
    expect(issues).toEqual({ missingKeys: 1, noGeometry: 1, duplicates: ['MH-GH-01'], notApplicable: 1, unknownStructure: ['Odd'] });
  });
});
