import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { getBatchSelectionOptions } from '../api/batchSelectionApi';
import {
  clearDeliveryNoteBatchSelection,
  saveDeliveryNoteBatchSelection
} from '../api/deliveryNoteApi';

const formatDate = (value) => value ? String(value).slice(0, 10) : '-';

const daysRemaining = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};

const warningFor = (row, minExpiryDaysForSale = 0) => {
  if (row?.warningLevel) return row.warningLevel;
  const days = row?.daysRemaining ?? daysRemaining(row?.expiryDate);
  if (days == null) return 'GREEN';
  if (days < 7 || days < Number(minExpiryDaysForSale || 0)) return 'RED';
  if (days <= 30) return 'AMBER';
  return 'GREEN';
};

const warningClass = (level) => {
  if (level === 'RED') return 'bg-red-100 text-red-700 border-red-200';
  if (level === 'AMBER') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
};

const asRow = (selection) => ({
  batchMasterId: selection.batchMasterId,
  batchNumber: selection.batchNumber,
  expiryDate: selection.expiryDate,
  manufacturingDate: selection.manufacturingDate,
  entryDate: selection.entryDate,
  qtyUnitNo: selection.qtyUnitNo,
  availableUnits: selection.quantity || 1,
  selectedQuantity: selection.quantity || 1,
  daysRemaining: daysRemaining(selection.expiryDate),
  warningLevel: null,
  blockedReason: null,
  reserved: true
});

