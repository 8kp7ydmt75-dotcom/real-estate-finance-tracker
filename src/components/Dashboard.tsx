import React, { useMemo, useState } from 'react';
import { useApp } from '../context/appContext';
import { computeDashboardMetrics, formatCurrency, getUnitCode, getUnitKey, recomputeUnitTotals } from '../utils/utils';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  Building2,
  HandCoins,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  Receipt,
  SquareStack,
} from 'lucide-react';
import { OwnershipType, Transaction, TransactionScope, TransactionSide } from '../types/types';
import TransactionFormModal from './TransactionFormModal';

type DashboardTab = 'Overview' | 'Units' | 'Costs' | 'Collections' | 'JV Summary';
type QuickAction = 'transaction' | 'collection' | null;

const DASHBOARD_TABS: DashboardTab[] = ['Overview', 'Units', 'Costs', 'Collections', 'JV Summary'];

const Dashboard: React.FC = () => {
  const { activeProject, units, transactions, addTransaction, updateTransaction, deleteTransaction } = useApp();
  const [viewMode, setViewMode] = useState<'Developer' | 'Engineering'>('Developer');
  const [activeTab, setActiveTab] = useState<DashboardTab>('Overview');
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const unitTotals = useMemo(() => recomputeUnitTotals(units, transactions), [units, transactions]);
  const dashboardMetrics = useMemo(
    () => computeDashboardMetrics(units, unitTotals, transactions),
    [units, unitTotals, transactions]
  );

  const today = new Date().toISOString().split('T')[0];

  const unitLabelById = useMemo(
    () => Object.fromEntries(units.filter(unit => unit.id).map(unit => [unit.id!, getUnitCode(unit)])),
    [units]
  );
  const getTransactionUnitLabel = (transaction: Transaction) =>
    transaction.unitId ? unitLabelById[transaction.unitId] || transaction.unitId : undefined;

  const unitStats = useMemo(() => units.map(unit => ({ unit, totals: unitTotals[getUnitKey(unit)] })), [units, unitTotals]);

  const developerUnits = useMemo(
    () => unitStats.filter(({ unit }) => unit.ownershipType === OwnershipType.Developer),
    [unitStats]
  );

  const soldUnits = developerUnits.filter(({ unit }) => unit.isSold);
  const availableUnits = developerUnits.filter(({ unit }) => !unit.isSold);

  const receivableUnits = useMemo(
    () => developerUnits.filter(({ totals }) => totals.buyerBalanceDue > 0),
    [developerUnits]
  );

  const topReceivables = useMemo(
    () => [...receivableUnits]
      .sort((a, b) => b.totals.buyerBalanceDue - a.totals.buyerBalanceDue)
      .slice(0, 5),
    [receivableUnits]
  );

  const pendingVendorInvoices = useMemo(
    () => transactions
      .filter((transaction) => transaction.side === TransactionSide.VendorInvoice && !transaction.isSettled)
      .sort((a, b) => {
        const leftDate = a.dueDate || a.date;
        const rightDate = b.dueDate || b.date;
        return leftDate.localeCompare(rightDate);
      }),
    [transactions]
  );

  const overdueInvoices = useMemo(
    () => pendingVendorInvoices
      .filter((transaction) => (
        Boolean(transaction.dueDate)
        && transaction.dueDate! < today
      ))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    [pendingVendorInvoices, today]
  );

  const recentTransactions = useMemo(
    () => [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8),
    [transactions]
  );

  const pendingCollections = useMemo(
    () => receivableUnits.length,
    [receivableUnits]
  );

  const kpis = [
    {
      title: 'Total Units',
      value: dashboardMetrics.developer.totalUnits.toString(),
      description: 'Developer inventory',
      icon: <Building2 size={18} />,
      tone: 'slate' as const,
    },
    {
      title: 'Sold Units',
      value: dashboardMetrics.developer.soldUnits.toString(),
      description: 'Buyer assigned units',
      icon: <Landmark size={18} />,
      tone: 'emerald' as const,
    },
    {
      title: 'Available Units',
      value: availableUnits.length.toString(),
      description: 'Unsold developer units',
      icon: <LayoutGrid size={18} />,
      tone: 'blue' as const,
    },
    {
      title: 'Total Collections',
      value: formatCurrency(transactions.filter((transaction) => transaction.side === TransactionSide.BuyerReceipt).reduce((sum, transaction) => sum + transaction.amount, 0)),
      description: 'Buyer receipts logged',
      icon: <HandCoins size={18} />,
      tone: 'emerald' as const,
    },
    {
      title: 'Outstanding Receivables',
      value: formatCurrency(dashboardMetrics.developer.buyerReceivable),
      description: 'Buyer balance due',
      icon: <ArrowDownRight size={18} />,
      tone: 'amber' as const,
    },
    {
      title: 'Total Vendor Spend',
      value: formatCurrency(dashboardMetrics.developer.vendorPaid),
      description: 'Vendor payments logged',
      icon: <ArrowUpRight size={18} />,
      tone: 'rose' as const,
    },
  ];

  const closeModal = () => {
    setQuickAction(null);
    setEditingTransaction(null);
  };

  const handleQuickSubmit = async (transaction: Transaction) => {
    if (editingTransaction) {
      await updateTransaction(transaction);
    } else {
      await addTransaction(transaction);
    }
    closeModal();
  };

  const activeModalTitle = editingTransaction
    ? 'Edit Transaction'
    : quickAction === 'collection'
      ? 'Add Collection'
      : 'Add Transaction';

  const activeSubmitLabel = editingTransaction
    ? 'Update Transaction'
    : quickAction === 'collection'
      ? 'Save Collection'
      : 'Save Transaction';

  return (
    <div className="oat-dashboard space-y-6 max-w-7xl mx-auto pb-10">
      <header className="dashboard-hero px-5 py-5 md:px-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="dashboard-badge dashboard-badge-slate">
              <SquareStack size={14} />
              Project overview
            </div>
            <div className="space-y-2">
              <h1 className="text-[2rem] font-semibold tracking-tight text-slate-950 md:text-[2.35rem]">{activeProject?.name || 'Project'} operations dashboard</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                A restrained internal dashboard for inventory, collections, vendor exposure, and project controls.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[22rem]">
            <div className="dashboard-toolbar p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="dashboard-primary-button" onClick={() => { setEditingTransaction(null); setQuickAction('transaction'); }}>
                  <Receipt size={16} />
                  Add Transaction
                </button>
                <button type="button" className="dashboard-secondary-button" onClick={() => { setEditingTransaction(null); setQuickAction('collection'); }}>
                  <Banknote size={16} />
                  Add Collection
                </button>
              </div>
            </div>

            <div className="dashboard-toolbar p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Allocation lens</p>
              <div className="dashboard-segmented-control inline-flex w-full">
                {(['Developer', 'Engineering'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`dashboard-segmented-option flex-1 ${viewMode === mode ? 'is-active' : ''}`}
                  >
                    {mode === 'Developer' ? 'Developer (Economic)' : 'Engineering (All Units)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section aria-label="Key performance indicators" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
        <article className="dashboard-surface overflow-hidden">
          <header className="dashboard-section-header">
            <div>
              <p className="dashboard-eyebrow">Transactions</p>
              <h2 className="dashboard-title">Recent transactions</h2>
            </div>
            <span className="dashboard-badge dashboard-badge-slate">{recentTransactions.length} latest entries</span>
          </header>

          <div className="overflow-x-auto">
            <table className="dashboard-table min-w-full text-left">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Unit</th>
                  <th>Details</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state-cell">No transactions recorded yet.</td>
                  </tr>
                ) : recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap text-slate-600">{transaction.date}</td>
                    <td>
                      <StatusBadge tone={getTransactionTone(transaction.side)}>
                        {transaction.side}
                      </StatusBadge>
                    </td>
                    <td>
                      <span className={`dashboard-badge ${(transaction.scope ?? TransactionScope.ProjectWide) === TransactionScope.ProjectWide ? 'dashboard-badge-indigo' : 'dashboard-badge-slate'}`}>
                        {(transaction.scope ?? TransactionScope.ProjectWide) === TransactionScope.ProjectWide ? 'Project wide' : 'Per unit'}
                      </span>
                    </td>
                    <td className="font-medium text-slate-900">{getTransactionUnitLabel(transaction) || '—'}</td>
                    <td>
                      <div className="space-y-1">
                        <p className="font-medium text-slate-800">{transaction.vendorName || transaction.description || 'Buyer receipt'}</p>
                        <p className="text-xs text-slate-500">{transaction.workPackage || transaction.description || 'No extra note'}</p>
                      </div>
                    </td>
                    <td className="text-right font-semibold text-slate-900">{formatCurrency(transaction.amount)}</td>
                    <td className="text-right">
                      <details className="action-menu inline-block text-left">
                        <summary className="action-menu-trigger" aria-label={`Actions for ${transaction.id || 'transaction'}`}>
                          <MoreHorizontal size={16} />
                        </summary>
                        <div className="action-menu-panel">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTransaction(transaction);
                              setQuickAction('transaction');
                            }}
                          >
                            Edit transaction
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm('Delete this transaction?')) {
                                const reason = window.prompt('Delete reason (required for audit trail):', 'Entered in error') || 'Entered in error';
                                await deleteTransaction(transaction.id, reason);
                              }
                            }}
                          >
                            Delete transaction
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="dashboard-surface">
            <header className="dashboard-section-header">
              <div>
                <p className="dashboard-eyebrow">Alerts</p>
                <h2 className="dashboard-title">Status and overdue</h2>
              </div>
              <BellRing size={18} className="text-amber-500" />
            </header>

            <div className="space-y-3">
              <AlertStat label="Overdue invoices" value={overdueInvoices.length.toString()} tone={overdueInvoices.length > 0 ? 'rose' : 'emerald'} />
              <AlertStat label="Units with buyer dues" value={pendingCollections.toString()} tone={pendingCollections > 0 ? 'amber' : 'slate'} />
              <AlertStat label="Pending vendor invoices" value={pendingVendorInvoices.length.toString()} tone={pendingVendorInvoices.length > 0 ? 'amber' : 'slate'} />
            </div>

            <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Vendor invoice queue</h3>
                <p className="mt-1 text-xs text-slate-500">Unsettled vendor invoices are shown here. Overdue ones are highlighted.</p>
              </div>

              <div className="space-y-2">
                {pendingVendorInvoices.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">No pending vendor invoices right now.</p>
                ) : pendingVendorInvoices.slice(0, 4).map((transaction) => {
                  const isOverdue = Boolean(transaction.dueDate && transaction.dueDate < today);
                  return (
                  <div key={transaction.id} className={`rounded-md border px-3 py-3 ${isOverdue ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${isOverdue ? 'text-rose-900' : 'text-amber-900'}`}>{transaction.vendorName || 'Vendor invoice'}</p>
                        <p className={`text-xs ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>
                          {transaction.dueDate ? `${isOverdue ? 'Overdue' : 'Due'} ${transaction.dueDate}` : `Invoice date ${transaction.date}`} • {getTransactionUnitLabel(transaction) || 'Project wide'}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>{formatCurrency(transaction.amount)}</span>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </article>

          <article className="dashboard-surface">
            <header className="dashboard-section-header">
              <div>
                <p className="dashboard-eyebrow">Snapshot</p>
                <h2 className="dashboard-title">Working balances</h2>
              </div>
            </header>

            <div className="grid gap-3">
              <BalanceItem label="Buyer receivable" value={formatCurrency(dashboardMetrics.developer.buyerReceivable)} tone="emerald" />
              <BalanceItem label="Vendor payable" value={formatCurrency(dashboardMetrics.developer.vendorPayable)} tone="rose" />
              <BalanceItem label="Vendor paid to date" value={formatCurrency(dashboardMetrics.developer.vendorPaid)} tone="amber" />
              <BalanceItem label="Projected profit" value={formatCurrency(dashboardMetrics.developer.profit)} tone={dashboardMetrics.developer.profit >= 0 ? 'blue' : 'rose'} />
            </div>
          </article>
        </aside>
      </section>

      <section className="dashboard-surface">
        <header className="dashboard-section-header border-b border-slate-200 pb-4">
          <div>
            <p className="dashboard-eyebrow">Sections</p>
            <h2 className="dashboard-title">Operational breakdown</h2>
          </div>
          <nav aria-label="Dashboard sections" className="dashboard-tabs flex flex-wrap gap-2">
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`dashboard-tab ${activeTab === tab ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        <div className="pt-6">
          {activeTab === 'Overview' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard title="Scope lens" value={viewMode === 'Developer' ? 'Developer economic view' : 'Engineering all-units view'} description="Switching the lens changes only which existing metrics are displayed." />
              <InfoCard title="Agreed sales value" value={formatCurrency(dashboardMetrics.developer.revenue)} description="Full agreed value of sold units, not cash received." />
              <InfoCard title="Cash received" value={formatCurrency(dashboardMetrics.developer.buyerCollections)} description="Buyer receipts actually logged so far." />
              <InfoCard title="Projected profit" value={formatCurrency(dashboardMetrics.developer.profit)} description="Agreed sales minus vendor cost exposure." />
            </div>
          )}

          {activeTab === 'Units' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <InfoCard title="Developer units" value={dashboardMetrics.developer.totalUnits.toString()} description="Total units included in developer metrics." />
              <InfoCard title="Sold inventory" value={soldUnits.length.toString()} description="Units currently marked sold." />
              <InfoCard title="Available inventory" value={availableUnits.length.toString()} description="Unsold developer units still available." />
            </div>
          )}

          {activeTab === 'Costs' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard title="Developer cost" value={formatCurrency(dashboardMetrics.developer.cost)} description="Economic allocation for developer-owned units." />
              <InfoCard title="Vendor paid" value={formatCurrency(dashboardMetrics.developer.vendorPaid)} description="Actual vendor cash paid to date." />
              <InfoCard title="Vendor payable" value={formatCurrency(dashboardMetrics.developer.vendorPayable)} description="Unpaid vendor invoices after matching by vendor." />
              <InfoCard title="Engineering total cost" value={formatCurrency(dashboardMetrics.engineering.totalCost)} description={`${dashboardMetrics.engineering.totalUnits} units in all-units allocation.`} />
              <InfoCard title="Engineering cost / sq ft" value={formatCurrency(Math.round(dashboardMetrics.engineering.costPerSqFt))} description={`${dashboardMetrics.engineering.totalArea.toFixed(0)} sqft total built-up area`} />
            </div>
          )}

          {activeTab === 'Collections' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="dashboard-subtle-card">
                <h3 className="text-sm font-semibold text-slate-900">Top receivables</h3>
                <div className="mt-4 space-y-3">
                  {topReceivables.length === 0 ? (
                    <p className="text-sm text-slate-500">No receivables pending.</p>
                  ) : topReceivables.map(({ unit, totals }) => (
                    <div key={getUnitKey(unit)} className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{getUnitCode(unit)}</p>
                        <p className="text-xs text-slate-500">{unit.buyerName || 'Buyer not assigned'}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">{formatCurrency(totals.buyerBalanceDue)}</span>
                    </div>
                  ))}
                </div>
              </article>
              <article className="dashboard-subtle-card">
                <h3 className="text-sm font-semibold text-slate-900">Collections posture</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BalanceItem label="Buyer receipts" value={formatCurrency(transactions.filter((transaction) => transaction.side === TransactionSide.BuyerReceipt).reduce((sum, transaction) => sum + transaction.amount, 0))} tone="emerald" />
                  <BalanceItem label="Units with buyer dues" value={pendingCollections.toString()} tone="amber" />
                </div>
              </article>
            </div>
          )}

          {activeTab === 'JV Summary' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="dashboard-subtle-card">
                <h3 className="text-sm font-semibold text-slate-900">Developer summary</h3>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailStat label="Agreed sales" value={formatCurrency(dashboardMetrics.developer.revenue)} />
                  <DetailStat label="Cash received" value={formatCurrency(dashboardMetrics.developer.buyerCollections)} />
                  <DetailStat label="Cost" value={formatCurrency(dashboardMetrics.developer.cost)} />
                  <DetailStat label="Projected profit" value={formatCurrency(dashboardMetrics.developer.profit)} />
                  <DetailStat label="Vendor payable" value={formatCurrency(dashboardMetrics.developer.vendorPayable)} />
                  <DetailStat label="Vendor paid to date" value={formatCurrency(dashboardMetrics.developer.vendorPaid)} />
                </dl>
              </article>
              <article className="dashboard-subtle-card">
                <h3 className="text-sm font-semibold text-slate-900">Engineering summary</h3>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailStat label="All units" value={dashboardMetrics.engineering.totalUnits.toString()} />
                  <DetailStat label="Total built-up area" value={`${dashboardMetrics.engineering.totalArea.toFixed(0)} sqft`} />
                  <DetailStat label="Total cost" value={formatCurrency(dashboardMetrics.engineering.totalCost)} />
                  <DetailStat label="Cost / sq ft" value={formatCurrency(Math.round(dashboardMetrics.engineering.costPerSqFt))} />
                </dl>
              </article>
            </div>
          )}
        </div>
      </section>

      {(quickAction || editingTransaction) && (
        <TransactionFormModal
          title={activeModalTitle}
          submitLabel={activeSubmitLabel}
          units={units}
          defaultUnitId={units[0]?.id}
          initialTransaction={editingTransaction || undefined}
          defaultSide={quickAction === 'collection' ? TransactionSide.BuyerReceipt : undefined}
          defaultScope={quickAction === 'collection' ? TransactionScope.PerUnit : undefined}
          hideScopeControl={quickAction === 'collection'}
          lockSide={quickAction === 'collection'}
          onClose={closeModal}
          onSubmit={handleQuickSubmit}
        />
      )}
    </div>
  );
};

