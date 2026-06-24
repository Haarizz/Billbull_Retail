import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Hash, Save, X } from 'lucide-react';

const buildRows = (serials = [], expectedQty = 0) => {
  const normalized = Array.isArray(serials) ? serials : [];
  const rows = [];
  const count = Math.max(expectedQty || 0, normalized.length);

  for (let index = 0; index < count; index += 1) {
    const existing = normalized[index] || {};
    rows.push({
      id: existing.id || `serial-${index + 1}`,
      serialNumber: existing.serialNumber || '',
      manufacturingDate: existing.manufacturingDate || '',
      expiryDate: existing.expiryDate || ''
    });
  }

  return rows;
};

const toPersistedId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numericId = Number(value);
  return Number.isFinite(numericId) ? numericId : null;
};

const SerialEntryModal = ({
  isOpen,
  onClose,
  onSave,
  item,
  expectedQty = 0,
  disabled = false,
  title = 'Serial Entry'
}) => {
  const [rows, setRows] = useState([]);
  const [pasteValue, setPasteValue] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setRows(buildRows(item?.serials, expectedQty));
    setPasteValue('');
  }, [isOpen, item, expectedQty]);

  const enteredCount = useMemo(
    () => rows.filter(row => row.serialNumber && row.serialNumber.trim()).length,
    [rows]
  );

  if (!isOpen || !item) return null;

  const updateRow = (index, field, value) => {
    setRows(prev => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const applyBulkPaste = () => {
    const values = pasteValue
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean);

    if (values.length === 0) return;

    setRows(prev => {
      const nextLength = Math.max(prev.length, values.length, expectedQty || 0);
      const expanded = Array.from({ length: nextLength }, (_, index) => {
        const existing = prev[index] || {};
        return {
          id: existing.id || `serial-${index + 1}`,
          serialNumber: existing.serialNumber || '',
          manufacturingDate: existing.manufacturingDate || '',
          expiryDate: existing.expiryDate || ''
        };
      });

      return expanded.map((row, index) => ({
        ...row,
        serialNumber: values[index] || row.serialNumber
      }));
    });
    setPasteValue('');
  };

  const handleSave = () => {
    const cleaned = rows
      .map(row => ({
        id: toPersistedId(row.id),
        serialNumber: row.serialNumber?.trim() || '',
        manufacturingDate: row.manufacturingDate || null,
        expiryDate: row.expiryDate || null
      }))
      .filter(row => row.serialNumber);

    onSave(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Hash className="h-4 w-4 text-[#F5C742]" />
              <h3 className="font-bold text-slate-800">{title} - {item.name}</h3>
            </div>
            <p className="text-xs text-slate-500">
              Enter one serial per physical unit. Save is allowed before completion; posting will require all {expectedQty} serials.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-col lg:flex-row gap-4 lg:items-end">
          <div className="flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block mb-1.5">
              Bulk Paste
            </label>
            <textarea
              value={pasteValue}
              disabled={disabled}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder="Paste one serial number per line"
              className="w-full min-h-[88px] text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#F5C742]/40 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs">
              <div className="text-slate-400 uppercase tracking-wide">Entered</div>
              <div className="font-bold text-slate-700">{enteredCount} / {expectedQty}</div>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={applyBulkPaste}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 ${disabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              <ClipboardPaste size={14} /> Apply Paste
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto">
          <table className="bb-nowrap-table w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-14 text-center">#</th>
                <th className="p-3 min-w-[260px]">Serial Number</th>
                <th className="p-3 min-w-[160px]">Manufacturing Date</th>
                <th className="p-3 min-w-[160px]">Expiry Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="p-3 text-center font-medium text-slate-400">{index + 1}</td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={row.serialNumber}
                      disabled={disabled}
                      onChange={(e) => updateRow(index, 'serialNumber', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                      placeholder={`Serial ${index + 1}`}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      value={row.manufacturingDate || ''}
                      disabled={disabled}
                      onChange={(e) => updateRow(index, 'manufacturingDate', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="date"
                      value={row.expiryDate || ''}
                      disabled={disabled}
                      onChange={(e) => updateRow(index, 'expiryDate', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-[#F5C742]/40"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          {!disabled && (
            <button onClick={handleSave} className="px-4 py-2 text-xs font-bold text-slate-900 bg-[#F5C742] rounded-lg hover:bg-[#E5B732] shadow-sm transition-colors flex items-center gap-2">
              <Save size={14} /> Save Serials
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SerialEntryModal;
