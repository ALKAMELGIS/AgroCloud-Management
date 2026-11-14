import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import * as geo from '../../services/geoEditor.service';

/**
 * /api/v1/geo — the map editor for zones, sites, farm areas and fields.
 * Reading is open to managers and agronomists; writing follows the Zones &
 * Sites rules (CEO everywhere, farm manager in assigned zones), checked in the service.
 */
export const geoRouter = Router();
geoRouter.use(auth);

const requireReader = authorize('ceo', 'operation_manager', 'farm_manager', 'agronomist', 'pest_agronomist');
const requireWriter = authorize('ceo', 'farm_manager');

const classParam = (raw: string): geo.GeoClass => {
  if (!geo.isGeoClass(raw)) throw new AppError('Unknown layer', 'VALIDATION_ERROR', 400);
  return raw;
};
const actorOf = (req: AuthRequest) => ({ userId: req.user!.userId, role: req.user!.role });

const geometrySchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.any()).min(1),
});

geoRouter.get('/model', requireReader, asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await geo.getModel() });
}));

geoRouter.get('/layers', requireReader, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await geo.getLayers(requireOrgId(req)) });
}));

geoRouter.post('/:cls/:id/validate', requireReader, validate({ body: z.object({ geometry: geometrySchema }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await geo.validateGeometry(requireOrgId(req), classParam(req.params.cls), req.params.id, req.body.geometry);
    res.json({ success: true, data });
  }));

geoRouter.put('/:cls/:id/geometry', requireWriter,
  validate({ body: z.object({ geometry: geometrySchema, subtypeCode: z.number().int().nullable().optional(), operation: z.enum(['draw', 'edit', 'import']).optional() }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await geo.saveGeometry(requireOrgId(req), actorOf(req), classParam(req.params.cls), req.params.id, req.body.geometry,
      { subtypeCode: req.body.subtypeCode, operation: req.body.operation });
    res.json({ success: true, data });
  }));

geoRouter.delete('/:cls/:id/geometry', requireWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await geo.deleteGeometry(requireOrgId(req), actorOf(req), classParam(req.params.cls), req.params.id) });
}));

geoRouter.patch('/:cls/:id/subtype', requireWriter, validate({ body: z.object({ subtypeCode: z.number().int().nullable() }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json({ success: true, data: await geo.setSubtype(requireOrgId(req), actorOf(req), classParam(req.params.cls), req.params.id, req.body.subtypeCode) });
  }));

geoRouter.get('/:cls/:id/history', requireReader, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await geo.history(requireOrgId(req), classParam(req.params.cls), req.params.id) });
}));
