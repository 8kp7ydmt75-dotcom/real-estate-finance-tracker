import { allocateMoney, money, reconcileVendorLedger } from './ledger';
import {
  OwnershipType,
  Transaction,
  TransactionScope,
  TransactionSide,
  Unit,
  UnitFinancials,
} from '../types/types';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getUnitCode = (unit: Pick<Unit, 'tower' | 'flatNumber'>) =>
  `${unit.tower ?? ''}${unit.flatNumber ?? ''}`;

// Totals are keyed by UUID when a row has been saved. The display code fallback
// keeps local/new unit objects usable before Supabase assigns an id.
export const getUnitKey = (unit: Unit) => unit.id ?? getUnitCode(unit);

const getTotalBuiltUpArea = (unit: Unit) => unit.saleableAreaSqFt ?? unit.carpetAreaSqFt ?? 0;

type VendorLedgerSummary = {
  invoiced: number;
  paid: number;
  payable: number;
  advance: number;
  costExposure: number;
};

const emptyVendorLedgerSummary = (): VendorLedgerSummary => ({
  invoiced: 0,
  paid: 0,
  payable: 0,
  advance: 0,
  costExposure: 0,
});

const summarizeVendorLedger = (transactions: Transaction[]) =>
  reconcileVendorLedger(transactions).total;

