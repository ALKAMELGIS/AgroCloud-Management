import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertCanManageSite, assertCanManageZone } from './zoneAccess.service';

/**
 * The system's own geodatabase: zones, sites, farm areas and fields are drawn
 * and edited in AgroCloud. PostGIS is the judge of every saved shape:
 *   - the shape must be valid,
 *   - it must lie inside its parent (when the parent has a shape), with a 5 m margin,
 *   - it must not overlap a sibling of the same level (more than 1 m²).
 * Every change is written to geo_edit_history. KeyIDs are assigned by the
 * database (migration 178) and never change.
 */

export type GeoClass = 'zone' | 'site' | 'farm_area' | 'field';
type Actor = { userId: string; role: string };

const TABLE: Record<GeoClass, { table: string; geom: string }> = {
  zone: { table: 'countries', geom: 'geom' },
  site: { table: 'sites', geom: 'geom' },
  farm_area: { table: 'farm_areas', geom: 'geom' },
  field: { table: 'fields', geom: 'polygon' },
};

const MARGIN_M = 5;     // tolerance for "inside the parent"
const MIN_OVERLAP_M2 = 1;

export function isGeoClass(v: string): v is GeoClass {
  return v === 'zone' || v === 'site' || v === 'farm_area' || v === 'field';
}

/** Subtypes and domains: the lists every editor and form reads. */
export async function getModel() {
  const [subtypes, domains, values] = await Promise.all([
    dbPool.query(`SELECT class_key, code, name_en, name_ar, key_prefix, fill_color, line_color, sort_order
                    FROM geo_subtypes WHERE active ORDER BY class_key, sort_order, code`),
    dbPool.query('SELECT key, name_en, name_ar, kind, min_value, max_value, unit FROM geo_domains ORDER BY key'),
    dbPool.query(`SELECT domain_key, code, name_en, name_ar, sort_order
                    FROM geo_domain_values WHERE active ORDER BY domain_key, sort_order, code`),
  ]);
  return {
    subtypes: subtypes.rows,
    domains: domains.rows.map((d: any) => ({ ...d, values: values.rows.filter((v: any) => v.domain_key === d.key) })),
  };
}

const ITEM_COLS = (alias: string, geom: string) => `
  ${alias}.id, ${alias}.name, ${alias}.key_id, ${alias}.subtype_code, ${alias}.geom_updated_at,
  CASE WHEN ${alias}.${geom} IS NULL THEN NULL ELSE ST_AsGeoJSON(${alias}.${geom}, 7)::json END AS geometry,
  CASE WHEN ${alias}.${geom} IS NULL THEN NULL ELSE ROUND((ST_Area(${alias}.${geom}::geography) / 10000)::numeric, 4) END AS area_ha`;

/** Every zone, site, farm area and field of the organisation, with its shape (or null). */
export async function getLayers(orgId: string) {
  const [zones, sites, areas, fields] = await Promise.all([
    dbPool.query(`SELECT ${ITEM_COLS('c', 'geom')}, NULL::uuid AS parent_id
                    FROM countries c WHERE c.organization_id = $1 AND c.deleted_at IS NULL ORDER BY c.name`, [orgId]),
    dbPool.query(`SELECT ${ITEM_COLS('s', 'geom')}, s.country_id AS parent_id
                    FROM sites s WHERE s.organization_id = $1 AND s.deleted_at IS NULL ORDER BY s.name`, [orgId]),
    dbPool.query(`SELECT ${ITEM_COLS('fa', 'geom')}, fa.site_id AS parent_id
                    FROM farm_areas fa JOIN sites s ON s.id = fa.site_id
                   WHERE s.organization_id = $1 AND fa.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY fa.name`, [orgId]),
    dbPool.query(`SELECT ${ITEM_COLS('f', 'polygon')}, f.farm_area_id AS parent_id
                    FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id JOIN sites s ON s.id = fa.site_id
                   WHERE s.organization_id = $1 AND f.deleted_at IS NULL AND fa.deleted_at IS NULL ORDER BY f.name`, [orgId]),
  ]);
  return { zones: zones.rows, sites: sites.rows, farm_areas: areas.rows, fields: fields.rows };
}