const BatchSelectionModal = ({
  isOpen,
  onClose,
  onSaved,
  deliveryNoteId,
  itemId,
  itemCode,
  itemName,
  locationCode,
  requiredQuantity,
  fefoEnabled = true,
  minExpiryDaysForSale = 0,
  currentSelections = [],
  canManualSelect = false
}) => {
  const [mode, setMode] = useState(fefoEnabled ? 'AUTO_FEFO' : 'MANUAL');
  const [options, setOptions] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const required = Math.max(0, Number(requiredQuantity) || 0);

  useEffect(() => {
    if (!isOpen) return;
    setMode(fefoEnabled ? 'AUTO_FEFO' : 'MANUAL');
    setSelectedIds((currentSelections || []).map(row => row.batchMasterId).filter(Boolean));
    setError('');
  }, [isOpen, fefoEnabled, currentSelections]);

  useEffect(() => {
    if (!isOpen || !itemCode || !locationCode || required <= 0) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    getBatchSelectionOptions({ itemCode, locationCode, requiredQuantity: required })
      .then(data => {
        if (!cancelled) setOptions(data);
      })
      .catch(err => {
        if (!cancelled) {
          const message = err?.response?.data?.message || err?.response?.data || 'Failed to load batch options.';
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, itemCode, locationCode, required]);

  const currentRows = useMemo(
    () => (currentSelections || []).map(asRow),
    [currentSelections]
  );

  const manualRows = useMemo(() => {
    const map = new Map();
    currentRows.forEach(row => map.set(row.batchMasterId, row));
    (options?.availableBatches || []).forEach(row => map.set(row.batchMasterId, row));
    return Array.from(map.values()).sort((a, b) => {
      const aExpiry = a.expiryDate || '9999-12-31';
      const bExpiry = b.expiryDate || '9999-12-31';
      if (aExpiry !== bExpiry) return aExpiry.localeCompare(bExpiry);
      const aEntry = a.entryDate || '9999-12-31';
      const bEntry = b.entryDate || '9999-12-31';
      if (aEntry !== bEntry) return aEntry.localeCompare(bEntry);
      return Number(a.qtyUnitNo || 0) - Number(b.qtyUnitNo || 0);
    });
  }, [currentRows, options]);

  const fefoRows = currentRows.length > 0 ? currentRows : (options?.fefoSelection || []);
  const selectedCount = selectedIds.length;
  const canSaveManual = mode === 'MANUAL' && canManualSelect && selectedCount === required;
  const canSaveFefo = mode === 'AUTO_FEFO' && (options?.sufficient || currentRows.length === required);

  if (!isOpen) return null;

  const toggleManualRow = (row) => {
    if (row.blockedReason) return;
    setSelectedIds(prev => {
      if (prev.includes(row.batchMasterId)) {
        return prev.filter(id => id !== row.batchMasterId);
      }
      if (prev.length >= required) {
        return prev;
      }
      return [...prev, row.batchMasterId];
    });
  };

  const handleSave = async () => {
    if (mode === 'MANUAL' && !canManualSelect) {
      setError('Manual batch selection permission is required.');
      return;
    }
    if (mode === 'MANUAL' && selectedIds.length !== required) {
      setError(`Selected ${selectedIds.length} of ${required} required.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await saveDeliveryNoteBatchSelection(deliveryNoteId, itemId, {
        mode,
        locationCode,
        requiredQuantity: required,
        batchMasterIds: mode === 'MANUAL' ? selectedIds : []
      });
      await onSaved?.(response);
      onClose();
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data || 'Failed to save batch selection.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await clearDeliveryNoteBatchSelection(deliveryNoteId, itemId);
      await onSaved?.(response);
      setSelectedIds([]);
      onClose();
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data || 'Failed to clear batch selection.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-lg shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Batch Selection</div>
            <h3 className="text-lg font-bold text-slate-900 mt-1">{itemCode} {itemName ? `- ${itemName}` : ''}</h3>
            <div className="text-xs text-slate-500 mt-1">
              Location: <span className="font-semibold text-slate-700">{locationCode || '-'}</span>
              <span className="mx-2">|</span>
              Required: <span className="font-semibold text-slate-700">{required}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs font-bold">
            <button
              type="button"
              disabled={!fefoEnabled}
              onClick={() => setMode('AUTO_FEFO')}
              className={`px-4 py-2 ${mode === 'AUTO_FEFO' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              FEFO Auto
            </button>
            {canManualSelect && (
              <button
                type="button"
                onClick={() => setMode('MANUAL')}
                className={`px-4 py-2 border-l border-slate-200 ${mode === 'MANUAL' ? 'bg-[#F5C742] text-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Switch to Manual Override
              </button>
            )}
          </div>

          <div className={`px-3 py-1.5 rounded-md border text-xs font-bold ${
            selectedCount === required || (mode === 'AUTO_FEFO' && fefoRows.length === required)
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            Selected {mode === 'AUTO_FEFO' ? fefoRows.length : selectedCount} of {required} required
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="min-h-[220px] flex items-center justify-center text-slate-500">
              <RefreshCw size={18} className="animate-spin mr-2" />
              Loading batches...
            </div>
          ) : mode === 'AUTO_FEFO' ? (
            <div className="space-y-3">
              {!fefoEnabled && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  FEFO is disabled for this product.
                </div>
              )}
              {!options?.sufficient && currentRows.length === 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {options?.message || 'Insufficient Batch Stock.'}
                </div>
              )}
              <BatchTable
                rows={fefoRows}
                minExpiryDaysForSale={minExpiryDaysForSale}
                readOnly
              />
            </div>
          ) : (
            <div className="space-y-3">
              {!canManualSelect && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                  Manual batch selection permission is required.
                </div>
              )}
              <BatchTable
                rows={manualRows}
                minExpiryDaysForSale={minExpiryDaysForSale}
                selectedIds={selectedIds}
                onToggle={toggleManualRow}
                manual
              />
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving || currentRows.length === 0}
            className="px-4 py-2 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear Selection
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (mode === 'MANUAL' ? !canSaveManual : !canSaveFefo)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={14} />
              {saving ? 'Saving...' : 'Confirm Selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const BatchTable = ({ rows, selectedIds = [], onToggle, minExpiryDaysForSale, manual = false, readOnly = false }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200">
    <table className="w-full min-w-[820px] text-xs text-left">
      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
        <tr>
          {manual && <th className="px-3 py-3 text-center w-12"></th>}
          <th className="px-4 py-3">Batch Number</th>
          <th className="px-4 py-3">Expiry Date</th>
          <th className="px-4 py-3">Manufacturing Date</th>
          <th className="px-4 py-3">Entry Date</th>
          <th className="px-4 py-3 text-center">Available Units</th>
          <th className="px-4 py-3 text-center">Days Remaining</th>
          <th className="px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={manual ? 8 : 7} className="px-4 py-10 text-center text-slate-400">
              No available batches found.
            </td>
          </tr>
        ) : rows.map(row => {
          const selected = selectedIds.includes(row.batchMasterId);
          const warning = warningFor(row, minExpiryDaysForSale);
          const disabled = Boolean(row.blockedReason);

          return (
            <tr key={row.batchMasterId || row.batchNumber} className={`${selected ? 'bg-yellow-50/70' : 'bg-white'} ${disabled ? 'opacity-60' : ''}`}>
              {manual && (
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onToggle?.(row)}
                    className="rounded text-[#F5C742] focus:ring-[#F5C742] disabled:cursor-not-allowed"
                  />
                </td>
              )}
              <td className="px-4 py-3 font-mono font-bold text-slate-700">{row.batchNumber}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(row.expiryDate)}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(row.manufacturingDate)}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(row.entryDate)}</td>
              <td className="px-4 py-3 text-center font-bold text-slate-700">{row.availableUnits || 1}</td>
              <td className="px-4 py-3 text-center font-medium text-slate-600">
                {row.daysRemaining ?? daysRemaining(row.expiryDate) ?? '-'}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-1 rounded border text-[10px] font-bold ${warningClass(warning)}`}>
                  {row.blockedReason ? `Blocked: ${row.blockedReason}` : warning}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default BatchSelectionModal;