export const computeProjectTotals = (units: Unit[], transactions: Transaction[]) => {
  const developerUnits = units.filter((u) => u.ownershipType === OwnershipType.Developer);
  const totalDevArea = developerUnits.reduce((sum, unit) => sum + getTotalBuiltUpArea(unit), 0);
  const totalAllArea = units.reduce((sum, unit) => sum + getTotalBuiltUpArea(unit), 0);

  let projectWideInvoices = 0;
  let projectWidePayments = 0;
  let totalVendorInvoices = 0;
  let totalVendorPayments = 0;
  let totalReimbursable = 0;
  let totalReimbursableReceipts = 0;

  const perUnitInvoices: Record<string, number> = {};
  const perUnitPayments: Record<string, number> = {};
  const buyerReceipts: Record<string, number> = {};
  const reimbursableByUnit: Record<string, number> = {};
  const reimbursableReceiptsByUnit: Record<string, number> = {};

  const ledger = reconcileVendorLedger(transactions);
  const perUnitVendorPayable: Record<string, number> = Object.create(null);
  const perUnitVendorAdvance: Record<string, number> = Object.create(null);
  const perUnitVendorCostExposure: Record<string, number> = Object.create(null);
  Object.entries(ledger.buckets).forEach(([key, bucket]) => {
    if (key === 'project') {
      projectWideInvoices = bucket.invoiced;
      projectWidePayments = bucket.paid;
    } else {
      perUnitInvoices[key] = bucket.invoiced;
      perUnitPayments[key] = bucket.paid;
      perUnitVendorPayable[key] = bucket.payable;
      perUnitVendorAdvance[key] = bucket.advance;
      perUnitVendorCostExposure[key] = bucket.costExposure;
    }
  });
  totalVendorInvoices = ledger.total.invoiced;
  totalVendorPayments = ledger.total.paid;
  transactions.forEach((t) => {
    const key = t.unitId;
    if (t.side === TransactionSide.BuyerReceipt && t.isSettled && key) {
      buyerReceipts[key] = money((buyerReceipts[key] || 0) + t.amount);
    }
    if (t.side === TransactionSide.LandownerReimbursable && key) {
      totalReimbursable = money(totalReimbursable + t.amount);
      reimbursableByUnit[key] = money((reimbursableByUnit[key] || 0) + t.amount);
    }
    if (t.side === TransactionSide.LandownerReimbursableReceipt && t.isSettled && key) {
      totalReimbursableReceipts = money(totalReimbursableReceipts + t.amount);
      reimbursableReceiptsByUnit[key] = money((reimbursableReceiptsByUnit[key] || 0) + t.amount);
    }
  });
  const projectWideVendorSummary = ledger.buckets.project || emptyVendorLedgerSummary();
  const totalVendorSummary = ledger.total;

  const landownerPerUnitInvoices = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitInvoices[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitPayments = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitPayments[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorPayable = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitVendorPayable[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorAdvance = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitVendorAdvance[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorCostExposure = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitVendorCostExposure[getUnitKey(unit)] || 0), 0);

  return {
    developerUnits,
    totalDevArea,
    totalAllArea,
    projectWideInvoices,
    projectWidePayments,
    totalVendorInvoices,
    totalVendorPayments,
    perUnitInvoices,
    perUnitPayments,
    buyerReceipts,
    landownerPerUnitInvoices,
    landownerPerUnitPayments,
    landownerPerUnitVendorPayable,
    landownerPerUnitVendorAdvance,
    landownerPerUnitVendorCostExposure,
    reimbursableByUnit,
    reimbursableReceiptsByUnit,
    totalReimbursable,
    totalReimbursableReceipts,
    perUnitVendorPayable,
    perUnitVendorAdvance,
    perUnitVendorCostExposure,
    projectWideVendorPayable: projectWideVendorSummary.payable,
    projectWideVendorAdvance: projectWideVendorSummary.advance,
    projectWideVendorCostExposure: projectWideVendorSummary.costExposure,
    totalVendorPayable: totalVendorSummary.payable,
    totalVendorAdvance: totalVendorSummary.advance,
    totalVendorCostExposure: totalVendorSummary.costExposure,
  };
};

const allocateByArea = (units: Unit[], _totalArea: number, poolAmount: number) =>
  allocateMoney(
    units.map((unit) => ({ id: getUnitKey(unit), weight: getTotalBuiltUpArea(unit) })),
    poolAmount,
  );

const allocateLedger = (units: Unit[], invoiced: number, payable: number, advance: number) => {
  const invoices = allocateByArea(units, 0, invoiced);
  const payableAllocation = allocateMoney(
    units.map((u) => ({ id: getUnitKey(u), weight: invoices[getUnitKey(u)] })),
    payable,
  );
  const advanceAllocation = allocateByArea(units, 0, advance);
  const cost: Record<string, number> = Object.create(null);
  const payments: Record<string, number> = Object.create(null);
  for (const u of units) {
    const id = getUnitKey(u);
    cost[id] = money(invoices[id] + advanceAllocation[id]);
    payments[id] = money(cost[id] - payableAllocation[id]);
  }
  return { invoices, cost, payments, payable: payableAllocation, advance: advanceAllocation };
};
export const allocateCostDeveloperView = (
  _units: Unit[],
  t: ReturnType<typeof computeProjectTotals>,
) =>
  allocateLedger(
    t.developerUnits,
    money(t.projectWideInvoices + t.landownerPerUnitInvoices),
    money(t.projectWideVendorPayable + t.landownerPerUnitVendorPayable),
    money(t.projectWideVendorAdvance + t.landownerPerUnitVendorAdvance),
  );
export const allocateCostEngineeringView = (
  units: Unit[],
  t: ReturnType<typeof computeProjectTotals>,
) =>
  allocateLedger(
    units,
    t.projectWideInvoices,
    t.projectWideVendorPayable,
    t.projectWideVendorAdvance,
  );

export const recomputeUnitTotals = (
  units: Unit[],
  transactions: Transaction[],
): Record<string, UnitFinancials> => {
  const projectTotals = computeProjectTotals(units, transactions);
  const developerAllocations = allocateCostDeveloperView(units, projectTotals);
  const engineeringAllocations = allocateCostEngineeringView(units, projectTotals);
  const totals: Record<string, UnitFinancials> = {};

  units.forEach((unit) => {
    const unitKey = getUnitKey(unit);
    const computedAgreedPrice =
      unit.saleableAreaSqFt * unit.ratePerSqFt + unit.amenitiesCost + unit.adjustments;
    const agreedPrice = unit.agreedPrice ?? computedAgreedPrice;
    const unitBuyerReceipts =
      unit.ownershipType === OwnershipType.Developer
        ? projectTotals.buyerReceipts[unitKey] || 0
        : 0;
    const unitRevenue =
      unit.ownershipType === OwnershipType.Developer && unit.isSold ? agreedPrice : 0;
    const buyerBalanceDue =
      unit.ownershipType === OwnershipType.Developer && unit.isSold
        ? Math.max(0, agreedPrice - unitBuyerReceipts)
        : 0;

    const developerPerUnitPayments =
      unit.ownershipType === OwnershipType.Developer
        ? projectTotals.perUnitPayments[unitKey] || 0
        : 0;
    const engineeringPerUnitPayments = projectTotals.perUnitPayments[unitKey] || 0;
    const developerPerUnitPayable =
      unit.ownershipType === OwnershipType.Developer
        ? projectTotals.perUnitVendorPayable[unitKey] || 0
        : 0;
    const developerPerUnitAdvance =
      unit.ownershipType === OwnershipType.Developer
        ? projectTotals.perUnitVendorAdvance[unitKey] || 0
        : 0;
    const developerPerUnitCostExposure =
      unit.ownershipType === OwnershipType.Developer
        ? projectTotals.perUnitVendorCostExposure[unitKey] || 0
        : 0;
    const engineeringPerUnitPayable = projectTotals.perUnitVendorPayable[unitKey] || 0;
    const engineeringPerUnitAdvance = projectTotals.perUnitVendorAdvance[unitKey] || 0;
    const engineeringPerUnitCostExposure = projectTotals.perUnitVendorCostExposure[unitKey] || 0;

    const economicAllocatedCost =
      unit.ownershipType === OwnershipType.Developer ? developerAllocations.cost[unitKey] || 0 : 0;
    const economicAllocatedPayments =
      unit.ownershipType === OwnershipType.Developer
        ? developerAllocations.payments[unitKey] || 0
        : 0;
    const economicAllocatedPayable =
      unit.ownershipType === OwnershipType.Developer
        ? developerAllocations.payable[unitKey] || 0
        : 0;
    const economicAllocatedAdvance =
      unit.ownershipType === OwnershipType.Developer
        ? developerAllocations.advance[unitKey] || 0
        : 0;
    const engineeringAllocatedCost = engineeringAllocations.cost[unitKey] || 0;
    const engineeringAllocatedPayments = engineeringAllocations.payments[unitKey] || 0;
    const engineeringAllocatedPayable = engineeringAllocations.payable[unitKey] || 0;
    const engineeringAllocatedAdvance = engineeringAllocations.advance[unitKey] || 0;

    const economicTotalCost = economicAllocatedCost + developerPerUnitCostExposure;
    const economicVendorPayable = economicAllocatedPayable + developerPerUnitPayable;
    const economicVendorAdvance = economicAllocatedAdvance + developerPerUnitAdvance;
    const engineeringTotalCost = engineeringAllocatedCost + engineeringPerUnitCostExposure;
    const engineeringVendorPayable = engineeringAllocatedPayable + engineeringPerUnitPayable;
    const engineeringVendorAdvance = engineeringAllocatedAdvance + engineeringPerUnitAdvance;

    const reimbursableIncurred = projectTotals.reimbursableByUnit[unitKey] || 0;
    const reimbursableRecovered = projectTotals.reimbursableReceiptsByUnit[unitKey] || 0;

    const status: UnitFinancials['status'] =
      unit.ownershipType === OwnershipType.Landowner
        ? 'Landowner'
        : unit.isSold
          ? 'Sold'
          : 'Unsold';

    totals[unitKey] = {
      agreedPrice,
      buyerReceipts: unitBuyerReceipts,
      buyerBalanceDue: money(buyerBalanceDue),
      buyerCredit: money(Math.max(0, unitBuyerReceipts - unitRevenue)),
      unitRevenue,
      status,
      reimbursableDue: Math.max(0, reimbursableIncurred - reimbursableRecovered),
      economic: {
        allocatedProjectCost: economicAllocatedCost,
        perUnitCost: developerPerUnitCostExposure,
        totalCost: economicTotalCost,
        allocatedPayments: economicAllocatedPayments,
        directPayments: developerPerUnitPayments,
        vendorPayable: economicVendorPayable,
        vendorAdvance: economicVendorAdvance,
      },
      engineering: {
        allocatedProjectCost: engineeringAllocatedCost,
        perUnitCost: engineeringPerUnitCostExposure,
        totalCost: engineeringTotalCost,
        allocatedPayments: engineeringAllocatedPayments,
        directPayments: engineeringPerUnitPayments,
        vendorPayable: engineeringVendorPayable,
        vendorAdvance: engineeringVendorAdvance,
      },
    };
  });

  return totals;
};

export const computeDashboardMetrics = (
  units: Unit[],
  unitTotals: Record<string, UnitFinancials>,
  transactions: Transaction[],
) => {
  const developerUnits = units.filter((u) => u.ownershipType === OwnershipType.Developer);
  const totalDevBuiltUpArea = developerUnits.reduce((sum, u) => sum + getTotalBuiltUpArea(u), 0);
  const totalAllBuiltUpArea = units.reduce((sum, u) => sum + getTotalBuiltUpArea(u), 0);

  const developerRevenue = developerUnits.reduce(
    (sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.unitRevenue || 0),
    0,
  );
  const vendorSummary = summarizeVendorLedger(transactions);
  const developerCost = vendorSummary.costExposure;
  const developerProfit = developerRevenue - developerCost;
  const buyerReceivable = developerUnits.reduce(
    (sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.buyerBalanceDue || 0),
    0,
  );
  const buyerCollections = transactions
    .filter((t) => t.side === TransactionSide.BuyerReceipt && t.isSettled)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalEngineeringCost = vendorSummary.costExposure;
  const engineeringCostPerSqFt =
    totalAllBuiltUpArea > 0 ? totalEngineeringCost / totalAllBuiltUpArea : 0;

  const soldDeveloperUnits = developerUnits.filter((u) => u.isSold).length;
  const settledDeveloperUnits = developerUnits.filter(
    (u) => u.isSold && (unitTotals[getUnitKey(u)]?.buyerBalanceDue ?? 1) === 0,
  ).length;
  const landownerOwesBuilder = units
    .filter((u) => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.reimbursableDue || 0), 0);

  const engineeringCostByTower: Record<string, number> = {};
  units.forEach((unit) => {
    const towerCost = unitTotals[getUnitKey(unit)]?.engineering.totalCost || 0;
    engineeringCostByTower[unit.tower] = (engineeringCostByTower[unit.tower] || 0) + towerCost;
  });

  return {
    developer: {
      buyerReceivable: money(buyerReceivable),
      buyerCredit: money(Object.values(unitTotals).reduce((sum, u) => sum + u.buyerCredit, 0)),
      unallocatedCost: money(
        developerCost - Object.values(unitTotals).reduce((sum, u) => sum + u.economic.totalCost, 0),
      ),
      buyerCollections,
      vendorPayable: vendorSummary.payable,
      vendorAdvance: vendorSummary.advance,
      vendorPaid: vendorSummary.paid,
      vendorInvoiced: vendorSummary.invoiced,
      revenue: developerRevenue,
      cost: developerCost,
      profit: developerProfit,
      marginPerSqFt: totalDevBuiltUpArea > 0 ? developerProfit / totalDevBuiltUpArea : 0,
      saleableArea: totalDevBuiltUpArea,
      totalUnits: developerUnits.length,
      soldUnits: soldDeveloperUnits,
      settledUnits: settledDeveloperUnits,
      landownerOwesBuilder,
    },
    engineering: {
      totalCost: totalEngineeringCost,
      unallocatedCost: money(
        totalEngineeringCost -
          Object.values(unitTotals).reduce((sum, u) => sum + u.engineering.totalCost, 0),
      ),
      costPerSqFt: engineeringCostPerSqFt,
      totalArea: totalAllBuiltUpArea,
      byTower: engineeringCostByTower,
      totalUnits: units.length,
    },
  };
};

export const getUniqueVendors = (transactions: Transaction[]): string[] => {
  const vendors = new Set<string>();
  transactions.forEach((t) => {
    if (t.vendorName) vendors.add(t.vendorName);
  });
  return Array.from(vendors);
};
