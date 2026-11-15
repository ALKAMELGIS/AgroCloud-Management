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
    expect(fieldKey('RS', 'Botancal Garden')).toBe('RS-BOTANCAL-GARDEN');
    expect(isNotApplicable('Not Applicable')).toBe(true);
    expect(isNotApplicable('Site 1')).toBe(false);
  });

  it('plans zones, sites, farm areas by structure and fields, and reports problems', () => {
    const { rows, issues } = planImport([
      f({ OBJECTID: 1, ZONE_ID: 'MH', SITE: 1, Site_Code: 'U1V01', Farm_Code: 'UOMAHNH001', Farm_Name: 'NH 01', Structure_Type: 1001, GlobalID: '{A}' }),
      f({ OBJECTID: 2, ZONE_ID: 'MH', SITE: 2, Farm_Code: 'MH126', Farm_Name: 'PIVOT-5', Structure_Type: 1006 }),
      f({ OBJECTID: 3, ZONE_ID: 'KE', SITE: 3, Farm_Code: 'KE08', Farm_Name: '<Null>', Structure_Type: 1000 }),
      f({ OBJECTID: 4, ZONE_ID: 'MH', SITE: 2, Farm_Code: 'mh126', Structure_Type: 1006 }),
      f({ OBJECTID: 5, ZONE_ID: 'AD', SITE: 2, Farm_Name: 'FB-NH03-18', ProjectCode: 'PRJ113', Structure_Type: 1001 }),
      f({ OBJECTID: 6, Country: 3, Farm_Name: 'RH GH5', ProjectCode: 'PRJ134', Structure_Type: 'Odd' }),
      f({ OBJECTID: 7, Farm_Name: 'Botancal Garden', ProjectCode: 'PRJ135' }),
      f({ OBJECTID: 10, Farm_Name: '101B' }, { type: 'Polygon', coordinates: [[[19.5, 45.5], [19.51, 45.5], [19.51, 45.51], [19.5, 45.5]]] }),
      f({ OBJECTID: 8, Farm_Name: 'Botancal Garden', ProjectCode: 'PRJ136' }),
      f({ OBJECTID: 9, ZONE_ID: 'AD', Farm_Code: 'P2' }, null),
    ], mapping, { site: new Map([['1', 'Site 1'], ['2', 'Site 2'], ['3', 'Not Applicable']]) });
    expect(rows.map((r) => r.key)).toEqual([
      'MH-UOMAHNH001', 'MH-MH126', 'KE-KE08', 'MH-MH126-OID4', 'AD-FB-NH03-18', 'MA-RH-GH5', 'UAE-NA-BOTANCAL-GARDEN', 'RS-101B', 'UAE-NA-BOTANCAL-GARDEN-PRJ136',
    ]);
    expect(rows[0]).toMatchObject({ siteName: 'Site 1', siteKey: 'U1V01', structure: 1001, areaName: 'Nethouse', name: 'NH 01', globalId: '{A}', keySource: 'farm_code' });
    expect(rows[2]).toMatchObject({ unassigned: true, siteName: 'Unassigned', name: 'KE08' });
    expect(rows[4]).toMatchObject({ zone: 'AD', keySource: 'farm_name', siteName: 'Site 2' });
    expect(rows[5]).toMatchObject({ zone: 'MA', zoneName: 'Morocco', structure: null, areaName: 'Odd', unassigned: true });
    expect(rows[6]).toMatchObject({ zone: 'UAE-NA', zoneName: 'UAE – unassigned' });
    expect(rows[7]).toMatchObject({ zone: 'RS', zoneName: 'Serbia' });
    expect(issues).toMatchObject({
      missingKeys: 0, noGeometry: 1, duplicates: ['MH-MH126', 'UAE-NA-BOTANCAL-GARDEN'], notApplicable: 5, unknownStructure: ['Odd'],
      noFarmCode: 5, noZone: 4, noZoneByCountry: { Morocco: 1, 'UAE – unassigned': 2, Serbia: 1 }, countryFromLocation: 3,
    });
  });
});
