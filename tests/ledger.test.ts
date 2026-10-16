import { describe, expect, test } from 'vitest';
import {
  OwnershipType,
  Transaction,
  TransactionScope as Scope,
  TransactionSide as Side,
  Unit,
} from '../src/types/types';
import { computeDashboardMetrics, recomputeUnitTotals } from '../src/utils/utils';
import { allocateMoney, businessDate, paise, reconcileVendorLedger } from '../src/utils/ledger';
import {
  validateTransaction,
  validateUnit,
  assertMoney,
} from '../src/validation/financeValidation';
const unit = (id = 'u1', extras: Partial<Unit> = {}): Unit => ({
  id,
  tower: 'C',
  flatNumber: id,
  floor: 4,
  bhk: '2BHK',
  carpetAreaSqFt: 80,
  saleableAreaSqFt: 100,
  ratePerSqFt: 1,
  amenitiesCost: 0,
  adjustments: 0,
  agreedPrice: 100,
  buyerName: 'Buyer',
  buyerPhone: '',
  ownershipType: OwnershipType.Developer,
  isSold: true,
  isSettled: false,
  ...extras,
});
const tx = (side: Side, extras: Partial<Transaction> = {}): Transaction => ({
  id: crypto.randomUUID(),
  side,
  amount: 100,
  date: '2026-10-16',
  scope: Scope.ProjectWide,
  vendorName: 'Acme',
  isSettled: true,
  ...extras,
});

