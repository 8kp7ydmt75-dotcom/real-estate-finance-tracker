import React, { useMemo, useState } from 'react';
import { useApp } from '../context/appContext';
import { formatCurrency, getUnitCode } from '../utils/utils';
import { Transaction, TransactionSide, TransactionScope } from '../types/types';
import { Search, CheckCircle2, Plus } from 'lucide-react';
import TransactionFormModal from './TransactionFormModal';

const TransactionList: React.FC = () => {
  const { transactions, units, addTransaction, updateTransaction, deleteTransaction } = useApp();
  const [search, setSearch] = useState("");
  const [filterSide, setFilterSide] = useState<"All" | TransactionSide>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const unitLabelById = useMemo(
    () => Object.fromEntries(units.filter(unit => unit.id).map(unit => [unit.id!, getUnitCode(unit)])),
    [units]
  );

  const sortedTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(t => {
        if (filterSide !== "All" && t.side !== filterSide) return false;
        if (search) {
          const s = search.toLowerCase();
          const unitLabel = t.unitId ? unitLabelById[t.unitId] || t.unitId : '';
          return (
            unitLabel.toLowerCase().includes(s) ||
            (t.vendorName && t.vendorName.toLowerCase().includes(s)) ||
            t.amount.toString().includes(s)
          );
        }
        return true;
      });
  }, [transactions, filterSide, search, unitLabelById]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold text-primary">All Transactions</h2>
        <p className="text-slate-500">A complete history of every receipt and payment.</p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => { setEditingTransaction(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 shadow shadow-primary/20"
        >
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search Unit, Vendor or Amount..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 mr-2">Type:</span>
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value as any)}
            className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="All">All Transactions</option>
            {Object.values(TransactionSide).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Scope</th>
                <th className="px-6 py-4">Unit</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No transactions yet
                  </td>
                </tr>
              ) : sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                sortedTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{t.date}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        (t.scope ?? TransactionScope.ProjectWide) === TransactionScope.ProjectWide
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {(t.scope ?? TransactionScope.ProjectWide) === TransactionScope.ProjectWide ? 'ProjectWide' : 'Per Unit'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{t.unitId ? unitLabelById[t.unitId] || t.unitId : '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${t.side === TransactionSide.BuyerReceipt ? 'bg-green-100 text-green-800' :
                          t.side === TransactionSide.VendorInvoice ? 'bg-orange-100 text-orange-800' :
                          'bg-rose-100 text-rose-800'}`}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {t.side === TransactionSide.BuyerReceipt ? (
                        <div className="flex flex-col">
                          <span className="font-medium">Buyer Receipt</span>
                          {t.description && <span className="text-xs text-slate-400">{t.description}</span>}
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800">{t.vendorName}</span>
                          <span className="text-xs text-slate-400">{t.workPackage}</span>
                          {t.description && <span className="text-xs text-slate-400">{t.description}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-slate-800">
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {t.isSettled ? (
                        <div className="flex justify-center" title="Settled">
                          <CheckCircle2 size={18} className="text-green-500" />
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setEditingTransaction(t); setIsModalOpen(true); }}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm('Delete this transaction?')) {
                              const reason = window.prompt('Delete reason (required for audit trail):', 'Entered in error') || 'Entered in error';
                              await deleteTransaction(t.id, reason);
                            }
                          }}
                          className="text-rose-500 hover:text-rose-700 text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <TransactionFormModal
          title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          submitLabel={editingTransaction ? 'Update Transaction' : 'Save Transaction'}
          units={units}
          defaultUnitId={units[0]?.id}
          initialTransaction={editingTransaction || undefined}
          onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }}
          onSubmit={async (t) => {
            if (editingTransaction) {
              await updateTransaction(t);
            } else {
              await addTransaction(t);
            }
            setIsModalOpen(false);
            setEditingTransaction(null);
          }}
        />
      )}
    </div>
  );
};

export default TransactionList;
