import { confirmAction } from '../utils/confirmAction';
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/appContext';
import { formatCurrency, getUnitCode, getUnitKey, recomputeUnitTotals } from '../utils/utils';
import { OwnershipType, Unit } from '../types/types';
import { Filter, Plus, Search } from 'lucide-react';
import UnitFormModal from './UnitFormModal';

const UnitList: React.FC = () => {
  const { canEdit, activeProject, units, transactions, updateUnit, addUnit, deleteUnit } = useApp();

  // Filters
  const [filterTower, setFilterTower] = useState<string>('All');
  const [filterBHK, setFilterBHK] = useState<'All' | '2BHK' | '3BHK'>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Sold' | 'Unsold' | 'Landowner'>('All');
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [costView, setCostView] = useState<'Developer' | 'Engineering'>('Developer');

  const unitTotals = useMemo(() => recomputeUnitTotals(units, transactions), [units, transactions]);

  const processedUnits = useMemo(() => {
    return units.map((unit) => ({ unit, totals: unitTotals[getUnitKey(unit)] }));
  }, [units, unitTotals]);

  const filteredUnits = processedUnits.filter(({ unit, totals }) => {
    const unitCode = getUnitCode(unit);
    if (filterTower !== 'All' && unit.tower !== filterTower) return false;
    if (filterBHK !== 'All' && unit.bhk !== filterBHK) return false;
    if (filterStatus !== 'All' && totals.status !== filterStatus) return false;
    if (
      search &&
      !unitCode.toLowerCase().includes(search.toLowerCase()) &&
      !unit.buyerName.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary">Units List</h2>
          <p className="text-slate-500">Sales control view and individual unit status.</p>
        </div>
        <button
          disabled={!canEdit}
          onClick={() => {
            setModalMode('add');
            setActiveUnit(null);
            setIsUnitModalOpen(true);
          }}
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold shadow shadow-primary/20 hover:bg-primary/90"
        >
          <Plus size={16} /> Add Unit
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search Unit ID or Buyer Name..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0">
          <FilterSelect
            label="Tower"
            value={filterTower}
            onChange={(v) => setFilterTower(v as any)}
            options={['All', ...new Set(units.map((u) => u.tower))].sort()}
          />
          <FilterSelect
            label="BHK"
            value={filterBHK}
            onChange={(v) => setFilterBHK(v as any)}
            options={['All', '2BHK', '3BHK']}
          />
          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as any)}
            options={['All', 'Sold', 'Unsold', 'Landowner']}
          />
        </div>
        <div className="flex items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <span className="text-xs font-semibold text-slate-500 mr-2">Cost View:</span>
          <select
            value={costView}
            onChange={(e) => setCostView(e.target.value as 'Developer' | 'Engineering')}
            className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="Developer">Developer Only (Economic)</option>
            <option value="Engineering">All Units (Engineering)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">Unit</th>
                <th className="px-6 py-4">Specs</th>
                <th className="px-6 py-4 text-right">Agreed Price</th>
                <th className="px-6 py-4">Buyer</th>
                <th className="px-6 py-4 text-right">Paid by Buyer</th>
                <th className="px-6 py-4 text-right">Balance Due</th>
                <th className="px-6 py-4 text-right">
                  Unit Cost ({costView === 'Developer' ? 'Economic' : 'Engineering'})
                </th>
                <th className="px-6 py-4 text-right">Vendor Payable</th>
                <th className="px-6 py-4 text-right">Margin</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    No units yet
                  </td>
                </tr>
              ) : (
                filteredUnits.map(({ unit, totals }) => {
                  const unitCode = getUnitCode(unit);
                  return (
                    <tr key={getUnitKey(unit)} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-primary text-lg flex items-center gap-2">
                          {unitCode}
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${unit.ownershipType === OwnershipType.Developer ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}
                          >
                            {unit.ownershipType}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Tower {unit.tower} · Flat {unit.flatNumber}
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${totals.status === 'Sold' ? 'bg-blue-100 text-blue-800' : totals.status === 'Unsold' ? 'bg-slate-100 text-slate-600' : 'bg-purple-100 text-purple-800'}`}
                        >
                          {totals.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>
                          {unit.bhk} • Floor {unit.floor}
                        </div>
                        <div className="text-xs text-slate-400">
                          Carpet {unit.carpetAreaSqFt} sqft
                        </div>
                        <div className="text-xs text-slate-400">
                          Total built-up {unit.saleableAreaSqFt} sqft
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {unit.ownershipType === OwnershipType.Landowner ? (
                          <div className="flex flex-col items-end">
                            <span>{formatCurrency(totals.agreedPrice)}</span>
                            <span className="text-xs text-slate-400">Reference value</span>
                          </div>
                        ) : (
                          formatCurrency(totals.agreedPrice)
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {unit.buyerName ? (
                          <>
                            <div className="font-medium text-slate-900">{unit.buyerName}</div>
                            <div className="text-xs text-slate-400">
                              {unit.handoverTarget ? `Handover: ${unit.handoverTarget}` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600">
                        {unit.ownershipType === OwnershipType.Landowner
                          ? '—'
                          : formatCurrency(totals.buyerReceipts)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {unit.ownershipType === OwnershipType.Landowner || !unit.isSold ? (
                          '—'
                        ) : totals.buyerBalanceDue > 0 ? (
                          <span className="font-bold text-green-600">
                            {formatCurrency(totals.buyerBalanceDue)}
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            {totals.buyerCredit > 0
                              ? `${formatCurrency(totals.buyerCredit)} credit`
                              : 'Settled'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {costView === 'Developer' &&
                        unit.ownershipType === OwnershipType.Landowner ? (
                          <span className="text-slate-400">0 (economic)</span>
                        ) : (
                          <span className="font-medium text-slate-700">
                            {formatCurrency(
                              costView === 'Developer'
                                ? totals.economic.totalCost
                                : totals.engineering.totalCost,
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {costView === 'Developer' &&
                        unit.ownershipType === OwnershipType.Landowner ? (
                          '—'
                        ) : (costView === 'Developer'
                            ? totals.economic.vendorPayable
                            : totals.engineering.vendorPayable) > 0 ? (
                          <span className="font-bold text-rose-600">
                            {formatCurrency(
                              costView === 'Developer'
                                ? totals.economic.vendorPayable
                                : totals.engineering.vendorPayable,
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {unit.ownershipType === OwnershipType.Developer ? (
                          <span
                            className={
                              costView === 'Developer'
                                ? totals.unitRevenue - totals.economic.totalCost >= 0
                                  ? 'text-green-700 font-semibold'
                                  : 'text-rose-600 font-semibold'
                                : totals.unitRevenue - totals.engineering.totalCost >= 0
                                  ? 'text-green-700 font-semibold'
                                  : 'text-rose-600 font-semibold'
                            }
                          >
                            {formatCurrency(
                              costView === 'Developer'
                                ? totals.unitRevenue - totals.economic.totalCost
                                : totals.unitRevenue - totals.engineering.totalCost,
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            disabled={!canEdit}
                            onClick={() => {
                              setActiveUnit(unit);
                              setModalMode('edit');
                              setIsUnitModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-slate-200 text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            disabled={!canEdit}
                            onClick={async () => {
                              await confirmAction(
                                'Archive this unit? Units with financial history cannot be archived.',
                                'Duplicate unit',
                                (reason) => deleteUnit(unit.id, reason),
                              );
                            }}
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-slate-200 text-xs font-medium rounded text-rose-600 bg-white hover:bg-rose-50 transition-colors"
                          >
                            Archive
                          </button>
                          <Link
                            to={
                              activeProject && unit.id
                                ? `/p/${activeProject.id}/units/${unit.id}`
                                : '#'
                            }
                            className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {filteredUnits.length === 0 && units.length > 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    No units match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isUnitModalOpen && (
        <UnitFormModal
          initialUnit={modalMode === 'edit' ? activeUnit || undefined : undefined}
          existingIds={units.map(getUnitCode)}
          title={
            modalMode === 'add' ? 'Add Unit' : `Edit ${activeUnit ? getUnitCode(activeUnit) : ''}`
          }
          submitLabel={modalMode === 'add' ? 'Save Unit' : 'Update Unit'}
          onClose={() => {
            setIsUnitModalOpen(false);
            setActiveUnit(null);
          }}
          onSubmit={async (unitData) => {
            if (modalMode === 'add') {
              await addUnit({ ...unitData, isSettled: false });
            } else if (activeUnit) {
              await updateUnit({ ...unitData, id: activeUnit.id });
            }
          }}
        />
      )}
    </div>
  );
};

const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}> = ({ label, value, onChange, options }) => (
  <div className="flex items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
    <span className="text-xs font-semibold text-slate-500 mr-2">{label}:</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

export default UnitList;
