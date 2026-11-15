import { PoolClient } from 'pg';
import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { fetchLayerJson, parseFeatureServiceUrl, queryFeatures } from './arcgis.service';
import { detectKeyFields, KeyMapping } from './arcgisLink.service';

/**
 * Full import of Agro_Structures (or any layer with the same keys) into the
 * system's own geodatabase, then AgroCloud is the master.
 *
 * Relationship classes built from the layer:
 *   ZONE_ID ─1:M─▶ site (ZONE_ID + Site_Code / SITE; "Not Applicable" → Unassigned)
 *           ─1:M─▶ farm area (one per Structure_Type in the site)
 *           ─1:M─▶ field  (primary key ZONE_ID + Farm_Code, KeyID ZONE_ID-Farm_Code)
 *           ─1:M─▶ form records (field_id → FORM_ID)
 * Structure_Type is the field subtype (same codes as the layer's domain).
 *
 * The layer is only read. The plan is pure (planImport) and is applied in one
 * transaction; a dry run rolls it back and returns the same report.
 */

export type SourceFeature = { properties: Record<string, any>; geometry: any };

/** Structure_Type domain of Agro_Structures; subtype codes are the same. */
export const STRUCTURE_TYPES: Array<{ code: number; name: string; match: RegExp }> = [
  { code: 1000, name: 'Greenhouse', match: /green/ },
  { code: 1001, name: 'Nethouse', match: /net|shade/ },
  { code: 1002, name: 'Glasshouse', match: /glass/ },
  { code: 1003, name: 'Retractable Roof Houses', match: /retract/ },
  { code: 1004, name: 'Cravo', match: /cravo/ },
  { code: 1005, name: 'Dates Farm', match: /date|palm/ },
  { code: 1006, name: 'PIVOT', match: /pivot/ },
  { code: 1007, name: 'Farm Plots', match: /plot|open|field/ },
];

/** Structure_Type value (code or label, optionally through the layer's domain) → subtype code. */
export function structureCode(raw: unknown, domain?: Map<string, string>): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const v = String(raw).trim();
  if (/^\d+$/.test(v) && STRUCTURE_TYPES.some((t) => t.code === Number(v))) return Number(v);
  const label = (domain?.get(v) || v).toLowerCase();
  const hit = STRUCTURE_TYPES.find((t) => t.match.test(label));
  return hit ? hit.code : null;
}

export function isNotApplicable(label: unknown): boolean {
  return /not\s*applic|^n\s*\/?\s*a$|^none$|^-$/i.test(String(label ?? '').trim());
}

/** Same rule as the database function geo_field_key(). */
export function fieldKey(zone: string, farm: string): string {
  const z = zone.trim().toUpperCase().replace(/\s+/g, '-');
  const f = farm.trim().toUpperCase().replace(/\s+/g, '-');
  return (f.startsWith(`${z}-`) ? f : `${z}-${f}`).slice(0, 40);
}

export type PlanRow = {
  zone: string; zoneName: string; siteKey: string; siteName: string; siteCode: string | null; unassigned: boolean;
  structure: number | null; areaName: string; farmCode: string; key: string; name: string;
  /** Where farmCode came from: the layer's Farm_Code, or a stand-in when it is empty. */
  keySource: 'farm_code' | 'farm_name' | 'project_code' | 'object_id';
  globalId: string | null; geometry: any;
};
export type PlanIssues = {
  missingKeys: number; noGeometry: number; duplicates: string[]; notApplicable: number; unknownStructure: string[];
  /** Features without Farm_Code / ZONE_ID that were given a stand-in key or a country zone. */
  noFarmCode: number; noZone: number; noZoneByCountry: Record<string, number>;
  /** Country empty in the layer, taken from where the shape lies. */
  countryFromLocation: number;
};

const polygonal = (g: any) => g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates) && g.coordinates.length > 0;

/** Zones for features without ZONE_ID: one per country (Country domain of Agro_Structures). */
export const COUNTRY_ZONES: Record<string, [string, string]> = {
  1: ['UAE-NA', 'UAE – unassigned'], 2: ['RS', 'Serbia'], 3: ['MA', 'Morocco'], 4: ['MR', 'Mauritania'],
  5: ['ET', 'Ethiopia'], 8: ['ET', 'Ethiopia'], 6: ['SA', 'Saudi Arabia'], 9: ['SA', 'Saudi Arabia'],
  7: ['TZ', 'Tanzania'], 10: ['SL', 'Sierra Leone'],
};
const NO_COUNTRY: [string, string] = ['UNASSIGNED', 'Unassigned'];