/** Parent row (class, id) of a feature and the site that decides who may edit it. */
async function scopeOf(orgId: string, cls: GeoClass, id: string) {
  if (cls === 'zone') {
    const r = await dbPool.query('SELECT id FROM countries WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, orgId]);
    if (!r.rowCount) throw new NotFoundError('Zone not found');
    return { zoneId: id, siteId: null as string | null, parent: null as null | { cls: GeoClass; id: string } };
  }
  if (cls === 'site') {
    const r = await dbPool.query('SELECT country_id FROM sites WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, orgId]);
    if (!r.rowCount) throw new NotFoundError('Site not found');
    return { zoneId: r.rows[0].country_id, siteId: id, parent: { cls: 'zone' as GeoClass, id: r.rows[0].country_id } };
  }
  if (cls === 'farm_area') {
    const r = await dbPool.query(`SELECT fa.site_id, s.country_id FROM farm_areas fa JOIN sites s ON s.id = fa.site_id
                                   WHERE fa.id = $1 AND s.organization_id = $2 AND fa.deleted_at IS NULL`, [id, orgId]);
    if (!r.rowCount) throw new NotFoundError('Farm area not found');
    return { zoneId: r.rows[0].country_id, siteId: r.rows[0].site_id, parent: { cls: 'site' as GeoClass, id: r.rows[0].site_id } };
  }
  const r = await dbPool.query(`SELECT f.farm_area_id, fa.site_id, s.country_id FROM fields f
                                  JOIN farm_areas fa ON fa.id = f.farm_area_id JOIN sites s ON s.id = fa.site_id
                                 WHERE f.id = $1 AND s.organization_id = $2 AND f.deleted_at IS NULL`, [id, orgId]);
  if (!r.rowCount) throw new NotFoundError('Field not found');
  return { zoneId: r.rows[0].country_id, siteId: r.rows[0].site_id, parent: { cls: 'farm_area' as GeoClass, id: r.rows[0].farm_area_id } };
}

async function assertCanEdit(actor: Actor, orgId: string, scope: { zoneId: string; siteId: string | null }) {
  if (scope.siteId) await assertCanManageSite(actor, scope.siteId, orgId);
  else await assertCanManageZone(actor, scope.zoneId, orgId);
}

/** Siblings that share a parent, for the overlap rule. Fields are compared within their whole site. */
function siblingsSql(cls: GeoClass): string {
  switch (cls) {
    case 'zone': return `SELECT id, key_id, geom AS g FROM countries WHERE organization_id = $2 AND deleted_at IS NULL AND id <> $3`;
    case 'site': return `SELECT id, key_id, geom AS g FROM sites WHERE country_id = (SELECT country_id FROM sites WHERE id = $3) AND deleted_at IS NULL AND id <> $3`;
    case 'farm_area': return `SELECT id, key_id, geom AS g FROM farm_areas WHERE site_id = (SELECT site_id FROM farm_areas WHERE id = $3) AND deleted_at IS NULL AND id <> $3`;
    default: return `SELECT f.id, f.key_id, f.polygon AS g FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id
                     WHERE fa.site_id = (SELECT fa2.site_id FROM fields f2 JOIN farm_areas fa2 ON fa2.id = f2.farm_area_id WHERE f2.id = $3)
                       AND f.deleted_at IS NULL AND f.id <> $3`;
  }
}

export type GeoIssue = { code: 'invalid' | 'too_small' | 'outside_parent' | 'overlap'; message: string; keys?: string[]; area_m2?: number };

/**
 * Check a shape against the rules without saving it (the editor calls this
 * while drawing), or as the first step of a save.
 */
export async function validateGeometry(orgId: string, cls: GeoClass, id: string, geometry: unknown): Promise<{ ok: boolean; issues: GeoIssue[]; area_ha: number | null }> {
  const scope = await scopeOf(orgId, cls, id);
  const gj = JSON.stringify(geometry);
  const base = await dbPool.query(
    `WITH g AS (SELECT ST_Multi(ST_CollectionExtract(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 3)) AS g)
     SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason, ST_Area(g::geography) AS area_m2 FROM g`,
    [gj],
  ).catch(() => { throw new AppError('The shape could not be read. Draw it again or upload GeoJSON, KML or Shapefile.', 'VALIDATION_ERROR', 400); });
  const issues: GeoIssue[] = [];
  const { valid, reason, area_m2: area } = base.rows[0];
  if (!valid) issues.push({ code: 'invalid', message: `The shape crosses itself or is broken (${reason}).` });
  if (!area || area < 1) issues.push({ code: 'too_small', message: 'The shape has no area.' });

  if (valid && area >= 1) {
    if (scope.parent) {
      const p = TABLE[scope.parent.cls];
      const out = await dbPool.query(
        `WITH g AS (SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g),
              p AS (SELECT ${p.geom} AS pg, key_id FROM ${p.table} WHERE id = $2)
         SELECT p.key_id, CASE WHEN p.pg IS NULL THEN NULL
                ELSE ST_Area(ST_Difference(g.g, ST_Buffer(p.pg::geography, ${MARGIN_M})::geometry)::geography) END AS outside_m2
           FROM g, p`,
        [gj, scope.parent.id],
      );
      const o = out.rows[0];
      if (o && o.outside_m2 !== null && Number(o.outside_m2) > MIN_OVERLAP_M2) {
        issues.push({ code: 'outside_parent', message: `${Math.round(Number(o.outside_m2))} m² lies outside ${o.key_id || 'its parent'}.`, keys: o.key_id ? [o.key_id] : [], area_m2: Number(o.outside_m2) });
      }
    }
    const ov = await dbPool.query(
      `WITH g AS (SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g, $2::uuid AS org),
            sib AS (${siblingsSql(cls)})
       SELECT sib.key_id, ST_Area(ST_Intersection(g.g, sib.g)::geography) AS m2
         FROM g, sib WHERE sib.g IS NOT NULL AND ST_Intersects(g.g, sib.g)`,
      [gj, orgId, id],
    );
    const hits = ov.rows.filter((r: any) => Number(r.m2) > MIN_OVERLAP_M2);
    if (hits.length) {
      issues.push({
        code: 'overlap',
        message: `Overlaps ${hits.map((h: any) => `${h.key_id || 'another shape'} (${Math.round(Number(h.m2))} m²)`).join(', ')}.`,
        keys: hits.map((h: any) => h.key_id).filter(Boolean),
        area_m2: hits.reduce((s: number, h: any) => s + Number(h.m2), 0),
      });
    }
  }
  return { ok: issues.length === 0, issues, area_ha: area ? Math.round((area / 10000) * 10000) / 10000 : null };
}

async function readItem(cls: GeoClass, id: string) {
  const t = TABLE[cls];
  const r = await dbPool.query(`SELECT ${ITEM_COLS('x', t.geom)} FROM ${t.table} x WHERE x.id = $1`, [id]);
  return r.rows[0];
}

/** Save a drawn or edited shape (and optionally its subtype). Rejects shapes that break a rule. */
export async function saveGeometry(orgId: string, actor: Actor, cls: GeoClass, id: string, geometry: unknown, opts: { subtypeCode?: number | null; operation?: string } = {}) {
  const scope = await scopeOf(orgId, cls, id);
  await assertCanEdit(actor, orgId, scope);
  const check = await validateGeometry(orgId, cls, id, geometry);
  if (!check.ok) throw new AppError(check.issues.map((i) => i.message).join(' '), 'GEOMETRY_RULE', 422, { issues: check.issues });

  const t = TABLE[cls];
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT ${t.geom} AS g, key_id FROM ${t.table} WHERE id = $1 FOR UPDATE`, [id]);
    const extra = cls === 'field'
      ? ', latitude = ST_Y(ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))), longitude = ST_X(ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)))'
      : '';
    await client.query(
      `UPDATE ${t.table} SET ${t.geom} = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)),
              geom_updated_at = NOW(), updated_at = NOW()
              ${opts.subtypeCode !== undefined ? ', subtype_code = $3' : ''}${extra}
        WHERE id = $2`,
      opts.subtypeCode !== undefined ? [JSON.stringify(geometry), id, opts.subtypeCode] : [JSON.stringify(geometry), id],
    );
    await client.query(
      `INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_before, geom_after, attrs, edited_by)
       VALUES ($1, $2, $3, $4, $5, $6, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)), $8, $9)`,
      [orgId, cls, id, before.rows[0]?.key_id ?? null, opts.operation || (before.rows[0]?.g ? 'edit' : 'draw'),
        before.rows[0]?.g ?? null, JSON.stringify(geometry), JSON.stringify({ subtype_code: opts.subtypeCode ?? null }), actor.userId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return readItem(cls, id);
}

/** Remove a shape (the record and its forms stay). */
export async function deleteGeometry(orgId: string, actor: Actor, cls: GeoClass, id: string) {
  const scope = await scopeOf(orgId, cls, id);
  await assertCanEdit(actor, orgId, scope);
  const t = TABLE[cls];
  await dbPool.query(
    `INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_before, edited_by)
     SELECT $1, $2, id, key_id, 'delete', ${t.geom}, $4 FROM ${t.table} WHERE id = $3`,
    [orgId, cls, id, actor.userId],
  );
  await dbPool.query(`UPDATE ${t.table} SET ${t.geom} = NULL, geom_updated_at = NOW() WHERE id = $1`, [id]);
  return readItem(cls, id);
}

/** Change only the subtype. */
export async function setSubtype(orgId: string, actor: Actor, cls: GeoClass, id: string, code: number | null) {
  const scope = await scopeOf(orgId, cls, id);
  await assertCanEdit(actor, orgId, scope);
  if (code !== null) {
    const ok = await dbPool.query('SELECT 1 FROM geo_subtypes WHERE class_key = $1 AND code = $2 AND active', [cls, code]);
    if (!ok.rowCount) throw new AppError('Unknown subtype', 'VALIDATION_ERROR', 400);
  }
  await dbPool.query(`UPDATE ${TABLE[cls].table} SET subtype_code = $2, updated_at = NOW() WHERE id = $1`, [id, code]);
  await dbPool.query(
    `INSERT INTO geo_edit_history (organization_id, class_key, feature_id, operation, attrs, edited_by)
     VALUES ($1, $2, $3, 'subtype', $4, $5)`,
    [orgId, cls, id, JSON.stringify({ subtype_code: code }), actor.userId],
  );
  return readItem(cls, id);
}

/** Past versions of a shape, newest first. */
export async function history(orgId: string, cls: GeoClass, id: string) {
  await scopeOf(orgId, cls, id);
  const r = await dbPool.query(
    `SELECT h.id, h.operation, h.key_id, h.edited_at, u.name AS edited_by_name,
            CASE WHEN h.geom_after IS NULL THEN NULL ELSE ROUND((ST_Area(h.geom_after::geography) / 10000)::numeric, 4) END AS area_ha
       FROM geo_edit_history h LEFT JOIN users u ON u.id = h.edited_by
      WHERE h.class_key = $1 AND h.feature_id = $2
      ORDER BY h.edited_at DESC LIMIT 100`,
    [cls, id],
  );
  return r.rows;
}

/* ---- One-time import from the linked ArcGIS layer ------------------------------
 * Copies the synced shapes of linked ArcGIS features (gis_features.linked_field_id)
 * into the fields, so AgroCloud owns them from then on. Optionally builds outlines
 * for farm areas, sites and zones that have no shape yet from what lies inside them.
 * Runs in one transaction; a dry run rolls it back and only reports.
 */
type ImportOpts = { dryRun?: boolean; overwrite?: boolean; buildParents?: boolean };

/** Structure type text (or coded value label) → field subtype code. */
export function subtypeFromStructure(v: unknown): number | null {
  const s = String(v ?? '').toLowerCase();
  if (!s) return null;
  if (/pivot/.test(s)) return 4;
  if (/nurs/.test(s)) return 5;
  if (/net|shade/.test(s)) return 2;
  if (/open|field|outdoor/.test(s)) return 3;
  if (/green|glass|tunnel|poly|cravo/.test(s)) return 1;
  return null;
}

const PARENT_STEPS: Array<{ cls: GeoClass; table: string; child: string; key: string; bufferM: number }> = [
  { cls: 'farm_area', table: 'farm_areas', child: `SELECT f.farm_area_id AS pid, f.polygon AS g FROM fields f WHERE f.deleted_at IS NULL AND f.polygon IS NOT NULL`, key: 'farm_area_id', bufferM: 3 },
  { cls: 'site', table: 'sites', child: `SELECT fa.site_id AS pid, fa.geom AS g FROM farm_areas fa WHERE fa.deleted_at IS NULL AND fa.geom IS NOT NULL`, key: 'site_id', bufferM: 10 },
  { cls: 'zone', table: 'countries', child: `SELECT s.country_id AS pid, s.geom AS g FROM sites s WHERE s.deleted_at IS NULL AND s.geom IS NOT NULL`, key: 'country_id', bufferM: 20 },
];

export async function importFromLinkedLayer(orgId: string, actor: Actor, opts: ImportOpts = {}) {
  const client = await dbPool.connect();
  const report = {
    dryRun: !!opts.dryRun, candidates: 0, imported: 0, skippedExisting: 0, repaired: 0,
    bySubtype: {} as Record<string, number>, parents: { farm_area: 0, site: 0, zone: 0 }, overlaps: [] as string[],
  };
  try {
    await client.query('BEGIN');
    // One shape per linked field: the most recently synced polygonal feature.
    const cand = await client.query(
      `SELECT DISTINCT ON (f.id) f.id AS field_id, f.key_id, (f.polygon IS NOT NULL) AS has_shape,
              ST_IsValid(g.geometry) AS valid,
              g.properties ->> COALESCE(l.attribute_mapping ->> 'structureType', 'Structure_Type') AS structure
         FROM gis_features g
         JOIN gis_layers l ON l.id = g.layer_id
         JOIN fields f ON f.id = g.linked_field_id AND f.deleted_at IS NULL
         JOIN farm_areas fa ON fa.id = f.farm_area_id JOIN sites s ON s.id = fa.site_id
        WHERE s.organization_id = $1 AND GeometryType(g.geometry) IN ('POLYGON', 'MULTIPOLYGON')
        ORDER BY f.id, g.updated_at DESC NULLS LAST`,
      [orgId],
    );
    report.candidates = cand.rowCount || 0;
    for (const c of cand.rows) {
      if (c.has_shape && !opts.overwrite) { report.skippedExisting += 1; continue; }
      if (!c.valid) report.repaired += 1;
      const code = subtypeFromStructure(c.structure);
      report.bySubtype[code ?? 'none'] = (report.bySubtype[code ?? 'none'] || 0) + 1;
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `WITH src AS (
           SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(g.geometry), 3)) AS g
             FROM gis_features g WHERE g.linked_field_id = $1 AND GeometryType(g.geometry) IN ('POLYGON', 'MULTIPOLYGON')
            ORDER BY g.updated_at DESC NULLS LAST LIMIT 1),
         old AS (SELECT polygon FROM fields WHERE id = $1),
         h AS (INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_before, geom_after, attrs, edited_by)
               SELECT $2, 'field', $1, $3, 'import', old.polygon, src.g, $4, $5 FROM src, old)
         UPDATE fields f SET polygon = src.g, geom_updated_at = NOW(), updated_at = NOW(),
                subtype_code = COALESCE($6, f.subtype_code),
                latitude = ST_Y(ST_PointOnSurface(src.g)), longitude = ST_X(ST_PointOnSurface(src.g))
           FROM src WHERE f.id = $1`,
        [c.field_id, orgId, c.key_id, JSON.stringify({ source: 'arcgis', structure: c.structure ?? null }), actor.userId, code],
      );
      report.imported += 1;
    }

    if (opts.buildParents) {
      for (const step of PARENT_STEPS) {
        const orgFilter = step.cls === 'zone' ? 'p.organization_id = $1'
          : step.cls === 'site' ? 'p.organization_id = $1'
            : 'p.site_id IN (SELECT id FROM sites WHERE organization_id = $1)';
        // eslint-disable-next-line no-await-in-loop
        const r = await client.query(
          `WITH kids AS (${step.child}),
                outl AS (
                  SELECT k.pid, ST_Multi(ST_CollectionExtract(ST_MakeValid(
                           ST_Buffer(ST_ConvexHull(ST_Collect(k.g))::geography, ${step.bufferM})::geometry), 3)) AS g
                    FROM kids k GROUP BY k.pid),
                upd AS (
                  UPDATE ${step.table} p SET geom = outl.g, geom_updated_at = NOW()
                    FROM outl WHERE p.id = outl.pid AND p.geom IS NULL AND p.deleted_at IS NULL AND ${orgFilter}
                  RETURNING p.id, p.key_id, p.geom)
           INSERT INTO geo_edit_history (organization_id, class_key, feature_id, key_id, operation, geom_after, attrs, edited_by)
           SELECT $1, '${step.cls}', id, key_id, 'import', geom, '{"source":"built from contents"}'::jsonb, $2 FROM upd
           RETURNING key_id`,
          [orgId, actor.userId],
        );
        report.parents[step.cls as 'farm_area' | 'site' | 'zone'] = r.rowCount || 0;
      }
      // Outlines built from hulls can overlap a neighbour: list them so they can be fixed in the editor.
      const ov = await client.query(
        `SELECT a.key_id || ' × ' || b.key_id AS pair FROM farm_areas a JOIN farm_areas b ON a.site_id = b.site_id AND a.id < b.id
          WHERE a.geom IS NOT NULL AND b.geom IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
            AND a.site_id IN (SELECT id FROM sites WHERE organization_id = $1)
            AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > ${MIN_OVERLAP_M2}
         UNION ALL
         SELECT a.key_id || ' × ' || b.key_id FROM sites a JOIN sites b ON a.country_id = b.country_id AND a.id < b.id
          WHERE a.organization_id = $1 AND a.geom IS NOT NULL AND b.geom IS NOT NULL AND a.deleted_at IS NULL AND b.deleted_at IS NULL
            AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > ${MIN_OVERLAP_M2}
         LIMIT 50`,
        [orgId],
      );
      report.overlaps = ov.rows.map((x: any) => x.pair);
    }
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return report;
}
