import { planLimitMessage } from '../plan.service';

jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn() } }));

describe('planLimitMessage', () => {
  test('reads the trigger message', () => {
    expect(planLimitMessage('PLAN_LIMIT:fields:25')).toMatchObject({ kind: 'fields', limit: 25 });
    expect(planLimitMessage('PLAN_LIMIT:users:10')?.message).toMatch(/10 active users/);
  });
  test('ignores other errors', () => {
    expect(planLimitMessage('duplicate key')).toBeNull();
  });
});