/** Rough country boxes [west, south, east, north] for features whose Country is empty (first match wins). */
const COUNTRY_BOXES: Array<[string, [number, number, number, number]]> = [
  ['1', [51, 22.4, 56.5, 26.4]],     // UAE
  ['2', [18.8, 42.2, 23.1, 46.2]],   // Serbia
  ['4', [-17.2, 14.6, -4.8, 21.3]],  // Mauritania (south of Morocco's box)
  ['3', [-17.2, 21.3, -0.9, 36]],    // Morocco
  ['6', [34.5, 16.3, 55.7, 32.2]],   // Saudi Arabia
  ['5', [33, 3.4, 48, 15]],          // Ethiopia
  ['7', [29.3, -11.8, 40.5, -0.9]],  // Tanzania
  ['10', [-13.4, 6.9, -10.2, 10]],   // Sierra Leone
];
function countryFromShape(g: any): string | null {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0];
  if (!ring?.length) return null;
  const x = ring.reduce((a: number, c: number[]) => a + c[0], 0) / ring.length;
  const y = ring.reduce((a: number, c: number[]) => a + c[1], 0) / ring.length;
  const hit = COUNTRY_BOXES.find(([, b]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  return hit ? hit[0] : null;
}

/** Layer text that means "empty" (ArcGIS exports often carry the literal "<Null>"). */
const clean = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v).trim();
  return /^<?null>?$|^none$|^n\/a$|^-$/i.test(t) ? '' : t;
};
const pick = (p: Record<string, any>, ...names: string[]) => {
  const keys = Object.keys(p);
  for (const n of names) {
    const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
    if (k && clean(p[k])) return clean(p[k]);
  }
  return '';
};

/** Pure: features + key mapping + coded-value domains → rows to apply and the issues found. */
export function planImport(
  features: SourceFeature[], mapping: KeyMapping,
  domains: { site?: Map<string, string>; structure?: Map<string, string> } = {},
): { rows: PlanRow[]; issues: PlanIssues } {
  const issues: PlanIssues = {
    missingKeys: 0, noGeometry: 0, duplicates: [], notApplicable: 0, unknownStructure: [], noFarmCode: 0, noZone: 0, noZoneByCountry: {}, countryFromLocation: 0,
  };
  const seen = new Set<string>();
  const unknown = new Set<string>();
  const rows: PlanRow[] = [];
  const get = (p: Record<string, any>, role: keyof KeyMapping) => {
    const f = mapping[role];
    return f ? clean(p[f]) : '';
  };
  features.forEach((ft) => {
    const p = ft.properties || {};
    if (!polygonal(ft.geometry)) { issues.noGeometry += 1; return; }
    const oid = pick(p, 'OBJECTID', 'FID');
    const globalId = get(p, 'globalId') || pick(p, 'GlobalID') || null;

    // Zone: ZONE_ID, or one zone per country for features without it.
    let zone = get(p, 'zoneId').toUpperCase();
    let zoneName = zone;
    if (!zone) {
      let country = pick(p, 'Country');
      if (!country || country === '0') {
        country = countryFromShape(ft.geometry) || '';
        if (country) issues.countryFromLocation += 1;
      }
      const [code, name] = COUNTRY_ZONES[country] || NO_COUNTRY;
      zone = code; zoneName = name;
      issues.noZone += 1;
      issues.noZoneByCountry[name] = (issues.noZoneByCountry[name] || 0) + 1;
    }

    // Field key: Farm_Code, else Farm_Name, else ProjectCode, else OBJECTID.
    let farm = get(p, 'farmCode');
    let keySource: PlanRow['keySource'] = 'farm_code';
    if (!farm) {
      issues.noFarmCode += 1;
      const name = get(p, 'farmName');
      const prj = pick(p, 'ProjectCode');
      if (name) { farm = name; keySource = 'farm_name'; } else if (prj) { farm = prj; keySource = 'project_code'; } else if (oid) { farm = `OID${oid}`; keySource = 'object_id'; }
    }
    if (!farm) { issues.missingKeys += 1; return; }
    farm = farm.replace(/\s+/g, ' ');
    let key = fieldKey(zone, farm);
    if (seen.has(key)) {
      // Same key twice: keep both, the second one distinguished by its ProjectCode / OBJECTID.
      issues.duplicates.push(key);
      const tag = pick(p, 'ProjectCode') || (oid ? `OID${oid}` : String(seen.size));
      farm = `${farm}-${tag}`;
      key = fieldKey(zone, farm);
    }
    seen.add(key);

    const siteRaw = get(p, 'site');
    const siteLabel = domains.site?.get(siteRaw) || siteRaw;
    const siteCode = get(p, 'siteCode') || null;
    const unassigned = isNotApplicable(siteLabel) || (!siteLabel && !siteCode);
    if (unassigned) issues.notApplicable += 1;
    const siteName = unassigned ? 'Unassigned'
      : /^\d+$/.test(siteLabel) ? `Site ${siteLabel}` : (siteLabel || siteCode || 'Site');
    const siteKey = unassigned ? '__UNASSIGNED__' : (siteCode || siteName).toUpperCase();

    const stRaw = get(p, 'structureType');
    const structure = structureCode(stRaw, domains.structure);
    if (stRaw && structure === null) unknown.add(domains.structure?.get(stRaw) || stRaw);
    const areaName = structure !== null
      ? STRUCTURE_TYPES.find((t) => t.code === structure)!.name
      : (domains.structure?.get(stRaw) || stRaw || 'Other');

    rows.push({
      zone, zoneName, siteKey, siteName, siteCode: unassigned ? null : siteCode, unassigned, structure, areaName,
      farmCode: farm, key, keySource, name: get(p, 'farmName') || farm, globalId, geometry: ft.geometry,
    });
  });
  issues.unknownStructure = [...unknown];
  return { rows, issues };
}

