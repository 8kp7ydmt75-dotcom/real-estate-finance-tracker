import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('../src/services/supabaseClient', () => ({ isDemoMode: true, getSupabaseClient: vi.fn() }));
let service: typeof import('../src/services/dataService');
beforeEach(async () => {
  vi.resetModules();
  service = await import('../src/services/dataService');
});
test('demo projects are isolated, including counts and new records', async () => {
  const old = (await service.fetchAllProjects())[0];
  const p = await service.createProject({ name: 'Second', code: 'SECOND' });
  expect(await service.fetchUnits(p.id)).toHaveLength(0);
  expect(await service.fetchTransactions(p.id)).toHaveLength(0);
  const units = await service.fetchUnits(old.id);
  expect(units.length).toBeGreaterThan(0);
  const copy = await service.createUnit(p.id, {
    ...units[0],
    id: undefined,
    version: undefined,
  } as never);
  expect(await service.fetchUnits(p.id)).toHaveLength(1);
  expect(await service.fetchUnits(old.id)).toHaveLength(units.length);
  expect(copy.floor).toBe(units[0].floor);
  expect((await service.fetchProjectStats([p.id]))[p.id].unitCount).toBe(1);
});
test('floor and negotiated price are in persisted payload', async () => {
  const u = (await service.fetchUnits('demo-heights'))[0];
  expect(
    service.buildUnitPayload('demo-heights', { ...u, floor: 4, agreedPrice: 99 }),
  ).toMatchObject({ floor_no: 4, agreed_price: 99 });
});
test('partial notes edit preserves work package/due date and supports explicit clearing', async () => {
  const { TransactionSide, TransactionScope, WorkPackage } = await import('../src/types/types');
  const t = await service.createTransaction('demo-heights', {
    side: TransactionSide.VendorInvoice,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Test',
    amount: 10,
    date: '2026-10-16',
    dueDate: '2026-10-20',
    workPackage: WorkPackage.Other,
    description: 'old',
    isSettled: false,
  });
  const edited = await service.updateTransaction('demo-heights', t.id!, {
    description: 'new',
    version: t.version,
  });
  expect(edited).toMatchObject({
    dueDate: '2026-10-20',
    workPackage: WorkPackage.Other,
    description: 'new',
  });
  const cleared = await service.updateTransaction('demo-heights', t.id!, {
    dueDate: undefined,
    description: '',
    version: edited.version,
  });
  expect(cleared.dueDate).toBeUndefined();
  expect(cleared.description).toBe('');
  await expect(
    service.updateTransaction('demo-heights', t.id!, { amount: 12, version: t.version }),
  ).rejects.toThrow('another session');
});
test('demo retries are idempotent and unit history is preserved', async () => {
  const { TransactionSide, TransactionScope } = await import('../src/types/types');
  const input = {
    side: TransactionSide.BuyerReceipt,
    scope: TransactionScope.PerUnit,
    unitId: 'demo-a101',
    amount: 10,
    date: '2026-10-16',
    isSettled: true,
    requestId: crypto.randomUUID(),
  };
  const t = await service.createTransaction('demo-heights', input);
  const retry = await service.createTransaction('demo-heights', input);
  expect(retry.id).toBe(t.id);
  await expect(service.deleteUnit('demo-heights', 'demo-a101', 'test', 1)).rejects.toThrow(
    'financial history',
  );
  await service.deleteTransaction('demo-heights', t.id!, 'test', t.version!);
  await expect(service.createTransaction('demo-heights', input)).rejects.toThrow('already voided');
  await expect(service.deleteUnit('demo-heights', 'demo-a101', 'test', 1)).rejects.toThrow(
    'financial history',
  );
});
