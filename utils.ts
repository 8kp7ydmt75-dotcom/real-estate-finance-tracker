import { OwnershipType, Transaction, TransactionScope, TransactionSide, Unit, UnitFinancials } from './types';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

export const getUnitCode = (unit: Pick<Unit, 'tower' | 'flatNumber'>) =>
  `${unit.tower ?? ''}${unit.flatNumber ?? ''}`;

// Totals are keyed by UUID when a row has been saved. The display code fallback
// keeps local/new unit objects usable before Supabase assigns an id.
export const getUnitKey = (unit: Unit) => unit.id ?? getUnitCode(unit);

const resolveScope = (transaction: Transaction): TransactionScope => {
  if (transaction.scope) return transaction.scope;
  return transaction.side === TransactionSide.BuyerReceipt ? TransactionScope.PerUnit : TransactionScope.ProjectWide;
};

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
  costExposure: 0
});

const isVendorTransaction = (transaction: Transaction) =>
  transaction.side === TransactionSide.VendorInvoice || transaction.side === TransactionSide.VendorPayment;

const getVendorLedgerKey = (transaction: Transaction) => {
  const label = transaction.vendorName?.trim() || transaction.description?.trim() || 'Unassigned vendor';
  return label.toLocaleLowerCase();
};

const summarizeVendorLedger = (transactions: Transaction[]): VendorLedgerSummary => {
  const byVendor: Record<string, { invoiced: number; paid: number }> = {};

  transactions.filter(isVendorTransaction).forEach(transaction => {
    const key = getVendorLedgerKey(transaction);
    byVendor[key] = byVendor[key] || { invoiced: 0, paid: 0 };

    if (transaction.side === TransactionSide.VendorInvoice) {
      byVendor[key].invoiced += transaction.amount;
    } else {
      byVendor[key].paid += transaction.amount;
    }
  });

  return Object.values(byVendor).reduce<VendorLedgerSummary>((summary, entry) => {
    const payable = Math.max(0, entry.invoiced - entry.paid);
    const advance = Math.max(0, entry.paid - entry.invoiced);

    summary.invoiced += entry.invoiced;
    summary.paid += entry.paid;
    summary.payable += payable;
    summary.advance += advance;
    summary.costExposure += entry.paid + payable;

    return summary;
  }, emptyVendorLedgerSummary());
};