export type ImportOptions = { dryRun?: boolean; overwrite?: boolean; buildParents?: boolean };
type Actor = { userId: string };

const count = () => ({ created: 0, matched: 0 });

/** Apply a plan in one transaction (rolled back for a dry run). */
export async function applyPlan(orgId: string, actor: Actor, plan: { rows: PlanRow[]; issues: PlanIssues }, opts: ImportOptions = {}) {
  const report = {
    dryRun: !!opts.dryRun,
    features: plan.rows.length,
    zones: count(), sites: count(), farmAreas: count(),
    fields: { created: 0, matched: 0, adopted: 0, moved: 0, rekeyed: 0 },
    shapes: { imported: 0, unchanged: 0, keptEdited: 0, repaired: 0 },
    parents: { farm_area: 0, site: 0, zone: 0 },
    bySubtype: {} as Record<string, { name: string; count: number }>,
    issues: plan.issues,
    overlaps: [] as string[],
  };
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const zoneIds = new Map<string, string>();
    const siteIds = new Map<string, string>();
    const areaIds = new Map<string, string>();
    const fieldTypes = new Map<string, string | null>();

    for (const r of plan.rows) {
      // eslint-disable-next-line no-await-in-loop
      const zoneId = await ensureZone(client, orgId, r.zone, r.zoneName, zoneIds, report);
      // eslint-disable-next-line no-await-in-loop
      const siteId = await ensureSite(client, orgId, zoneId, r, siteIds, report);
      // eslint-disable-next-line no-await-in-loop
      const areaId = await ensureArea(client, siteId, r, areaIds, report);
      // eslint-disable-next-line no-await-in-loop
      await upsertField(client, orgId, actor, zoneId, areaId, r, fieldTypes, report, opts);
      if (r.structure !== null) {
        const k = String(r.structure);
        report.bySubtype[k] = { name: r.areaName, count: (report.bySubtype[k]?.count || 0) + 1 };
      }
    }

    if (opts.buildParents) await buildParents(client, orgId, actor, report);
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return report;
}