test('project payment pays a unit invoice without doubling cost', () => {
  const units = [unit(), unit('u2')];
  const transactions = [
    tx(Side.VendorInvoice, { id: 'i', scope: Scope.PerUnit, unitId: 'u1' }),
    tx(Side.VendorPayment),
  ];
  const totals = recomputeUnitTotals(units, transactions),
    metrics = computeDashboardMetrics(units, totals, transactions);
  expect(totals.u1.economic.totalCost).toBe(100);
  expect(totals.u2.economic.totalCost).toBe(0);
  expect(metrics.developer.cost).toBe(100);
  expect(metrics.engineering.totalCost).toBe(100);
  expect(metrics.developer.vendorPayable).toBe(0);
  expect(reconcileVendorLedger(transactions).invoiceOutstanding.i).toBe(0);
});
test('pending cash never reduces receivables or invoices; invoice flag does not settle it', () => {
  const units = [unit()];
  const transactions = [
    tx(Side.BuyerReceipt, { unitId: 'u1', scope: Scope.PerUnit, isSettled: false }),
    tx(Side.VendorInvoice, { id: 'i', isSettled: true }),
    tx(Side.VendorPayment, { isSettled: false }),
  ];
  const totals = recomputeUnitTotals(units, transactions),
    metrics = computeDashboardMetrics(units, totals, transactions);
  expect(totals.u1.buyerBalanceDue).toBe(100);
  expect(metrics.developer.buyerCollections).toBe(0);
  expect(metrics.developer.vendorPaid).toBe(0);
  expect(metrics.developer.vendorPayable).toBe(100);
  expect(metrics.developer.cost).toBe(100);
});
test('partial explicit payments settle their invoice before automatic FIFO payments', () => {
  const transactions = [
    tx(Side.VendorInvoice, { id: 'old', date: '2026-09-01' }),
    tx(Side.VendorInvoice, { id: 'new' }),
    tx(Side.VendorPayment, { amount: 125, invoiceId: 'new' }),
    tx(Side.VendorPayment, { amount: 20 }),
  ];
  const ledger = reconcileVendorLedger(transactions);
  expect(ledger.invoiceOutstanding).toEqual({ old: 80, new: 0 });
  expect(ledger.total).toEqual({
    invoiced: 200,
    paid: 145,
    payable: 80,
    advance: 25,
    costExposure: 225,
  });
});
test('different vendors do not offset each other, including prototype-like names', () => {
  const ledger = reconcileVendorLedger([
    tx(Side.VendorInvoice, { vendorName: '__proto__' }),
    tx(Side.VendorPayment, { vendorName: 'other' }),
  ]);
  expect(ledger.total.payable).toBe(100);
  expect(ledger.total.advance).toBe(100);
  expect(ledger.total.costExposure).toBe(200);
});
test('buyer overpayment is visible as credit, and settled status is derived', () => {
  const units = [unit()],
    totals = recomputeUnitTotals(units, [
      tx(Side.BuyerReceipt, { scope: Scope.PerUnit, unitId: 'u1', amount: 120 }),
    ]);
  expect(totals.u1.buyerBalanceDue).toBe(0);
  expect(totals.u1.buyerCredit).toBe(20);
  expect(computeDashboardMetrics(units, totals, []).developer.settledUnits).toBe(1);
});
test('landowner receipt is cash only when cleared', () => {
  const units = [unit('owner', { ownershipType: OwnershipType.Landowner, isSold: false })];
  const totals = recomputeUnitTotals(units, [
    tx(Side.LandownerReimbursable, { scope: Scope.PerUnit, unitId: 'owner' }),
    tx(Side.LandownerReimbursableReceipt, {
      scope: Scope.PerUnit,
      unitId: 'owner',
      isSettled: false,
    }),
  ]);
  expect(totals.owner.reimbursableDue).toBe(100);
});
test('empty and landowner-only projects retain unallocated developer costs', () => {
  for (const units of [
    [],
    [unit('owner', { ownershipType: OwnershipType.Landowner, isSold: false })],
  ]) {
    const transactions = [tx(Side.VendorInvoice)],
      totals = recomputeUnitTotals(units, transactions),
      metrics = computeDashboardMetrics(units, totals, transactions);
    expect(metrics.developer.cost).toBe(100);
    expect(metrics.developer.unallocatedCost).toBe(100);
    expect(metrics.engineering.totalCost).toBe(100);
  }
});
test('allocation preserves paise, even zero-area pools and one-paisa costs', () => {
  expect(
    allocateMoney(
      [
        { id: 'a', weight: 0 },
        { id: 'b', weight: 0 },
        { id: 'c', weight: 0 },
      ],
      0.01,
    ),
  ).toEqual({ a: 0.01, b: 0, c: 0 });
  for (let n = 1; n <= 25; n++) {
    const units = Array.from({ length: n }, (_, i) =>
      unit(String(i), { saleableAreaSqFt: i * 0.13 }),
    );
    const transactions = [
      tx(Side.VendorInvoice, { amount: 103.07 }),
      tx(Side.VendorPayment, { amount: 51.02 }),
    ];
    const totals = Object.values(recomputeUnitTotals(units, transactions));
    expect(totals.reduce((sum, u) => sum + paise(u.economic.totalCost), 0)).toBe(10307);
    expect(totals.reduce((sum, u) => sum + paise(u.economic.vendorPayable), 0)).toBe(5205);
    for (const u of totals)
      expect(paise(u.economic.totalCost)).toBe(
        paise(u.economic.allocatedPayments) + paise(u.economic.vendorPayable),
      );
  }
});
test('date defaults use India business date, not UTC', () =>
  expect(businessDate(new Date('2026-10-15T19:00:00Z'))).toBe('2026-10-16'));
describe('validation', () => {
  test.each([NaN, Infinity, -1, 0, 0.001, 1000000000000])('rejects invalid amount %s', (value) =>
    expect(() => assertMoney(value)).toThrow(),
  );
  test('requires sold developer unit for buyer receipts', () =>
    expect(() =>
      validateTransaction(tx(Side.BuyerReceipt, { unitId: 'u1', scope: Scope.PerUnit }), [
        unit('u1', { isSold: false }),
      ]),
    ).toThrow('sold developer'));
  test('validates calendar dates and floor', () => {
    expect(() => validateTransaction(tx(Side.VendorInvoice, { date: '2026-02-30' }), [])).toThrow(
      'invalid',
    );
    expect(() => validateUnit(unit('u1', { floor: 2.5 }))).toThrow('whole number');
  });
});
