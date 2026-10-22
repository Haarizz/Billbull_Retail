// Extracted verbatim from POSSales.jsx (R18 - Cash Drop/Out Dialog).
// Behaviour is unchanged; only the location moved. The dialog state, the field setters, the
// category-loading effect and handleCashDrop all stay in POSSales and are passed straight through.

import React from 'react';
import { ArrowDown, ArrowUp, CheckCircle, X } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';

function CashDropDialog({
  open,
  onOpenChange,
  cashDropType,
  onCashDropTypeChange,
  cashDropAmount,
  onCashDropAmountChange,
  cashDropCategories,
  cashDropCategoryRequired,
  cashDropCategoryId,
  onCashDropCategoryIdChange,
  cashDropDescription,
  onCashDropDescriptionChange,
  onClose,
  onRecord,
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${cashDropType === 'in' ? 'bg-[#327F74]/10' : 'bg-red-50'}`}>
                  {cashDropType === 'in'
                    ? <ArrowDown className="h-5 w-5 text-[#327F74]" />
                    : <ArrowUp className="h-5 w-5 text-red-500" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E293B]">Cash Drop / Out</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Record cash movements other than sales</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Type dropdown */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <div className="relative">
                <select
                  value={cashDropType}
                  onChange={onCashDropTypeChange}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer"
                >
                  <option value="in">Cash Drop (IN) - Add cash to drawer</option>
                  <option value="out">Cash Out - Pay for expenses</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Amount (AED)</label>
              <input
                type="number"
                value={cashDropAmount}
                onChange={onCashDropAmountChange}
                placeholder="0.00"
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>

            {/* Category (Phase 2 — optional unless the branch requires it) */}
            {(cashDropCategories.length > 0 || cashDropCategoryRequired) && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Category{cashDropCategoryRequired ? ' *' : ' (optional)'}
                </label>
                <select
                  value={cashDropCategoryId}
                  onChange={onCashDropCategoryIdChange}
                  className="w-full h-11 pl-4 pr-10 text-sm font-medium text-[#1E293B] border border-gray-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40 cursor-pointer"
                >
                  <option value="">{cashDropCategoryRequired ? 'Select a category...' : 'Uncategorized'}</option>
                  {cashDropCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description / Purpose</label>
              <input
                type="text"
                value={cashDropDescription}
                onChange={onCashDropDescriptionChange}
                placeholder={cashDropType === 'in' ? 'e.g., Cash from admin safe' : 'e.g., Office supplies, Cleaning'}
                className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#327F74]/30 focus:border-[#327F74]/40"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onRecord}
              className={`h-10 px-6 text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors ${cashDropType === 'in'
                  ? 'bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B]'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
            >
              <CheckCircle className="h-4 w-4" />
              Record {cashDropType === 'in' ? 'Cash Drop' : 'Cash Out'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
  );
}

export default CashDropDialog;
