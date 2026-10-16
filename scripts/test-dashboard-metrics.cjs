const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-dashboard-tests');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}\n');

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    '--ignoreConfig',
    'src/utils/utils.ts',
    'src/types/types.ts',
    '--module',
    'commonjs',
    '--target',
    'ES2022',
    '--outDir',
    outDir,
    '--skipLibCheck',
    '--esModuleInterop',
  ],
  { cwd: root, stdio: 'pipe' },
);

const { recomputeUnitTotals, computeDashboardMetrics } = require(
  path.join(outDir, 'utils/utils.js'),
);
const { OwnershipType, TransactionScope, TransactionSide } = require(
  path.join(outDir, 'types/types.js'),
);

const makeUnit = (overrides = {}) => ({
  id: 'A201',
  tower: 'A',
  flatNumber: '201',
  floor: 2,
  bhk: '2BHK',
  carpetAreaSqFt: 1411,
  saleableAreaSqFt: 1201,
  ratePerSqFt: 4500,
  amenitiesCost: 300000,
  adjustments: 0,
  agreedPrice: 5704500,
  buyerName: 'Sample Buyer',
  buyerPhone: '',
  ownershipType: OwnershipType.Developer,
  isSold: true,
  isSettled: false,
  ...overrides,
});

const units = [
  makeUnit(),
  makeUnit({
    id: 'A202',
    flatNumber: '202',
    carpetAreaSqFt: 1120,
    saleableAreaSqFt: 1011,
    ratePerSqFt: 0,
    amenitiesCost: 0,
    agreedPrice: 0,
    buyerName: '',
    isSold: false,
  }),
  makeUnit({
    id: 'B202',
    tower: 'B',
    flatNumber: '202',
    carpetAreaSqFt: 1120,
    saleableAreaSqFt: 1011,
    ratePerSqFt: 0,
    amenitiesCost: 0,
    agreedPrice: 0,
    buyerName: '',
    isSold: false,
  }),
];

const transactions = [
  {
    side: TransactionSide.BuyerReceipt,
    scope: TransactionScope.PerUnit,
    unitId: 'A201',
    amount: 2000000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Joythi Hardware',
    amount: 3500000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'sand',
    amount: 200000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Masonry',
    amount: 5200000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Plumber',
    amount: 2300000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorInvoice,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Painter',
    amount: 1000000,
    date: '2026-04-24',
    isSettled: false,
  },
];

const unitTotals = recomputeUnitTotals(units, transactions);
const metrics = computeDashboardMetrics(units, unitTotals, transactions);

assert.equal(
  unitTotals.A201.agreedPrice,
  5704500,
  'agreed price should use sale value, not buyer receipts',
);
assert.equal(
  unitTotals.A201.buyerReceipts,
  2000000,
  'buyer receipts should stay separate from revenue',
);
assert.equal(
  unitTotals.A201.buyerBalanceDue,
  3704500,
  'buyer receivable should be sale value minus receipts',
);
assert.equal(
  Math.round(unitTotals.A201.economic.allocatedProjectCost),
  4546137,
  'unit cost allocation should use total built-up area',
);
assert.equal(
  metrics.developer.revenue,
  5704500,
  'developer revenue should be agreed sale value of sold units',
);
assert.equal(
  metrics.developer.buyerCollections,
  2000000,
  'collections should be tracked separately',
);
assert.equal(
  metrics.developer.vendorPaid,
  11200000,
  'vendor paid should total completed vendor payments',
);
assert.equal(
  metrics.developer.vendorInvoiced,
  1000000,
  'vendor invoiced should include pending invoices',
);
assert.equal(
  metrics.developer.vendorPayable,
  1000000,
  'pending invoices should remain payable when the same vendor has not been paid',
);
assert.equal(
  metrics.developer.vendorAdvance,
  11200000,
  'payments to other vendors should not offset a different vendor invoice',
);
assert.equal(
  metrics.developer.cost,
  12200000,
  'cost exposure should include paid vendors plus unpaid vendor invoices',
);
assert.equal(
  metrics.developer.profit,
  -6495500,
  'profit should be agreed sales minus cost exposure',
);
assert.equal(
  metrics.engineering.totalCost,
  12200000,
  'engineering cost should include paid vendors plus unpaid vendor invoices',
);
assert.equal(
  metrics.developer.saleableArea,
  3223,
  'developer dashboard area should use total built-up area',
);
assert.equal(
  metrics.engineering.totalArea,
  3223,
  'engineering dashboard area should use all-units total built-up area',
);
assert.equal(
  Math.round(metrics.engineering.costPerSqFt),
  3785,
  'engineering cost per sq ft should use total built-up area',
);

const matchedTransactions = [
  {
    side: TransactionSide.VendorInvoice,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Painter',
    amount: 1000000,
    date: '2026-04-24',
    isSettled: false,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'Painter',
    amount: 400000,
    date: '2026-04-24',
    isSettled: true,
  },
  {
    side: TransactionSide.VendorPayment,
    scope: TransactionScope.ProjectWide,
    vendorName: 'sand',
    amount: 200000,
    date: '2026-04-24',
    isSettled: true,
  },
];

const matchedTotals = recomputeUnitTotals(units, matchedTransactions);
const matchedMetrics = computeDashboardMetrics(units, matchedTotals, matchedTransactions);

assert.equal(
  matchedMetrics.developer.vendorPayable,
  600000,
  'payments should reduce only the matching vendor payable',
);
assert.equal(
  matchedMetrics.developer.vendorAdvance,
  200000,
  'overpayments/no-invoice payments should remain advance by vendor',
);
assert.equal(
  matchedMetrics.developer.cost,
  1200000,
  'cost exposure should be paid amount plus remaining vendor payable by vendor',
);

fs.rmSync(outDir, { recursive: true, force: true });
console.log('Dashboard metric regression tests passed.');
