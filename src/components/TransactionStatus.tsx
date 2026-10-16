import { Transaction, TransactionSide } from '../types/types';
import { formatCurrency } from '../utils/utils';

export default function TransactionStatus({
  transaction: t,
  outstanding,
}: {
  transaction: Transaction;
  outstanding?: number;
}) {
  if (t.side === TransactionSide.LandownerReimbursable) return <span>Recorded</span>;
  if (t.side === TransactionSide.VendorInvoice)
    return (
      <span className={outstanding === 0 ? 'text-green-700' : 'text-amber-800'}>
        {outstanding === 0 ? 'Paid' : `${formatCurrency(outstanding ?? t.amount)} due`}
      </span>
    );
  return (
    <span className={t.isSettled ? 'text-green-700' : 'text-slate-500'}>
      {t.isSettled ? 'Cleared' : 'Pending'}
    </span>
  );
}