export const computeProjectTotals = (units: Unit[], transactions: Transaction[]) => {
  const developerUnits = units.filter(u => u.ownershipType === OwnershipType.Developer);
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
  const perUnitVendorTransactions: Record<string, Transaction[]> = {};
  const projectWideVendorTransactions: Transaction[] = [];

  transactions.forEach(t => {
    const scope = resolveScope(t);
    if (scope === TransactionScope.PerUnit && t.unitId) {
      perUnitInvoices[t.unitId] = perUnitInvoices[t.unitId] || 0;
      perUnitPayments[t.unitId] = perUnitPayments[t.unitId] || 0;
      buyerReceipts[t.unitId] = buyerReceipts[t.unitId] || 0;
      reimbursableByUnit[t.unitId] = reimbursableByUnit[t.unitId] || 0;
      reimbursableReceiptsByUnit[t.unitId] = reimbursableReceiptsByUnit[t.unitId] || 0;
      if (isVendorTransaction(t)) {
        perUnitVendorTransactions[t.unitId] = perUnitVendorTransactions[t.unitId] || [];
        perUnitVendorTransactions[t.unitId].push(t);
      }
    } else if (scope === TransactionScope.ProjectWide && isVendorTransaction(t)) {
      projectWideVendorTransactions.push(t);
    }

    switch (t.side) {
      case TransactionSide.VendorInvoice:
        totalVendorInvoices += t.amount;
        if (scope === TransactionScope.ProjectWide) projectWideInvoices += t.amount;
        else if (t.unitId) perUnitInvoices[t.unitId] = (perUnitInvoices[t.unitId] || 0) + t.amount;
        break;
      case TransactionSide.VendorPayment:
        totalVendorPayments += t.amount;
        if (scope === TransactionScope.ProjectWide) projectWidePayments += t.amount;
        else if (t.unitId) perUnitPayments[t.unitId] = (perUnitPayments[t.unitId] || 0) + t.amount;
        break;
      case TransactionSide.BuyerReceipt:
        if (scope === TransactionScope.PerUnit && t.unitId) buyerReceipts[t.unitId] = (buyerReceipts[t.unitId] || 0) + t.amount;
        break;
      case TransactionSide.LandownerReimbursable:
        totalReimbursable += t.amount;
        if (scope === TransactionScope.PerUnit && t.unitId) reimbursableByUnit[t.unitId] = (reimbursableByUnit[t.unitId] || 0) + t.amount;
        break;
      case TransactionSide.LandownerReimbursableReceipt:
        totalReimbursableReceipts += t.amount;
        if (scope === TransactionScope.PerUnit && t.unitId) reimbursableReceiptsByUnit[t.unitId] = (reimbursableReceiptsByUnit[t.unitId] || 0) + t.amount;
        break;
    }
  });

  const perUnitVendorPayable: Record<string, number> = {};
  const perUnitVendorAdvance: Record<string, number> = {};
  const perUnitVendorCostExposure: Record<string, number> = {};
  Object.entries(perUnitVendorTransactions).forEach(([unitId, unitTransactions]) => {
    const summary = summarizeVendorLedger(unitTransactions);
    perUnitVendorPayable[unitId] = summary.payable;
    perUnitVendorAdvance[unitId] = summary.advance;
    perUnitVendorCostExposure[unitId] = summary.costExposure;
  });

  const projectWideVendorSummary = summarizeVendorLedger(projectWideVendorTransactions);
  const totalVendorSummary = summarizeVendorLedger(transactions);

  const landownerPerUnitInvoices = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitInvoices[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitPayments = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitPayments[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorPayable = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitVendorPayable[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorAdvance = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (perUnitVendorAdvance[getUnitKey(unit)] || 0), 0);

  const landownerPerUnitVendorCostExposure = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
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
    totalVendorCostExposure: totalVendorSummary.costExposure
  };
};

const allocateByArea = (units: Unit[], totalArea: number, poolAmount: number) => {
  const allocations: Record<string, number> = {};
  units.forEach(unit => {
    const unitArea = getTotalBuiltUpArea(unit);
    allocations[getUnitKey(unit)] = totalArea > 0 ? (poolAmount * unitArea) / totalArea : 0;
  });
  return allocations;
};

export const allocateCostDeveloperView = (units: Unit[], projectTotals: ReturnType<typeof computeProjectTotals>) => {
  const {
    developerUnits,
    totalDevArea,
    projectWideInvoices,
    projectWidePayments,
    projectWideVendorPayable,
    projectWideVendorAdvance,
    projectWideVendorCostExposure,
    landownerPerUnitInvoices,
    landownerPerUnitPayments,
    landownerPerUnitVendorPayable,
    landownerPerUnitVendorAdvance,
    landownerPerUnitVendorCostExposure
  } = projectTotals;
  // Landowner per-unit vendor invoices/payments are absorbed into the developer
  // pool and reallocated across developer units by total built-up area.
  const projectInvoicePool = projectWideInvoices + landownerPerUnitInvoices;
  const projectPaymentPool = projectWidePayments + landownerPerUnitPayments;
  const projectPayablePool = projectWideVendorPayable + landownerPerUnitVendorPayable;
  const projectAdvancePool = projectWideVendorAdvance + landownerPerUnitVendorAdvance;
  const projectCostPool = projectWideVendorCostExposure + landownerPerUnitVendorCostExposure;

  if (totalDevArea === 0) {
    const invoices: Record<string, number> = {};
    const payments: Record<string, number> = {};
    const payable: Record<string, number> = {};
    const advance: Record<string, number> = {};
    const cost: Record<string, number> = {};
    const developerUnitCount = developerUnits.length || 1;
    const equalInvoiceShare = projectInvoicePool / developerUnitCount;
    const equalPaymentShare = projectPaymentPool / developerUnitCount;
    const equalPayableShare = projectPayablePool / developerUnitCount;
    const equalAdvanceShare = projectAdvancePool / developerUnitCount;
    const equalCostShare = projectCostPool / developerUnitCount;
    developerUnits.forEach(unit => {
      const unitKey = getUnitKey(unit);
      invoices[unitKey] = equalInvoiceShare;
      payments[unitKey] = equalPaymentShare;
      payable[unitKey] = equalPayableShare;
      advance[unitKey] = equalAdvanceShare;
      cost[unitKey] = equalCostShare;
    });
    return { cost, invoices, payments, payable, advance };
  }

  const invoices = allocateByArea(developerUnits, totalDevArea, projectInvoicePool);
  const payments = allocateByArea(developerUnits, totalDevArea, projectPaymentPool);
  const payable = allocateByArea(developerUnits, totalDevArea, projectPayablePool);
  const advance = allocateByArea(developerUnits, totalDevArea, projectAdvancePool);
  const cost = allocateByArea(developerUnits, totalDevArea, projectCostPool);

  return {
    cost,
    invoices,
    payments,
    payable,
    advance
  };
};

export const allocateCostEngineeringView = (units: Unit[], projectTotals: ReturnType<typeof computeProjectTotals>) => {
  const {
    totalAllArea,
    projectWideInvoices,
    projectWidePayments,
    projectWideVendorPayable,
    projectWideVendorAdvance,
    projectWideVendorCostExposure
  } = projectTotals;
  if (totalAllArea === 0) {
    const invoices: Record<string, number> = {};
    const payments: Record<string, number> = {};
    const payable: Record<string, number> = {};
    const advance: Record<string, number> = {};
    const cost: Record<string, number> = {};
    const unitCount = units.length || 1;
    const equalInvoiceShare = projectWideInvoices / unitCount;
    const equalPaymentShare = projectWidePayments / unitCount;
    const equalPayableShare = projectWideVendorPayable / unitCount;
    const equalAdvanceShare = projectWideVendorAdvance / unitCount;
    const equalCostShare = projectWideVendorCostExposure / unitCount;
    units.forEach(unit => {
      const unitKey = getUnitKey(unit);
      invoices[unitKey] = equalInvoiceShare;
      payments[unitKey] = equalPaymentShare;
      payable[unitKey] = equalPayableShare;
      advance[unitKey] = equalAdvanceShare;
      cost[unitKey] = equalCostShare;
    });
    return { cost, invoices, payments, payable, advance };
  }
  const invoices = allocateByArea(units, totalAllArea, projectWideInvoices);
  const payments = allocateByArea(units, totalAllArea, projectWidePayments);
  const payable = allocateByArea(units, totalAllArea, projectWideVendorPayable);
  const advance = allocateByArea(units, totalAllArea, projectWideVendorAdvance);
  const cost = allocateByArea(units, totalAllArea, projectWideVendorCostExposure);
  return {
    cost,
    invoices,
    payments,
    payable,
    advance
  };
};

export const recomputeUnitTotals = (units: Unit[], transactions: Transaction[]): Record<string, UnitFinancials> => {
  const projectTotals = computeProjectTotals(units, transactions);
  const developerAllocations = allocateCostDeveloperView(units, projectTotals);
  const engineeringAllocations = allocateCostEngineeringView(units, projectTotals);
  const totals: Record<string, UnitFinancials> = {};

  units.forEach(unit => {
    const unitKey = getUnitKey(unit);
    const computedAgreedPrice = (unit.saleableAreaSqFt * unit.ratePerSqFt) + unit.amenitiesCost + unit.adjustments;
    const agreedPrice = unit.agreedPrice ?? computedAgreedPrice;
    const unitBuyerReceipts = unit.ownershipType === OwnershipType.Developer ? (projectTotals.buyerReceipts[unitKey] || 0) : 0;
    const unitRevenue = unit.ownershipType === OwnershipType.Developer && unit.isSold ? agreedPrice : 0;
    const buyerBalanceDue = unit.ownershipType === OwnershipType.Developer && unit.isSold
      ? Math.max(0, agreedPrice - unitBuyerReceipts)
      : 0;

    const developerPerUnitInvoices = unit.ownershipType === OwnershipType.Developer ? (projectTotals.perUnitInvoices[unitKey] || 0) : 0;
    const developerPerUnitPayments = unit.ownershipType === OwnershipType.Developer ? (projectTotals.perUnitPayments[unitKey] || 0) : 0;
    const engineeringPerUnitInvoices = projectTotals.perUnitInvoices[unitKey] || 0;
    const engineeringPerUnitPayments = projectTotals.perUnitPayments[unitKey] || 0;
    const developerPerUnitPayable = unit.ownershipType === OwnershipType.Developer ? (projectTotals.perUnitVendorPayable[unitKey] || 0) : 0;
    const developerPerUnitAdvance = unit.ownershipType === OwnershipType.Developer ? (projectTotals.perUnitVendorAdvance[unitKey] || 0) : 0;
    const developerPerUnitCostExposure = unit.ownershipType === OwnershipType.Developer ? (projectTotals.perUnitVendorCostExposure[unitKey] || 0) : 0;
    const engineeringPerUnitPayable = projectTotals.perUnitVendorPayable[unitKey] || 0;
    const engineeringPerUnitAdvance = projectTotals.perUnitVendorAdvance[unitKey] || 0;
    const engineeringPerUnitCostExposure = projectTotals.perUnitVendorCostExposure[unitKey] || 0;

    const economicAllocatedInvoice = unit.ownershipType === OwnershipType.Developer ? developerAllocations.invoices[unitKey] || 0 : 0;
    const economicAllocatedCost = unit.ownershipType === OwnershipType.Developer ? developerAllocations.cost[unitKey] || 0 : 0;
    const economicAllocatedPayments = unit.ownershipType === OwnershipType.Developer ? developerAllocations.payments[unitKey] || 0 : 0;
    const economicAllocatedPayable = unit.ownershipType === OwnershipType.Developer ? developerAllocations.payable[unitKey] || 0 : 0;
    const economicAllocatedAdvance = unit.ownershipType === OwnershipType.Developer ? developerAllocations.advance[unitKey] || 0 : 0;
    const engineeringAllocatedInvoice = engineeringAllocations.invoices[unitKey] || 0;
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

    const status: UnitFinancials['status'] = unit.ownershipType === OwnershipType.Landowner
      ? 'Landowner'
      : unit.isSold ? 'Sold' : 'Unsold';

    totals[unitKey] = {
      agreedPrice,
      buyerReceipts: unitBuyerReceipts,
      buyerBalanceDue,
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
        vendorAdvance: economicVendorAdvance
      },
      engineering: {
        allocatedProjectCost: engineeringAllocatedCost,
        perUnitCost: engineeringPerUnitCostExposure,
        totalCost: engineeringTotalCost,
        allocatedPayments: engineeringAllocatedPayments,
        directPayments: engineeringPerUnitPayments,
        vendorPayable: engineeringVendorPayable,
        vendorAdvance: engineeringVendorAdvance
      }
    };
  });

  return totals;
};

