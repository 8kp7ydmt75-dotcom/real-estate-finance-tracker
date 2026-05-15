import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../appContext';
import { formatCurrency, getUnitCode, getUnitKey, recomputeUnitTotals } from '../utils';
import { OwnershipType, Transaction, TransactionScope, TransactionSide } from '../types';
import { ArrowLeft, Plus, CheckCircle2, AlertCircle, Trash2, Pencil } from 'lucide-react';
import TransactionFormModal from './TransactionFormModal';
import UnitFormModal from './UnitFormModal';

const UnitDetail: React.FC = () => {
  const { projectId, unitId } = useParams<{ projectId: string; unitId: string }>();
  const navigate = useNavigate();
  const { units, transactions, addTransaction, deleteTransaction, updateTransaction, updateUnit, deleteUnit } = useApp();

  // Current links use the unit UUID; display-code matching is only for legacy
  // /units/:unitId redirects created before project-scoped routes existed.
  const unit = units.find(u => u.id === unitId || getUnitCode(u) === unitId);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);

  const unitTotals = useMemo(() => recomputeUnitTotals(units, transactions), [units, transactions]);
  const unitTransactions = useMemo(() => {
    if (!unit?.id) return [];
    return transactions
      .filter(t => t.unitId === unit.id && (t.scope ?? TransactionScope.PerUnit) === TransactionScope.PerUnit)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, unit?.id]);

  const unitsPath = projectId ? `/p/${projectId}/units` : '/';

  if (!unit) {
    return (
      <div className="text-center mt-20">
        <h2 className="text-2xl font-bold text-slate-800">Unit not found</h2>
        <button onClick={() => navigate(unitsPath)} className="text-accent mt-4 underline">Back to Units</button>
      </div>
    );
  }

  const unitCode = getUnitCode(unit);
  const financials = unitTotals[getUnitKey(unit)];
  const economic = financials.economic;
  const engineering = financials.engineering;
  const economicMargin = financials.unitRevenue - economic.totalCost;
  const engineeringMargin = financials.unitRevenue - engineering.totalCost;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate(unitsPath)} className="flex items-center text-slate-500 hover:text-primary mb-2 transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Back to List
          </button>
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-4xl font-bold text-primary">{unitCode}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${unit.ownershipType === OwnershipType.Developer ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}>
              {unit.ownershipType}
            </span>
            <div className="px-3 py-1 bg-slate-200 rounded-full text-sm font-medium text-slate-700">
              Tower {unit.tower}
            </div>
            <div className="px-3 py-1 bg-slate-200 rounded-full text-sm font-medium text-slate-700">
              {unit.bhk}
            </div>
            <div className="px-3 py-1 bg-slate-200 rounded-full text-sm font-medium text-slate-700">
              Floor {unit.floor}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <div className="text-sm text-slate-500">Agreed Price</div>
            <div className="text-2xl font-bold text-primary">{formatCurrency(financials.agreedPrice)}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsUnitModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-lg bg-white hover:bg-primary/5"
            >
              <Pencil size={16} /> Edit Unit
            </button>
            <button
              onClick={async () => {
                if (window.confirm('Deleting this unit will also remove all its transactions and update totals. Are you sure?')) {
                  const reason = window.prompt('Delete reason (required for audit trail):', 'Duplicate unit') || 'Duplicate unit';
                            await deleteUnit(unit.id, reason);
                  navigate(unitsPath);
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-rose-600 border border-rose-200 rounded-lg bg-rose-50 hover:bg-rose-100"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </div>

      {unit.ownershipType === OwnershipType.Developer ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Unit Info */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-semibold text-slate-900 border-b pb-2">Property Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-slate-400 text-xs">Carpet Area</span>
                <span className="font-medium">{unit.carpetAreaSqFt} sq ft</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Total Built-up Area</span>
                <span className="font-medium">{unit.saleableAreaSqFt} sq ft</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Rate</span>
                <span className="font-medium">{formatCurrency(unit.ratePerSqFt)} / sq ft</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Amenities</span>
                <span className="font-medium">{formatCurrency(unit.amenitiesCost)}</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Adjustments</span>
                <span className={`font-medium ${unit.adjustments < 0 ? 'text-green-600' : 'text-slate-900'}`}>{formatCurrency(unit.adjustments)}</span>
              </div>
            </div>
          </div>

          {/* Revenue & Margin */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-green-500/20"></div>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-green-800">Revenue & Margin (Economic)</h3>
              <div className="flex items-center gap-2">
                {unit.buyerName ? <CheckCircle2 size={16} className="text-green-600"/> : <AlertCircle size={16} className="text-orange-400"/>}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Buyer Receipts</span><span className="font-medium">{formatCurrency(financials.buyerReceipts)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Balance Due</span><span className="font-bold text-green-600">{formatCurrency(financials.buyerBalanceDue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Unit Revenue</span><span className="font-semibold text-primary">{formatCurrency(financials.unitRevenue)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-sm font-semibold text-slate-700">Unit Margin</span><span className={`font-bold ${economicMargin >= 0 ? 'text-green-700' : 'text-rose-600'}`}>{formatCurrency(economicMargin)}</span></div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-rose-500/20"></div>
            <h3 className="font-semibold text-rose-800 border-b border-rose-100 pb-2">Cost Breakdown (Economic)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Allocated Project Cost</span><span className="font-medium">{formatCurrency(economic.allocatedProjectCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Direct Unit Cost</span><span className="font-medium">{formatCurrency(economic.perUnitCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Project-Wide Payments</span><span className="font-medium">{formatCurrency(economic.allocatedPayments)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Direct Payments</span><span className="font-medium">{formatCurrency(economic.directPayments)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-sm font-semibold text-slate-700">Total Unit Cost</span><span className="font-bold text-rose-600">{formatCurrency(economic.totalCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Vendor Payable</span><span className="font-semibold text-rose-600">{formatCurrency(economic.vendorPayable)}</span></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-semibold text-slate-900 border-b pb-2">Landowner Flat Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-slate-400 text-xs">Carpet Area</span>
                <span className="font-medium">{unit.carpetAreaSqFt} sq ft</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Total Built-up Area</span>
                <span className="font-medium">{unit.saleableAreaSqFt} sq ft</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">BHK</span>
                <span className="font-medium">{unit.bhk}</span>
              </div>
              <div>
                <span className="block text-slate-400 text-xs">Floor</span>
                <span className="font-medium">{unit.floor}</span>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h3 className="font-semibold text-purple-800">Engineering Cost View</h3>
            <p className="text-sm text-slate-500">Landowner units have no buyer revenue or economic allocation. Engineering cost shows their share of total construction.</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Allocated Project Cost</span><span className="font-medium">{formatCurrency(engineering.allocatedProjectCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Per-Unit Vendor Cost</span><span className="font-medium">{formatCurrency(engineering.perUnitCost)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-sm font-semibold text-slate-700">Total Engineering Cost</span><span className="font-bold text-primary">{formatCurrency(engineering.totalCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Vendor Payable (Engineering)</span><span className="font-semibold text-rose-600">{formatCurrency(engineering.vendorPayable)}</span></div>
            </div>
          </div>
        </div>
      )}

      {unit.ownershipType === OwnershipType.Developer && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-amber-500/20"></div>
            <h3 className="font-semibold text-amber-800">Engineering Allocation (All Units)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Allocated Project Cost</span><span className="font-medium">{formatCurrency(engineering.allocatedProjectCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Per-Unit Vendor Cost</span><span className="font-medium">{formatCurrency(engineering.perUnitCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Project-Wide Payments</span><span className="font-medium">{formatCurrency(engineering.allocatedPayments)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Direct Payments</span><span className="font-medium">{formatCurrency(engineering.directPayments)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-sm font-semibold text-slate-700">Total Engineering Cost</span><span className="font-bold text-amber-700">{formatCurrency(engineering.totalCost)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Vendor Payable</span><span className="font-semibold text-rose-600">{formatCurrency(engineering.vendorPayable)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-sm font-semibold text-slate-700">Engineering Margin</span><span className={`font-bold ${engineeringMargin >= 0 ? 'text-green-700' : 'text-rose-600'}`}>{formatCurrency(engineeringMargin)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h3 className="text-lg font-bold text-primary">Transaction History</h3>
          <button
            onClick={() => {
              setEditingTransaction(null);
              setIsTransactionModalOpen(true);
            }}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> Add Transaction
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Party / Details</th>
                <th className="px-6 py-3 font-medium">Mode</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-center">Status</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unitTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No transactions recorded for this unit yet.
                  </td>
                </tr>
              ) : (
                unitTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{t.date}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${t.side === TransactionSide.BuyerReceipt ? 'bg-green-100 text-green-800' :
                          t.side === TransactionSide.VendorInvoice ? 'bg-orange-100 text-orange-800' :
                          'bg-rose-100 text-rose-800'}`}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {t.side === TransactionSide.BuyerReceipt ? (
                        <div className="flex flex-col">
                          <span className="font-medium">From Buyer</span>
                          {t.description && <span className="text-xs text-slate-400">{t.description}</span>}
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium">{t.vendorName}</span>
                          <span className="text-xs text-slate-400">{t.workPackage}</span>
                          {t.description && <span className="text-xs text-slate-400">{t.description}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{t.mode || '-'}</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {t.isSettled ? (
                        <CheckCircle2 size={18} className="mx-auto text-green-500" />
                      ) : (
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingTransaction(t);
                            setIsTransactionModalOpen(true);
                          }}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if(window.confirm('Are you sure you want to delete this transaction?')) {
                              const reason = window.prompt('Delete reason (required for audit trail):', 'Incorrect posting') || 'Incorrect posting';
                            await deleteTransaction(t.id, reason);
                            }
                          }}
                          className="text-rose-400 hover:text-rose-600 text-xs font-medium"
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

      {isTransactionModalOpen && (
        <TransactionFormModal
          title={editingTransaction ? 'Edit Transaction' : `Add Transaction for ${unitCode}`}
          submitLabel={editingTransaction ? 'Update Transaction' : 'Save Transaction'}
          units={units}
          defaultUnitId={unit.id}
          initialTransaction={editingTransaction || undefined}
          onClose={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }}
          onSubmit={async (t) => {
            if (editingTransaction) {
              await updateTransaction(t);
            } else {
              await addTransaction(t);
            }
            setIsTransactionModalOpen(false);
            setEditingTransaction(null);
          }}
        />
      )}

      {isUnitModalOpen && (
        <UnitFormModal
          initialUnit={unit}
          existingIds={units.map(getUnitCode)}
          title={`Edit ${unitCode}`}
          submitLabel="Update Unit"
          onClose={() => setIsUnitModalOpen(false)}
          onSubmit={async (updatedUnit) => {
            await updateUnit({ ...updatedUnit, id: unit.id });
          }}
        />
      )}
    </div>
  );
};

export default UnitDetail;