async function ensureZone(c: PoolClient, orgId: string, zone: string, zoneName: string, cache: Map<string, string>, report: any) {
  if (cache.has(zone)) return cache.get(zone)!;
  const found = await c.query(
    `SELECT id, deleted_at FROM countries WHERE UPPER(code) = $1 AND (organization_id = $2 OR organization_id IS NULL)
      ORDER BY (organization_id IS NULL), deleted_at NULLS FIRST LIMIT 1`, [zone, orgId]);
  let id: string;
  if (found.rowCount) {
    id = found.rows[0].id;
    await c.query('UPDATE countries SET deleted_at = NULL, organization_id = COALESCE(organization_id, $2) WHERE id = $1', [id, orgId]);
    report.zones.matched += 1;
  } else {
    id = (await c.query('INSERT INTO countries (name, code, organization_id, subtype_code) VALUES ($1, $3, $2, 1) RETURNING id', [zoneName || zone, orgId, zone.slice(0, 10)])).rows[0].id;
    report.zones.created += 1;
  }
  cache.set(zone, id);
  return id;
}

async function ensureSite(c: PoolClient, orgId: string, zoneId: string, r: PlanRow, cache: Map<string, string>, report: any) {
  const ck = `${zoneId}|${r.siteKey}`;
  if (cache.has(ck)) return cache.get(ck)!;
  const found = await c.query(
    `SELECT id FROM sites WHERE country_id = $1
        AND (($2::text IS NOT NULL AND UPPER(gis_site_code) = UPPER($2)) OR LOWER(name) = LOWER($3))
      ORDER BY (deleted_at IS NOT NULL), (UPPER(gis_site_code) = UPPER($2)) DESC NULLS LAST LIMIT 1`,
    [zoneId, r.unassigned ? null : r.siteKey, r.siteName]);
  let id: string;
  if (found.rowCount) {
    id = found.rows[0].id;
    await c.query(
      `UPDATE sites SET deleted_at = NULL, organization_id = COALESCE(organization_id, $2),
              gis_site_code = COALESCE(gis_site_code, $3), subtype_code = COALESCE(subtype_code, $4) WHERE id = $1`,
      [id, orgId, r.unassigned ? null : r.siteKey, r.unassigned ? 9 : 1]);
    report.sites.matched += 1;
  } else {
    id = (await c.query(
      `INSERT INTO sites (country_id, name, organization_id, gis_site_code, subtype_code) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [zoneId, r.siteName, orgId, r.unassigned ? null : r.siteKey, r.unassigned ? 9 : 1])).rows[0].id;
    report.sites.created += 1;
  }
  cache.set(ck, id);
  return id;
}

async function ensureArea(c: PoolClient, siteId: string, r: PlanRow, cache: Map<string, string>, report: any) {
  const ck = `${siteId}|${r.structure ?? r.areaName}`;
  if (cache.has(ck)) return cache.get(ck)!;
  const found = await c.query(
    `SELECT id FROM farm_areas WHERE site_id = $1 AND (($2::smallint IS NOT NULL AND subtype_code = $2) OR LOWER(name) = LOWER($3))
      ORDER BY (deleted_at IS NOT NULL), (subtype_code = $2) DESC NULLS LAST LIMIT 1`,
    [siteId, r.structure, r.areaName]);
  let id: string;
  if (found.rowCount) {
    id = found.rows[0].id;
    await c.query('UPDATE farm_areas SET deleted_at = NULL, subtype_code = COALESCE(subtype_code, $2) WHERE id = $1', [id, r.structure]);
    report.farmAreas.matched += 1;
  } else {
    id = (await c.query('INSERT INTO farm_areas (site_id, name, subtype_code) VALUES ($1, $2, $3) RETURNING id', [siteId, r.areaName, r.structure])).rows[0].id;
    report.farmAreas.created += 1;
  }
  cache.set(ck, id);
  return id;
}

async function fieldTypeFor(c: PoolClient, name: string, cache: Map<string, string | null>) {
  if (cache.has(name)) return cache.get(name)!;
  const r = await c.query('SELECT id FROM field_types WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]).catch(() => ({ rows: [] as any[] }));
  const id = r.rows[0]?.id ?? null;
  cache.set(name, id);
  return id;
}

const GEOM_SQL = `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($GEOM), 4326)), 3))`;

async function upsertField(
  c: PoolClient, orgId: string, actor: Actor, zoneId: string, areaId: string, r: PlanRow,
  fieldTypes: Map<string, string | null>, report: any, opts: ImportOptions,
) {
  const gj = JSON.stringify(r.geometry);
  // 1. The feature's GlobalID (stable even when keys are edited in ArcGIS), then the relationship key.
  let row = r.globalId ? (await c.query(
    `SELECT id, farm_area_id, key_id, polygon IS NOT NULL AS has_shape, geom_source, polygon AS g
       FROM fields WHERE organization_id = $1 AND gis_external_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [orgId, r.globalId])).rows[0] : undefined;
  if (!row) row = (await c.query(
    `SELECT id, farm_area_id, key_id, polygon IS NOT NULL AS has_shape, geom_source, polygon AS g
       FROM fields WHERE organization_id = $1 AND UPPER(gis_zone_id) = $2 AND UPPER(gis_farm_code) = UPPER($3) AND deleted_at IS NULL LIMIT 1`,
    [orgId, r.zone, r.farmCode])).rows[0];
  let adopted = false;
  // 2. A field entered by hand in the same zone with the same name: adopt it, so its forms stay.
  if (!row) {
    row = (await c.query(
      `SELECT f.id, f.farm_area_id, f.key_id, f.polygon IS NOT NULL AS has_shape, f.geom_source, f.polygon AS g
         FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id JOIN sites s ON s.id = fa.site_id
        WHERE s.country_id = $1 AND f.deleted_at IS NULL AND f.gis_farm_code IS NULL
          AND (LOWER(f.name) = LOWER($2) OR LOWER(f.name) = LOWER($3)) LIMIT 1`,
      [zoneId, r.name, r.farmCode])).rows[0];
    adopted = !!row;
  }
  const typeId = await fieldTypeFor(c, r.areaName, fieldTypes);
  const valid = (await c.query('SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS v', [gj])).rows[0].v;
  if (!valid) report.shapes.repaired += 1;

  if (!row) {
    // Field names are unique per farm area: fall back to the farm code on a clash.
    const clash = (await c.query('SELECT 1 FROM fields WHERE farm_area_id = $1 AND LOWER(name) = LOWER($2)', [areaId, r.name])).rowCount;
    const ins = await c.query(
      `INSERT INTO fields (farm_area_id, name, organization_id, gis_zone_id, gis_farm_code, gis_site_code, gis_external_id,
                           subtype_code, field_type_id, polygon, geom_source, geom_updated_at, latitude, longitude, gis_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${GEOM_SQL.replace('$GEOM', '$10')}, 'arcgis', NOW(),
               ST_Y(ST_PointOnSurface(${GEOM_SQL.replace('$GEOM', '$10')})), ST_X(ST_PointOnSurface(${GEOM_SQL.replace('$GEOM', '$10')})), NOW())
       RETURNING id, key_id`,
      [areaId, (clash ? r.farmCode : r.name).slice(0, 100), orgId, r.zone, r.farmCode, r.siteCode, r.globalId, r.structure, typeId, gj]);
    await history(c, orgId, actor, ins.rows[0].id, ins.rows[0].key_id, null, gj, r);
    report.fields.created += 1;
    report.shapes.imported += 1;
    return;
  }

  if (adopted) report.fields.adopted += 1; else report.fields.matched += 1;
  if (row.farm_area_id !== areaId) {
    const clash = (await c.query('SELECT 1 FROM fields WHERE farm_area_id = $1 AND LOWER(name) = (SELECT LOWER(name) FROM fields WHERE id = $2) AND id <> $2', [areaId, row.id])).rowCount;
    if (!clash) { await c.query('UPDATE fields SET farm_area_id = $2 WHERE id = $1', [row.id, areaId]); report.fields.moved += 1; }
  }
  if (adopted && /-F\d{3}$/.test(row.key_id || '')) {
    // A field numbered by the system takes its ArcGIS KeyID (ZONE_ID-Farm_Code) once.
    const taken = (await c.query('SELECT 1 FROM fields WHERE organization_id = $1 AND key_id = $2 AND id <> $3', [orgId, r.key, row.id])).rowCount;
    if (!taken) {
      await c.query('UPDATE fields SET gis_zone_id = $2, gis_farm_code = $3, key_id = $4 WHERE id = $1', [row.id, r.zone, r.farmCode, r.key]);
      report.fields.rekeyed += 1;
    }
  }
  await c.query(
    `UPDATE fields SET gis_zone_id = $2, gis_farm_code = $3, gis_site_code = COALESCE($4, gis_site_code),
            gis_external_id = COALESCE($5, gis_external_id), subtype_code = COALESCE($6, subtype_code),
            field_type_id = COALESCE(field_type_id, $7), gis_synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [row.id, r.zone, r.farmCode, r.siteCode, r.globalId, r.structure, typeId]);
  // Shapes drawn or edited in AgroCloud win unless the import is told to replace them.
  if (row.has_shape && row.geom_source === 'agrocloud' && !opts.overwrite) { report.shapes.keptEdited += 1; return; }
  if (row.has_shape) {
    const same = (await c.query(`SELECT ST_Equals(polygon, ${GEOM_SQL.replace('$GEOM', '$2')}) AS eq FROM fields WHERE id = $1`, [row.id, gj])).rows[0]?.eq;
    if (same) { report.shapes.unchanged += 1; return; }
  }
  await c.query(
    `UPDATE fields SET polygon = ${GEOM_SQL.replace('$GEOM', '$2')}, geom_source = 'arcgis', geom_updated_at = NOW(),
            latitude = ST_Y(ST_PointOnSurface(${GEOM_SQL.replace('$GEOM', '$2')})), longitude = ST_X(ST_PointOnSurface(${GEOM_SQL.replace('$GEOM', '$2')}))
      WHERE id = $1`, [row.id, gj]);
  const key = (await c.query('SELECT key_id FROM fields WHERE id = $1', [row.id])).rows[0].key_id;
  await history(c, orgId, actor, row.id, key, row.g, gj, r);
  report.shapes.imported += 1;
}

async function history(c: PoolClient, orgId: string, actor: Actor, id: string, key: string | null, before: any, gj: string, r: PlanRow) {
  await c.query(
    `INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_before, geom_after, attrs, edited_by)
     VALUES ($1, 'field', $2, $3, 'import', $4, ${GEOM_SQL.replace('$GEOM', '$5')}, $6, $7)`,
    [orgId, id, key, before, gj, JSON.stringify({ source: 'arcgis', zone: r.zone, farm_code: r.farmCode, key_source: r.keySource, global_id: r.globalId, structure: r.structure }), actor.userId]);
}

const PARENT_STEPS = [
  { cls: 'farm_area', table: 'farm_areas', bufferM: 5, org: 'p.site_id IN (SELECT id FROM sites WHERE organization_id = $1)',
    kids: 'SELECT f.farm_area_id AS pid, f.polygon AS g FROM fields f WHERE f.deleted_at IS NULL AND f.polygon IS NOT NULL' },
  { cls: 'site', table: 'sites', bufferM: 15, org: 'p.organization_id = $1',
    kids: 'SELECT fa.site_id AS pid, fa.geom AS g FROM farm_areas fa WHERE fa.deleted_at IS NULL AND fa.geom IS NOT NULL' },
  { cls: 'zone', table: 'countries', bufferM: 30, org: 'p.organization_id = $1',
    kids: 'SELECT s.country_id AS pid, s.geom AS g FROM sites s WHERE s.deleted_at IS NULL AND s.geom IS NOT NULL' },
] as const;

/** Outline farm areas, sites and zones (empty, or earlier built by an import) around what lies inside them: the buffered union of their contents, so scattered places do not become one huge hull. */
async function buildParents(c: PoolClient, orgId: string, actor: Actor, report: any) {
  for (const s of PARENT_STEPS) {
    // eslint-disable-next-line no-await-in-loop
    const r = await c.query(
      `WITH kids AS (${s.kids}),
            outl AS (SELECT k.pid, ST_Multi(ST_CollectionExtract(ST_MakeValid(
                       ST_SimplifyPreserveTopology(ST_Union(ST_Buffer(k.g::geography, ${s.bufferM})::geometry), 0.00002)), 3)) AS g
                       FROM kids k GROUP BY k.pid),
            upd AS (UPDATE ${s.table} p SET geom = outl.g, geom_source = 'arcgis', geom_updated_at = NOW()
                      FROM outl WHERE p.id = outl.pid AND p.deleted_at IS NULL AND ${s.org}
                       AND (p.geom IS NULL OR p.geom_source = 'arcgis')
                    RETURNING p.id, p.key_id, p.geom)
       INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_after, attrs, edited_by)
       SELECT $1, '${s.cls}', id, key_id, 'import', geom, '{"source":"outline of contents"}'::jsonb, $2 FROM upd
       RETURNING key_id`,
      [orgId, actor.userId]);
    report.parents[s.cls] = r.rowCount || 0;
  }
  const ov = await c.query(
    `SELECT a.key_id || ' × ' || b.key_id AS pair FROM farm_areas a JOIN farm_areas b ON a.site_id = b.site_id AND a.id < b.id
      WHERE a.geom IS NOT NULL AND b.geom IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.site_id IN (SELECT id FROM sites WHERE organization_id = $1)
        AND ST_Intersects(a.geom, b.geom) AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > 1
     UNION ALL
     SELECT a.key_id || ' × ' || b.key_id FROM sites a JOIN sites b ON a.country_id = b.country_id AND a.id < b.id
      WHERE a.organization_id = $1 AND a.geom IS NOT NULL AND b.geom IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND ST_Intersects(a.geom, b.geom) AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > 1
     LIMIT 50`, [orgId]);
  report.overlaps = ov.rows.map((x: any) => x.pair);
}

function codedMap(layer: any, fieldName?: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!fieldName) return m;
  const f = (layer.fields || []).find((x: any) => x.name === fieldName);
  (f?.domain?.codedValues || []).forEach((cv: any) => m.set(String(cv.code), String(cv.name)));
  if (layer.typeIdField === fieldName) (layer.types || []).forEach((t: any) => m.set(String(t.id), String(t.name)));
  (layer.types || []).forEach((t: any) => {
    const d = t.domains?.[fieldName];
    (d?.codedValues || []).forEach((cv: any) => { if (!m.has(String(cv.code))) m.set(String(cv.code), String(cv.name)); });
  });
  return m;
}

/** Read the layer (the given link, or the organisation's saved ArcGIS connection) and import it. */
export async function importFromArcgis(orgId: string, actor: Actor, input: ImportOptions & { url?: string | null }) {
  let url = input.url?.trim() || '';
  let token: string | null = null;
  let savedMapping: KeyMapping | undefined;
  if (!url) {
    const saved = await dbPool.query(
      `SELECT source_url, layer_index, auth_token, attribute_mapping FROM gis_layers
        WHERE organization_id = $1 AND source_type = 'arcgis_feature_service' AND source_url IS NOT NULL
        ORDER BY last_synced_at DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1`, [orgId]);
    if (!saved.rowCount) throw new AppError('No ArcGIS layer is connected. Paste the layer link, or save it in GIS configuration.', 'VALIDATION_ERROR', 400);
    const s = saved.rows[0];
    url = s.layer_index !== null && !/\/\d+\/?$/.test(s.source_url) ? `${s.source_url.replace(/\/+$/, '')}/${s.layer_index}` : s.source_url;
    token = s.auth_token || null;
    savedMapping = s.attribute_mapping || undefined;
  }
  const { baseUrl, layerIndex } = parseFeatureServiceUrl(url);
  if (layerIndex === null) throw new AppError('Add the layer number at the end of the link, e.g. …/FeatureServer/21', 'VALIDATION_ERROR', 400);

  const layer = await fetchLayerJson(baseUrl, layerIndex, token);
  if (!/polygon/i.test(layer.geometryType || '')) throw new AppError(`The layer has ${layer.geometryType || 'no'} geometry; polygons are needed`, 'VALIDATION_ERROR', 400);
  const mapping = detectKeyFields(layer, savedMapping);
  if (!mapping.zoneId || !mapping.farmCode) throw new AppError('The layer has no ZONE_ID or Farm_Code field', 'VALIDATION_ERROR', 400);

  const fc = await queryFeatures(baseUrl, layerIndex, token);
  const plan = planImport(fc.features as SourceFeature[], mapping, {
    site: codedMap(layer, mapping.site), structure: codedMap(layer, mapping.structureType),
  });
  const report = await applyPlan(orgId, actor, plan, input);
  return { layer: { name: layer.name, id: layerIndex, url: `${baseUrl}/${layerIndex}`, source: 'live' }, mapping, ...report };
}