const toneClasses = {
  slate: 'text-slate-700 bg-slate-100 border-slate-200',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  rose: 'text-rose-700 bg-rose-50 border-rose-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  indigo: 'text-indigo-700 bg-indigo-50 border-indigo-200',
};

const KpiCard: React.FC<{ title: string; value: string; description: string; icon: React.ReactNode; tone: keyof typeof toneClasses }> = ({ title, value, description, icon, tone }) => (
  <article className="dashboard-surface dashboard-kpi-card">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="dashboard-eyebrow">{title}</p>
        <h2 className="mt-2 text-[1.8rem] font-semibold tracking-tight text-slate-950">{value}</h2>
        <p className="mt-1.5 text-sm text-slate-500">{description}</p>
      </div>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${toneClasses[tone]}`}>
        {icon}
      </div>
    </div>
  </article>
);

const StatusBadge: React.FC<{ children: React.ReactNode; tone: keyof typeof toneClasses }> = ({ children, tone }) => (
  <span className={`dashboard-badge ${toneClasses[tone]}`}>{children}</span>
);

const AlertStat: React.FC<{ label: string; value: string; tone: keyof typeof toneClasses }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{value}</span>
  </div>
);

const BalanceItem: React.FC<{ label: string; value: string; tone: keyof typeof toneClasses }> = ({ label, value, tone }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</p>
    <p className={`mt-2 text-lg font-semibold ${toneClasses[tone].split(' ')[0]}`}>{value}</p>
  </div>
);

const InfoCard: React.FC<{ title: string; value: string; description: string }> = ({ title, value, description }) => (
  <article className="dashboard-subtle-card">
    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{title}</p>
    <h3 className="mt-2.5 text-2xl font-semibold tracking-tight text-slate-950">{value}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
  </article>
);

const DetailStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
    <dt className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{label}</dt>
    <dd className="mt-2 text-sm font-semibold text-slate-900">{value}</dd>
  </div>
);

function getTransactionTone(side: TransactionSide): keyof typeof toneClasses {
  if (side === TransactionSide.BuyerReceipt) return 'emerald';
  if (side === TransactionSide.VendorInvoice) return 'amber';
  return 'rose';
}

export default Dashboard;
