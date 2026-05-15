import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../types';
import { getUnitCode } from '../utils';

interface UnitFormModalProps {
  initialUnit?: Unit;
  existingIds: string[];
  title: string;
  submitLabel?: string;
  onSubmit: (unit: Unit) => Promise<void> | void;
  onClose: () => void;
}

const UnitFormModal: React.FC<UnitFormModalProps> = ({ initialUnit, existingIds, title, submitLabel = 'Save', onSubmit, onClose }) => {
  const [tower, setTower] = useState<Unit['tower']>(initialUnit?.tower || 'A');
  const [flatNumber, setFlatNumber] = useState(initialUnit?.flatNumber || '');
  const [floor, setFloor] = useState(initialUnit?.floor?.toString() || '1');
  const [bhk, setBhk] = useState<Unit['bhk']>(initialUnit?.bhk || '2BHK');
  const [carpetArea, setCarpetArea] = useState(initialUnit?.carpetAreaSqFt?.toString() || '0');
  const [saleableArea, setSaleableArea] = useState(initialUnit?.saleableAreaSqFt?.toString() || '0');
  const [rate, setRate] = useState(initialUnit?.ratePerSqFt?.toString() || '0');
  const [amenities, setAmenities] = useState(initialUnit?.amenitiesCost?.toString() || '0');
  const [adjustments, setAdjustments] = useState(initialUnit?.adjustments?.toString() || '0');
  const [buyerName, setBuyerName] = useState(initialUnit?.buyerName || '');
  const [buyerPhone, setBuyerPhone] = useState(initialUnit?.buyerPhone || '');
  const [handoverTarget, setHandoverTarget] = useState(initialUnit?.handoverTarget || '');
  const [ownershipType, setOwnershipType] = useState<Unit['ownershipType']>(initialUnit?.ownershipType || 'Developer');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const computedUnitId = useMemo(() => `${tower.trim().toUpperCase()}${flatNumber.trim()}`, [tower, flatNumber]);

  useEffect(() => {
    setError(null);
  }, [tower, flatNumber, floor, bhk, carpetArea, saleableArea, rate, amenities, adjustments, buyerName, buyerPhone, handoverTarget, ownershipType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedTower = tower.trim().toUpperCase();
    const normalizedFlat = flatNumber.trim();
    if (!normalizedTower) {
      setError('Tower is required.');
      return;
    }

    if (!normalizedFlat) {
      setError('Flat number is required.');
      return;
    }

    const normalizedId = `${normalizedTower}${normalizedFlat}`;
    const idExists = existingIds.includes(normalizedId) && normalizedId !== (initialUnit ? getUnitCode(initialUnit) : undefined);
    if (idExists) {
      setError('Unit ID must be unique.');
      return;
    }

    const numberFields = [
      { label: 'Floor', value: floor },
      { label: 'Carpet Area', value: carpetArea },
      { label: 'Total Built-up Area', value: saleableArea },
      { label: 'Rate', value: rate },
      { label: 'Amenities', value: amenities }
    ];

    for (const field of numberFields) {
      if (parseFloat(field.value) < 0) {
        setError(`${field.label} cannot be negative.`);
        return;
      }
    }

    const floorNum = parseInt(floor, 10) || 0;
    const carpetNum = parseFloat(carpetArea) || 0;
    const rateNum = parseFloat(rate) || 0;
    const saleableNum = parseFloat(saleableArea) || 0;
    const amenitiesNum = parseFloat(amenities) || 0;
    const adjustmentsNum = parseFloat(adjustments) || 0;

    const newUnit: Unit = {
      id: initialUnit?.id,
      tower: normalizedTower,
      flatNumber: normalizedFlat,
      floor: floorNum,
      bhk,
      carpetAreaSqFt: carpetNum,
      saleableAreaSqFt: saleableNum,
      ratePerSqFt: rateNum,
      amenitiesCost: amenitiesNum,
      adjustments: adjustmentsNum,
      buyerName,
      buyerPhone,
      ownershipType,
      handoverTarget: handoverTarget || undefined,
      isSold: ownershipType === "Developer" ? Boolean(buyerName.trim()) : false,
      isSettled: initialUnit?.isSettled ?? false
    };

    setSaving(true);
    try {
      await onSubmit(newUnit);
      onClose();
    } catch (submitError: any) {
      console.error('Error saving unit', submitError);
      setError(submitError?.message || 'Failed to save unit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-lg text-primary">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && <div className="text-rose-600 text-sm bg-rose-50 border border-rose-100 px-3 py-2 rounded">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Tower *</label>
              <input
                type="text"
                value={tower}
                onChange={(e) => setTower(e.target.value.toUpperCase())}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                placeholder="e.g. A"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Flat Number *</label>
              <input
                type="text"
                value={flatNumber}
                onChange={(e) => setFlatNumber(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                placeholder="e.g. 102"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Unit ID (auto)</label>
              <input
                type="text"
                value={computedUnitId}
                readOnly
                className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Floor *</label>
              <input
                type="number"
                min="0"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">BHK *</label>
              <select value={bhk} onChange={(e) => setBhk(e.target.value as Unit['bhk'])} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none">
                <option value="2BHK">2BHK</option>
                <option value="3BHK">3BHK</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Carpet Area (sq ft) *</label>
              <input
                type="number"
                min="0"
                value={carpetArea}
                onChange={(e) => setCarpetArea(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Total Built-up Area (sq ft) *</label>
              <input
                type="number"
                min="0"
                value={saleableArea}
                onChange={(e) => setSaleableArea(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Rate (₹/sq ft) *</label>
              <input
                type="number"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amenities (₹) *</label>
              <input
                type="number"
                min="0"
                value={amenities}
                onChange={(e) => setAmenities(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Adjustments (₹)</label>
              <input
                type="number"
                value={adjustments}
                onChange={(e) => setAdjustments(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Handover Target</label>
              <input
                type="date"
                value={handoverTarget}
                onChange={(e) => setHandoverTarget(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ownership</label>
              <select
                value={ownershipType}
                onChange={(e) => setOwnershipType(e.target.value as Unit['ownershipType'])}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
              >
                <option value="Developer">Developer</option>
                <option value="Landowner">Landowner</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Buyer Name</label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Buyer Phone</label>
              <input
                type="text"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 px-4 py-2 bg-primary text-white rounded-lg font-semibold ${saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-primary/90'}`}
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnitFormModal;
