import {
  OwnershipType,
  Transaction,
  TransactionScope,
  TransactionSide,
  Unit,
} from '../types/types';

export function assertMoney(
  value: number,
  label = 'Amount',
  allowZero = false,
  allowNegative = false,
) {
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 999999999999.99 ||
    (!allowNegative && value < 0) ||
    (!allowZero && value === 0) ||
    Number(value.toFixed(2)) !== value
  ) {
    throw new Error(
      `${label} must be a valid ${allowNegative ? '' : allowZero ? 'non-negative ' : 'positive '}amount with at most two decimal places.`,
    );
  }
}
export function assertDate(value: string, label = 'Date') {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} is invalid.`);
}
export function validateUnit(unit: Unit) {
  if (!unit.tower.trim() || !unit.flatNumber.trim())
    throw new Error('Tower and flat number are required.');
  if (!Number.isInteger(unit.floor)) throw new Error('Floor must be a whole number.');
  for (const value of [unit.carpetAreaSqFt, unit.saleableAreaSqFt])
    if (!Number.isFinite(value) || value < 0 || value > 10000000)
      throw new Error('Area must be a valid non-negative number.');
  assertMoney(unit.ratePerSqFt, 'Rate', true);
  assertMoney(unit.amenitiesCost, 'Amenities', true);
  assertMoney(unit.adjustments, 'Adjustments', true, true);
  assertMoney(
    unit.agreedPrice ??
      Math.round(
        (unit.saleableAreaSqFt * unit.ratePerSqFt + unit.amenitiesCost + unit.adjustments) * 100,
      ) / 100,
    'Agreed price',
    true,
  );
  if (unit.isSold && (unit.ownershipType !== OwnershipType.Developer || !unit.buyerName.trim()))
    throw new Error('A sold unit must be developer-owned and have a buyer name.');
  if (unit.handoverTarget) assertDate(unit.handoverTarget, 'Handover date');
}
export function validateTransaction(
  t: Transaction,
  units: Unit[],
  transactions: Transaction[] = [],
) {
  assertMoney(t.amount);
  assertDate(t.date);
  if (t.dueDate) assertDate(t.dueDate, 'Due date');
  const unitRequired = [
    TransactionSide.BuyerReceipt,
    TransactionSide.LandownerReimbursable,
    TransactionSide.LandownerReimbursableReceipt,
  ].includes(t.side);
  if (unitRequired && t.scope !== TransactionScope.PerUnit)
    throw new Error('This transaction must be linked to a unit.');
  const unit = units.find((u) => u.id === t.unitId);
  if (t.scope === TransactionScope.PerUnit && !unit)
    throw new Error('Selected unit was not found in this project.');
  if (
    t.side === TransactionSide.BuyerReceipt &&
    (unit?.ownershipType !== OwnershipType.Developer || !unit.isSold)
  )
    throw new Error('Buyer receipts require a sold developer unit.');
  if (
    [TransactionSide.LandownerReimbursable, TransactionSide.LandownerReimbursableReceipt].includes(
      t.side,
    ) &&
    unit?.ownershipType !== OwnershipType.Landowner
  )
    throw new Error('Reimbursements require a landowner unit.');
  if (
    [TransactionSide.VendorInvoice, TransactionSide.VendorPayment].includes(t.side) &&
    !t.vendorName?.trim()
  )
    throw new Error('Vendor name is required.');
  if (t.invoiceId) {
    const invoice = transactions.find((i) => i.id === t.invoiceId);
    if (
      t.side !== TransactionSide.VendorPayment ||
      !invoice ||
      invoice.side !== TransactionSide.VendorInvoice ||
      invoice.vendorName?.trim().toLowerCase() !== t.vendorName?.trim().toLowerCase()
    )
      throw new Error('Select an invoice for this vendor in this project.');
  }
}
