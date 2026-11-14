/**
 * Small geometry helpers for the map editor (no extra library).
 * The server (PostGIS) stays the judge of every saved shape; these only drive
 * the live area read-out, circles for pivots and file import.
 */

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;

/** Geodesic area of a Polygon / MultiPolygon in hectares (holes subtracted). */
export function areaHa(geometry) {
  if (!geometry) return null;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  let total = 0;
  polys.forEach((poly) => poly.forEach((ring, ri) => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i]; const [x2, y2] = ring[i + 1];
      a += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
    }
    a = Math.abs((a * R * R) / 2);
    total += ri ? -a : a;
  }));
  return Math.round((total / 10000) * 10000) / 10000;
}

/** A circle (pivot) as a polygon of `steps` vertices. */
export function circlePolygon([lng, lat], radiusM, steps = 72) {
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const b = (i / steps) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(b)) / R;
    const dLng = (radiusM * Math.sin(b)) / (R * Math.cos(rad(lat)));
    ring.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** All polygons of any GeoJSON (Feature, FeatureCollection or geometry) as one MultiPolygon. */
export function toMultiPolygon(gj) {
  const out = [];
  const visit = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach((f) => visit(f.geometry));
    else if (g.type === 'Feature') visit(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(visit);
    else if (g.type === 'Polygon') out.push(g.coordinates);
    else if (g.type === 'MultiPolygon') out.push(...g.coordinates);
  };
  visit(Array.isArray(gj) ? { type: 'FeatureCollection', features: gj.flatMap((x) => x.features || []) } : gj);
  if (!out.length) return null;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

/** Read a boundary file: GeoJSON, KML or a zipped Shapefile. */
export async function readBoundaryFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.zip') || name.endsWith('.shp')) {
    const { default: shp } = await import('shpjs');
    return toMultiPolygon(await shp(await file.arrayBuffer()));
  }
  const text = await file.text();
  if (name.endsWith('.kml')) {
    const { kml } = await import('@tmcw/togeojson');
    return toMultiPolygon(kml(new DOMParser().parseFromString(text, 'text/xml')));
  }
  return toMultiPolygon(JSON.parse(text));
}

/** [[south, west], [north, east]] of a geometry, for fitBounds. */
export function boundsOf(geometry) {
  if (!geometry) return null;
  let w = 180; let s = 90; let e = -180; let n = -90;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  polys.forEach((p) => p[0].forEach(([x, y]) => { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }));
  return [[s, w], [n, e]];
}

export const GEO_CLASSES = [
  { key: 'zone', list: 'zones', label: 'Zones', one: 'Zone', parent: null },
  { key: 'site', list: 'sites', label: 'Sites', one: 'Site', parent: 'zone' },
  { key: 'farm_area', list: 'farm_areas', label: 'Farm areas', one: 'Farm area', parent: 'site' },
  { key: 'field', list: 'fields', label: 'Fields', one: 'Field', parent: 'farm_area' },
];
