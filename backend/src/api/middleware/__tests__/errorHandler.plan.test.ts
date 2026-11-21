import { errorHandler } from '../errorHandler';

jest.mock('../../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../../db/client', () => ({ dbPool: { query: jest.fn() } }));

function mockRes() {
  const res: any = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

test('a plan limit from the database becomes 403 PLAN_LIMIT', () => {
  const res = mockRes();
  const err = Object.assign(new Error('PLAN_LIMIT:sites:1'), { code: 'P0001' });
  errorHandler(err, { url: '/x', method: 'POST' } as any, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json.mock.calls[0][0].error).toMatchObject({ code: 'PLAN_LIMIT', details: { kind: 'sites', limit: 1 } });
});
