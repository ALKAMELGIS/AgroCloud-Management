import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { parseCsvAsObjects } from '../../utils/csv';
import { logAuditEvent } from '../../services/auditLog.service';
import { requireOrgId } from '../middleware/tenant';
import { canEditIpmCatalog, canCreatePesticideApplication, canApprovePesticideApplication } from '../../utils/ipmAccess';
import { TARGETS, TargetKey, TargetSpec, listTargets } from '../../services/import/targets';
import { runImport, Mapping, Row } from '../../services/import/importer';

/*
 * Import from Excel (the page reads the workbook in the browser and sends rows
 * here as JSON; CSV upload stays for API use). The importer lives in
 * services/import; this file only checks who may import what.
 */

export const historicalImportRouter = Router();
historicalImportRouter.use(auth);

type Actor = { userId: string; email: string; role: any };
const FIELD_FORMS = ['operation_manager', 'worker', 'agronomist'];

/** Which targets a person may import into, by the same rules as the forms themselves. */
export function allowedTargets(user: Actor): TargetKey[] {
  const out: TargetKey[] = [];
  if (FIELD_FORMS.includes(user.role)) out.push('harvests', 'ecph_full', 'ecph', 'fertigation');
  // Past sprays are stored approved: only someone who may both record and approve them.
  if (canCreatePesticideApplication(user) && canApprovePesticideApplication(user)) out.push('pesticide_applications');
  if (canEditIpmCatalog(user)) out.push('pesticide_products');
  return out;
}

function actor(req: AuthRequest): Actor {
  return { userId: req.user!.userId, email: req.user!.email, role: req.user!.role };
}

historicalImportRouter.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!allowedTargets(actor(req)).length) return next(new AppError('Import is not open to your role', 'FORBIDDEN', 403));
  next();
});

function targetFor(req: AuthRequest, key: string): TargetSpec {
  const target = TARGETS[key as TargetKey];
  if (!target) throw new AppError(`Unknown import: ${key}`, 'BAD_TARGET', 400);
  if (!allowedTargets(actor(req)).includes(target.key)) throw new AppError(`Your role cannot import ${target.label}`, 'FORBIDDEN', 403);
  return target;
}

function checkMapping(target: TargetSpec, mapping: Mapping) {
  const missing = target.fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (missing.length) throw new AppError(`Pick a column for: ${missing.join(', ')}`, 'MISSING_MAPPING', 400);
}

async function execute(req: AuthRequest, res: Response, rows: Row[], headers: string[], target: TargetSpec, mapping: Mapping, dryRun: boolean, fileName: string) {
  checkMapping(target, mapping);
  const options = (req.body?.options && typeof req.body.options === 'object') ? req.body.options : {};
  const result = await runImport({
    rows, headers, target, mapping, dryRun, fileName, options,
    orgId: requireOrgId(req), userId: req.user!.userId,
  });
  if (!dryRun) {
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'IMPORT',
      entity: 'report',
      entityId: 'excel-import',
      changes: { target: target.key, fileName, rows: rows.length, inserted: result.stats.toInsert, alreadyInSystem: result.stats.skipped, duplicatesInFile: result.stats.duplicatesInFile, errors: result.stats.errorCount },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
  res.json({ success: true, data: result });
}

/** GET /imports/targets — what this person may import */
historicalImportRouter.get('/targets', asyncHandler(async (req: AuthRequest, res: Response) => {
  const allowed = allowedTargets(actor(req));
  res.json({ success: true, data: listTargets().filter((t) => allowed.includes(t.key)) });
}));

/** POST /imports/execute-json — rows read in the browser; dryRun true checks without writing */
historicalImportRouter.post('/execute-json', asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || !rows.length) throw new AppError('rows array is required', 'NO_ROWS', 400);
  if (rows.length > 5000) throw new AppError('Send at most 5,000 rows per request', 'TOO_MANY_ROWS', 400);
  const target = targetFor(req, String(req.body.target || ''));
  const stringRows: Row[] = rows.map((r: Record<string, unknown>) => {
    const o: Row = {};
    Object.entries(r || {}).forEach(([k, v]) => { o[k] = v == null ? '' : String(v); });
    return o;
  });
  const headers = [...new Set(stringRows.flatMap((r) => Object.keys(r)))];
  const dryRun = req.body.dryRun !== false && String(req.body.dryRun ?? 'true') !== 'false';
  await execute(req, res, stringRows, headers, target, req.body.mapping || {}, dryRun, String(req.body.fileName || 'workbook.xlsx'));
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/** POST /imports/execute — CSV upload (API use): file, target, mapping (JSON), dryRun */
historicalImportRouter.post('/execute', upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new AppError('CSV file is required', 'NO_FILE', 400);
  const target = targetFor(req, String(req.body.target || ''));
  let mapping: Mapping = {};
  try {
    mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : (req.body.mapping || {});
  } catch {
    throw new AppError('mapping must be valid JSON', 'BAD_MAPPING', 400);
  }
  const { headers, rows } = parseCsvAsObjects(req.file.buffer.toString('utf8').replace(/^﻿/, ''));
  const dryRun = String(req.body.dryRun ?? 'true') !== 'false';
  await execute(req, res, rows, headers, target, mapping, dryRun, req.file.originalname);
}));
