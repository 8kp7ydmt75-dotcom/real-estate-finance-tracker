import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { PaymentMode, Transaction, TransactionScope, TransactionSide, Unit, WorkPackage } from '../types';
import { useApp } from '../appContext';
import { getUnitCode } from '../utils';

interface TransactionFormModalProps {
  title: string;
  submitLabel?: string;
  units: Unit[];
  defaultUnitId?: string;
  initialTransaction?: Transaction;
  defaultSide?: TransactionSide;
  defaultScope?: TransactionScope;
  lockSide?: boolean;
  hideScopeControl?: boolean;
  onSubmit: (transaction: Transaction) => Promise<void> | void;
  onClose: () => void;
}

const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  title,
  submitLabel = 'Save Transaction',
  units,
  defaultUnitId,
  initialTransaction,
  defaultSide,
  defaultScope,
  lockSide = false,
  hideScopeControl = false,
  onSubmit,
  onClose
}) => {
  const { activeProject } = useApp();
  const resolvedDefaultSide = initialTransaction?.side || defaultSide || TransactionSide.BuyerReceipt;
  const resolvedDefaultScope = initialTransaction?.scope
    || defaultScope
    || (resolvedDefaultSide === TransactionSide.BuyerReceipt ? TransactionScope.PerUnit : TransactionScope.ProjectWide);

  const [side, setSide] = useState<TransactionSide>(resolvedDefaultSide);
  const [scope, setScope] = useState<TransactionScope>(resolvedDefaultScope);
  // Transaction unitId stores the unit UUID; option labels show the tower/flat display code.
  const [unitId, setUnitId] = useState(initialTransaction?.unitId || defaultUnitId || units[0]?.id || '');
  const [date, setDate] = useState(initialTransaction?.date || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(initialTransaction?.amount.toString() || '');
  const [mode, setMode] = useState<PaymentMode>(initialTransaction?.mode || PaymentMode.NEFT);
  const [workPackage, setWorkPackage] = useState<WorkPackage>(initialTransaction?.workPackage || WorkPackage.Other);
  const [details, setDetails] = useState(initialTransaction?.description || initialTransaction?.vendorName || '');
  const [status, setStatus] = useState<'Settled' | 'Pending'>(initialTransaction?.isSettled ? 'Settled' : 'Pending');
  const [dueDate, setDueDate] = useState(initialTransaction?.dueDate || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [unitId, side, date, amount, mode, workPackage, details, status, dueDate, scope]);

  const availableUnits = useMemo(() => units, [units]);

  useEffect(() => {
    if (!unitId && availableUnits.length > 0) {
      setUnitId(defaultUnitId && availableUnits.some(u => u.id === defaultUnitId) ? defaultUnitId : availableUnits[0].id || '');
    }
    if (unitId && availableUnits.length > 0 && !availableUnits.some(u => u.id === unitId)) {
      setUnitId(defaultUnitId && availableUnits.some(u => u.id === defaultUnitId) ? defaultUnitId : availableUnits[0].id || '');
    }
  }, [availableUnits, defaultUnitId, unitId]);

  const resolvedScope = side === TransactionSide.BuyerReceipt ? TransactionScope.PerUnit : scope;
  const requiresUnit = resolvedScope === TransactionScope.PerUnit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresUnit && !unitId) {
      setError('Please select a unit.');
      return;
    }
    if (!amount || parseFloat(amount) < 0) {
      setError('Amount must be a non-negative number.');
      return;
    }

    if (side !== TransactionSide.BuyerReceipt && !details.trim()) {
      setError('Please provide vendor name or details.');
      return;
    }

    const transaction: Transaction = {
      id: initialTransaction?.id,
      unitId: resolvedScope === TransactionScope.PerUnit ? unitId : undefined,
      scope: resolvedScope,
      side,
      amount: parseFloat(amount),
      date,
      mode: side !== TransactionSide.VendorInvoice ? mode : undefined,
      vendorName: side !== TransactionSide.BuyerReceipt ? details || undefined : undefined,
      workPackage: side !== TransactionSide.BuyerReceipt ? workPackage : undefined,
      description: details || undefined,
      dueDate: side === TransactionSide.VendorInvoice ? dueDate || undefined : undefined,
      isSettled: status === 'Settled'
    };

    await onSubmit(transaction);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="oat-modal-shell w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Quick action</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-slate-900" aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <section className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Transaction details</h4>
              <p className="mt-1 text-sm text-slate-500">Capture one finance event without changing any accounting rules.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="form-field">
                <label htmlFor="transaction-type">Type</label>
                <select
                  id="transaction-type"
                  value={side}
                  onChange={(e) => {
                    const nextSide = e.target.value as TransactionSide;
                    setSide(nextSide);
                    if (nextSide === TransactionSide.VendorInvoice) setStatus('Pending');
                    if (nextSide === TransactionSide.BuyerReceipt) {
                      setScope(TransactionScope.PerUnit);
                      setWorkPackage(WorkPackage.Other);
                    }
                  }}
                  disabled={lockSide}
                  className="form-control"
                >
                  {Object.values(TransactionSide).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {!hideScopeControl && (
                <div className="form-field">
                  <label htmlFor="transaction-scope">Scope</label>
                  <select
                    id="transaction-scope"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as TransactionScope)}
                    disabled={side === TransactionSide.BuyerReceipt}
                    className="form-control disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {Object.values(TransactionScope).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div className="form-field md:col-span-1">
                <label htmlFor="transaction-unit">Unit {requiresUnit && <span className="text-rose-500">*</span>}</label>
                <select
                  id="transaction-unit"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  disabled={resolvedScope === TransactionScope.ProjectWide || availableUnits.length === 0}
                  className="form-control disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select unit</option>
                  {/* The option value is the unit UUID; labels stay as tower+flat display codes. */}
                  {availableUnits.map(unit => (
                    <option key={unit.id || getUnitCode(unit)} value={unit.id || ''}>
                      {getUnitCode(unit)} - Tower {unit.tower}, Flat {unit.flatNumber}
                    </option>
                  ))}
                </select>
                {resolvedScope === TransactionScope.ProjectWide && !hideScopeControl && (
                  <p className="form-hint">Unit selection is disabled for project-wide transactions.</p>
                )}
                {availableUnits.length === 0 && (
                  <div className="form-hint text-rose-500">
                    <p>No units found. Please create units first from the Units List.</p>
                    <a href={activeProject ? `#/p/${activeProject.id}/units` : '#/'} className="font-medium text-sky-700 underline" onClick={onClose}>Go to Units List</a>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="form-field">
              <label htmlFor="transaction-date">Date</label>
              <input id="transaction-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-control" required />
            </div>
            <div className="form-field">
              <label htmlFor="transaction-amount">Amount (₹)</label>
              <input id="transaction-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="form-control" required />
            </div>
          </section>

          <section className="space-y-4">
            <div className="form-field">
              <label htmlFor="transaction-details">Party / details</label>
              <input
                id="transaction-details"
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="form-control"
                placeholder={side === TransactionSide.BuyerReceipt ? 'e.g. Received via NEFT' : 'Vendor or note'}
              />
            </div>

            {side !== TransactionSide.VendorInvoice && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="form-field">
                  <label htmlFor="transaction-mode">Mode</label>
                  <select id="transaction-mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} className="form-control">
                    {Object.values(PaymentMode).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="transaction-status">Status</label>
                  <select id="transaction-status" value={status} onChange={(e) => setStatus(e.target.value as 'Settled' | 'Pending')} className="form-control">
                    <option value="Settled">Settled</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
            )}

            {side !== TransactionSide.BuyerReceipt && (
              <div className="form-field">
                <label htmlFor="transaction-work-package">Work Package</label>
                <select id="transaction-work-package" value={workPackage} onChange={(e) => setWorkPackage(e.target.value as WorkPackage)} className="form-control">
                  {Object.values(WorkPackage).map(wp => <option key={wp} value={wp}>{wp}</option>)}
                </select>
              </div>
            )}

            {side === TransactionSide.VendorInvoice && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="form-field">
                  <label htmlFor="transaction-due-date">Due Date</label>
                  <input id="transaction-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="form-control" />
                </div>
                <div className="form-field">
                  <label htmlFor="transaction-status-invoice">Status</label>
                  <select id="transaction-status-invoice" value={status} onChange={(e) => setStatus(e.target.value as 'Settled' | 'Pending')} className="form-control">
                    <option value="Settled">Settled</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
            )}
          </section>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="dashboard-secondary-button justify-center sm:min-w-32">Cancel</button>
            <button type="submit" className="dashboard-primary-button justify-center sm:min-w-40">{submitLabel}</button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default TransactionFormModal;
