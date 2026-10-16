import { Transaction, TransactionScope, TransactionSide } from '../types/types';

/** All ledger arithmetic is in integer paise; rupees are a presentation boundary. */
const safePaise = (amount: number) => {
  if (!Number.isSafeInteger(amount))
    throw new Error(
      'The ledger exceeds the supported exact-money range. Split the reporting period before continuing.',
    );
  return amount;
};
export const paise = (amount: number) => safePaise(Math.round(amount * 100));
export const rupees = (amount: number) => safePaise(amount) / 100;
export const money = (amount: number) => rupees(paise(amount));
export const vendorKey = (t: Transaction) =>
  t.vendorId ||
  (t.vendorName || t.description || 'Unassigned vendor').trim().replace(/\s+/g, ' ').toLowerCase();
export const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export interface LedgerBucket {
  invoiced: number;
  paid: number;
  payable: number;
  advance: number;
  costExposure: number;
}
const empty = (): LedgerBucket => ({
  invoiced: 0,
  paid: 0,
  payable: 0,
  advance: 0,
  costExposure: 0,
});
const scopeKey = (t: Transaction) =>
  t.scope === TransactionScope.PerUnit ? t.unitId || 'unallocated' : 'project';

/** Explicit invoice links first, then legacy/unlinked payments FIFO per vendor.
 * Matched payments inherit the invoice's cost scope. Unapplied cash retains its
 * payment scope. This makes every unit view reconcile with the project ledger.
 */
export function reconcileVendorLedger(transactions: Transaction[]) {
  const ordered = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.id || '').localeCompare(b.id || ''),
  );
  const invoices = ordered
    .filter((t) => t.side === TransactionSide.VendorInvoice)
    .map((t) => ({ t, due: paise(t.amount) }));
  const buckets: Record<string, LedgerBucket> = Object.create(null);
  const bucket = (t: Transaction) => (buckets[scopeKey(t)] ||= empty());
  invoices.forEach(({ t }) => {
    bucket(t).invoiced += paise(t.amount);
  });
  const payments = ordered.filter((t) => t.side === TransactionSide.VendorPayment && t.isSettled);
  payments.sort((a, b) => Number(Boolean(b.invoiceId)) - Number(Boolean(a.invoiceId)));
  for (const payment of payments) {
    let remaining = paise(payment.amount);
    const candidates = invoices.filter(
      ({ t }) =>
        vendorKey(t) === vendorKey(payment) && (!payment.invoiceId || t.id === payment.invoiceId),
    );
    for (const invoice of candidates) {
      const applied = Math.min(invoice.due, remaining);
      invoice.due -= applied;
      remaining -= applied;
      bucket(invoice.t).paid += applied;
      if (!remaining) break;
    }
    bucket(payment).paid += remaining;
    bucket(payment).advance += remaining;
  }
  const invoiceOutstanding: Record<string, number> = Object.create(null);
  invoices.forEach(({ t, due }) => {
    bucket(t).payable += due;
    if (t.id) invoiceOutstanding[t.id] = rupees(due);
  });
  const total = empty();
  Object.values(buckets).forEach((b) => {
    b.costExposure = b.invoiced + b.advance;
    for (const key of Object.keys(b) as (keyof LedgerBucket)[]) {
      total[key] += b[key];
      b[key] = rupees(b[key]);
    }
  });
  for (const key of Object.keys(total) as (keyof LedgerBucket)[]) total[key] = rupees(total[key]);
  return { total, buckets, invoiceOutstanding };
}

/** Largest-remainder allocation preserves the exact pool, including zero-area units. */
export function allocateMoney(weights: { id: string; weight: number }[], amount: number) {
  const result: Record<string, number> = Object.create(null);
  if (!weights.length) return result;
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const cents = paise(amount);
  const shares = weights.map((w) => {
    const exact = cents * (total > 0 ? w.weight / total : 1 / weights.length);
    return { id: w.id, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let residual = cents - shares.reduce((s, w) => s + w.value, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const share of shares) {
    if (residual-- > 0) share.value++;
    result[share.id] = rupees(share.value);
  }
  return result;
}
