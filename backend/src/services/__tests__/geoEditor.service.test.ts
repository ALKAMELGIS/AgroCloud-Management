jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../zoneAccess.service', () => ({ assertCanManageSite: jest.fn(), assertCanManageZone: jest.fn() }));

import { isGeoClass, subtypeFromStructure } from '../geoEditor.service';

describe('geoEditor.service', () => {
  it('recognises the four layers only', () => {
    expect(['zone', 'site', 'farm_area', 'field'].every(isGeoClass)).toBe(true);
    expect(isGeoClass('countries')).toBe(false);
  });

  it('maps ArcGIS structure types to field subtypes', () => {
    expect(subtypeFromStructure('Greenhouse')).toBe(1);
    expect(subtypeFromStructure('NetHouse')).toBe(2);
    expect(subtypeFromStructure('Shade house')).toBe(2);
    expect(subtypeFromStructure('Open Field')).toBe(3);
    expect(subtypeFromStructure('Pivot')).toBe(4);
    expect(subtypeFromStructure('Nursery')).toBe(5);
    expect(subtypeFromStructure('Cravo')).toBe(1);
    expect(subtypeFromStructure('')).toBeNull();
    expect(subtypeFromStructure(null)).toBeNull();
    expect(subtypeFromStructure('Warehouse')).toBeNull();
  });
});