export const computeDashboardMetrics = (units: Unit[], unitTotals: Record<string, UnitFinancials>, transactions: Transaction[]) => {
  const developerUnits = units.filter(u => u.ownershipType === OwnershipType.Developer);
  const totalDevBuiltUpArea = developerUnits.reduce((sum, u) => sum + getTotalBuiltUpArea(u), 0);
  const totalAllBuiltUpArea = units.reduce((sum, u) => sum + getTotalBuiltUpArea(u), 0);

  const developerRevenue = developerUnits.reduce((sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.unitRevenue || 0), 0);
  const developerCost = developerUnits.reduce((sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.economic.totalCost || 0), 0);
  const developerProfit = developerRevenue - developerCost;
  const buyerReceivable = developerUnits.reduce((sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.buyerBalanceDue || 0), 0);
  const buyerCollections = transactions.filter(t => t.side === TransactionSide.BuyerReceipt).reduce((sum, t) => sum + t.amount, 0);

  const vendorSummary = summarizeVendorLedger(transactions);

  const totalEngineeringCost = vendorSummary.costExposure;
  const engineeringCostPerSqFt = totalAllBuiltUpArea > 0 ? totalEngineeringCost / totalAllBuiltUpArea : 0;

  const soldDeveloperUnits = developerUnits.filter(u => u.isSold).length;
  const settledDeveloperUnits = developerUnits.filter(u => u.isSettled).length;
  const landownerOwesBuilder = units
    .filter(u => u.ownershipType === OwnershipType.Landowner)
    .reduce((sum, unit) => sum + (unitTotals[getUnitKey(unit)]?.reimbursableDue || 0), 0);

  const engineeringCostByTower: Record<string, number> = {};
  units.forEach(unit => {
    const towerCost = unitTotals[getUnitKey(unit)]?.engineering.totalCost || 0;
    engineeringCostByTower[unit.tower] = (engineeringCostByTower[unit.tower] || 0) + towerCost;
  });

  return {
    developer: {
      buyerReceivable,
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
      landownerOwesBuilder
    },
    engineering: {
      totalCost: totalEngineeringCost,
      costPerSqFt: engineeringCostPerSqFt,
      totalArea: totalAllBuiltUpArea,
      byTower: engineeringCostByTower,
      totalUnits: units.length
    }
  };
};

export const getUniqueVendors = (transactions: Transaction[]): string[] => {
  const vendors = new Set<string>();
  transactions.forEach(t => { if (t.vendorName) vendors.add(t.vendorName); });
  return Array.from(vendors);
};
