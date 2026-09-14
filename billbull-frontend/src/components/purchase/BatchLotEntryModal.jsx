import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Plus, Save, X } from 'lucide-react';

/**
 * Batch/expiry capture for a purchase line (GRN and Purchase Invoice share it).
 *
 * One row per *lot*, not per unit: "N units of this product share this batch number and this
 * expiry date". That matches how inventory identity is actually stored — the backend expands each
 * lot into N per-unit batch_master rows, exactly as stock-taking does — and it is why quantities
 * from different expiry dates can never be merged into one figure here.
 *
 * Backend validation is authoritative; everything below is there to catch mistakes before a save
 * round-trip, not instead of it.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyRow = (index) => ({
  key: `lot-${index}-${Date.now()}`,
  id: null,
  batchNumber: '',
  // Not captured in this modal any more; kept so an existing lot's value survives a re-save.
  manufacturingDate: '',
  expiryDate: '',
  quantity: ''
});

const buildRows = (batchLots, expectedQty) => {
  const source = Array.isArray(batchLots) ? batchLots : [];
  if (source.length === 0) {
    // Seed a single lot covering the whole line — the common case is one delivery, one expiry.
    const row = emptyRow(0);
    return [{ ...row, quantity: expectedQty > 0 ? String(expectedQty) : '' }];
  }
  return source.map((lot, index) => ({
    key: `lot-${index}-${lot?.id ?? 'new'}`,
    id: Number.isFinite(Number(lot?.id)) ? Number(lot.id) : null,
    batchNumber: lot?.batchNumber || '',
    manufacturingDate: lot?.manufacturingDate || '',
    expiryDate: lot?.expiryDate || '',
    quantity: lot?.quantity != null ? String(lot.quantity) : ''
  }));
};

const toQty = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const BatchLotEntryModal = ({
  isOpen,
  onClose,
  onSave,
  item,
  expectedQty = 0,
  expiryRequired = false,
  minExpiryDaysForSale = 0,
  fefoEnabled = false,
  disabled = false,
  title = 'Batch & Expiry'
}) => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setRows(buildRows(item?.batchLots, expectedQty));
  }, [isOpen, item, expectedQty]);

  const enteredQty = useMemo(
    () => rows.reduce((sum, row) => sum + toQty(row.quantity), 0),
    [rows]
  );

  const errors = useMemo(() => {
    const found = [];
    const today = todayIso();
    const seen = new Set();

    rows.forEach((row, index) => {
      const label = `Lot ${index + 1}`;
      const quantity = toQty(row.quantity);
      const hasAnything = row.batchNumber.trim() || row.expiryDate || quantity > 0;
      if (!hasAnything) return;

      if (quantity <= 0) {
        found.push(`${label}: quantity must be at least 1.`);
      }
      if (expiryRequired && !row.expiryDate) {
        found.push(`${label}: this product is expiry-controlled, so an expiry date is required.`);
      }
      if (row.expiryDate && row.expiryDate < today) {
        found.push(`${label}: expired on ${row.expiryDate}. Expired stock cannot be received.`);
      }

      const identity = `${row.batchNumber.trim().toUpperCase()}|${row.expiryDate}`;
      if (seen.has(identity)) {
        found.push(`${label}: duplicates another lot with the same batch number and expiry. Combine them into one lot.`);
      }
      seen.add(identity);
    });

    if (expectedQty > 0 && enteredQty > 0 && enteredQty !== expectedQty) {
      found.push(`Lot quantities total ${enteredQty} but the line receives ${expectedQty}.`);
    }
    return found;
  }, [rows, expectedQty, enteredQty, expiryRequired]);

  // Short shelf life is a sale-time restriction, not a receiving one — warn, never block.
  const warnings = useMemo(() => {
    if (!minExpiryDaysForSale || minExpiryDaysForSale <= 0) return [];
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + minExpiryDaysForSale);
    const thresholdIso = threshold.toISOString().slice(0, 10);
    return rows
      .filter(row => row.expiryDate && row.expiryDate >= todayIso() && row.expiryDate < thresholdIso)
      .map((row, index) => (
        `Lot ${index + 1} expires on ${row.expiryDate}, inside the ${minExpiryDaysForSale}-day minimum shelf life — it will not be sellable for its full life.`
      ));
  }, [rows, minExpiryDaysForSale]);

  if (!isOpen || !item) return null;

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(row => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const addRow = () => {
    setRows(prev => {
      const remaining = Math.max(expectedQty - prev.reduce((sum, r) => sum + toQty(r.quantity), 0), 0);
      const row = emptyRow(prev.length);
      return [...prev, { ...row, quantity: remaining > 0 ? String(remaining) : '' }];
    });
  };

  const removeRow = (key) => {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter(row => row.key !== key)));
  };

  const handleSave = () => {
    const cleaned = rows
      .map(row => ({
        id: row.id,
        batchNumber: row.batchNumber.trim() || null,
        manufacturingDate: row.manufacturingDate || null,
        expiryDate: row.expiryDate || null,
        quantity: toQty(row.quantity)
      }))
      .filter(row => row.quantity > 0 || row.expiryDate || row.batchNumber);

    onSave(cleaned);
    onClose();
  };

  const saveBlocked = disabled || errors.length > 0;

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-bold text-slate-800">{title} - {item.name}</h3>
            </div>
            <p className="text-xs text-slate-500">
              One row per batch. Units with different expiry dates must stay on separate rows — they
              are separate inventory lots{fefoEnabled ? ' and are issued oldest-expiry-first (FEFO).' : '.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs">
            <div className="text-slate-400 uppercase tracking-wide">Allocated</div>
            <div className={`font-bold ${enteredQty === expectedQty ? 'text-emerald-600' : 'text-slate-700'}`}>
              {enteredQty} / {expectedQty}
            </div>
          </div>
          {expiryRequired && (
            <span className="text-[11px] font-semibold text-amber-700 bg-[#FFF8E7] border border-[#FDE6A9] rounded-lg px-3 py-2">
              Expiry-controlled product — expiry date is mandatory
            </span>
          )}
        </div>

        <div className="max-h-[50vh] overflow-auto">
          <table className="bb-nowrap-table w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-12 text-center">#</th>
                <th className="p-3 min-w-[220px]">Batch No <span className="text-slate-400 font-normal">(blank = auto)</span></th>
                <th className="p-3 min-w-[150px]">Expiry Date{expiryRequired ? ' *' : ''}</th>
                <th className="p-3 w-28 text-center">Quantity</th>
                <th className="p-3 w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td className="p-3 text-center font-medium text-slate-400">{index + 1}</td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={row.batchNumber}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, 'batchNumber', e.target.value)}
                      placeholder="Supplier lot / leave blank"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      value={row.expiryDate}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, 'expiryDate', e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40 ${
                        expiryRequired && !row.expiryDate ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
                      }`}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                      className="w-full text-center border border-slate-200 rounded-lg px-2 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                    />
                  </td>
                  <td className="p-3 text-center">
                    {!disabled && rows.length > 1 && (
                      <button onClick={() => removeRow(row.key)} className="text-red-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && (
            <div className="p-3 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-3 py-1.5 bg-white shadow-sm"
              >
                <Plus size={12} /> Add Batch
              </button>
            </div>
          )}
        </div>

        {(errors.length > 0 || warnings.length > 0) && (
          <div className="px-6 py-3 border-t border-slate-100 space-y-1">
            {errors.map((message) => (
              <div key={message} className="flex items-start gap-2 text-[11px] text-red-600">
                <AlertTriangle size={13} className="mt-[1px] shrink-0" /> {message}
              </div>
            ))}
            {warnings.map((message) => (
              <div key={message} className="flex items-start gap-2 text-[11px] text-amber-700">
                <AlertTriangle size={13} className="mt-[1px] shrink-0" /> {message}
              </div>
            ))}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          {!disabled && (
            <button
              onClick={handleSave}
              disabled={saveBlocked}
              className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2 ${
                saveBlocked
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'text-slate-900 bg-[#F5C742] hover:bg-[#E5B732]'
              }`}
            >
              <Save size={14} /> Save Batches
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchLotEntryModal;
