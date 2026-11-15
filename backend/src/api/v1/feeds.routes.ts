import { Router, Response, NextFunction } from 'express';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import {
  parseFeedFile, feedRows, toCsv, toGeoJson, verifyFeedKey, listFeeds, saveFeedSettings,
  createFeedKey, revokeFeedKey, createArcgisTable, syncToArcgis, feedForm,
} from '../../services/formFeeds.service';

/**
 * Data paths for the forms.
 *   GET /feeds/<form>.csv|geojson|json   read-only, X-API-Key (a key of that form) or signed in
 *   GET /feeds                           settings, keys and counts (managers)
 *   PUT /feeds/:form                     ArcGIS table link, sync mode, staff names (CEO / operation manager)
 *   POST /feeds/:form/keys, DELETE /feeds/keys/:id
 *   POST /feeds/:form/arcgis-table, POST /feeds/:form/sync
 */
const feedsRouter = Router();
const managers = authorize('ceo', 'farm_manager', 'operation_manager');
const admins = authorize('ceo', 'operation_manager');

feedsRouter.get('/', auth, managers, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await listFeeds(requireOrgId(req)) });
}));

feedsRouter.put('/:form', auth, admins, asyncHandler(async (req: AuthRequest, res: Response) => {
  feedForm(req.params.form);
  const { arcgisTableUrl, syncMode, includeNames } = req.body || {};
  await saveFeedSettings(requireOrgId(req), req.params.form, { arcgisTableUrl, syncMode, includeNames });
  res.json({ success: true });
}));

feedsRouter.post('/:form/keys', auth, admins, asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = await createFeedKey(requireOrgId(req), req.params.form, req.user?.userId);
  res.status(201).json({ success: true, data: key });
}));

feedsRouter.delete('/keys/:id', auth, admins, asyncHandler(async (req: AuthRequest, res: Response) => {
  const n = await revokeFeedKey(requireOrgId(req), req.params.id);
  if (!n) throw new AppError('Key not found', 'NOT_FOUND', 404);
  res.json({ success: true });
}));

feedsRouter.post('/:form/arcgis-table', auth, admins, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.status(201).json({ success: true, data: await createArcgisTable(requireOrgId(req), req.params.form) });
}));

feedsRouter.post('/:form/sync', auth, admins, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await syncToArcgis(requireOrgId(req), req.params.form) });
}));

/** A form key opens only that form; without a key the caller must be signed in. */
const feedAccess = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { form } = parseFeedFile(req.params.file);
  const raw = req.headers['x-api-key'];
  if (typeof raw === 'string' && raw) {
    const orgId = await verifyFeedKey(raw, form);
    if (!orgId) throw new AppError('This key is not valid for this form', 'UNAUTHORIZED', 401);
    req.organizationId = orgId;
    (req as any).feedByKey = true;
    return next();
  }
  return auth(req, res, (err?: any) => (err ? next(err) : managers(req, res, next)));
});

feedsRouter.get('/:file', feedAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { form, format } = parseFeedFile(req.params.file);
  const orgId = (req as any).feedByKey ? req.organizationId! : requireOrgId(req);
  const s = await listFeedNames(orgId, form);
  const q = {
    keyid: typeof req.query.keyid === 'string' ? req.query.keyid : undefined,
    since: typeof req.query.since === 'string' ? req.query.since : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    includeNames: s,
    withGeometry: format === 'geojson',
  };
  const { rows, cols } = await feedRows(orgId, form, q);
  res.setHeader('Cache-Control', 'no-store');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${form}.csv"`);
    res.send(toCsv(rows, cols));
  } else if (format === 'geojson') {
    res.setHeader('Content-Type', 'application/geo+json');
    res.send(JSON.stringify(toGeoJson(rows, cols)));
  } else {
    res.json({ form, count: rows.length, records: rows.map(({ __geom, ...r }) => r) });
  }
}));

async function listFeedNames(orgId: string, form: string): Promise<boolean> {
  const r = await dbPool.query('SELECT include_names FROM form_feeds WHERE organization_id = $1 AND form = $2', [orgId, form]);
  return !!r.rows[0]?.include_names;
}

export { feedsRouter };
