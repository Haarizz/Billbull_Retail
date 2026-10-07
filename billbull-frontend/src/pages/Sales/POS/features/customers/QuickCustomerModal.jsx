import React, { useEffect, useRef } from 'react';
import { User, X, AlertTriangle, AlertCircle } from 'lucide-react';

import { usePosInputV2, usePosOverlay } from '../../input/PosOverlayContext';
import { POS_SCOPES } from '../../input/posScope';

/**
 * QuickCustomerModal
 *
 * The POS "Quick Create & Auto-Assign Customer" dialog. This markup used to live inline
 * inside POSTouchScreen.jsx, which meant the compact (TradePOS) template could call
 * openQuickCustomerModal — the button sits right there in its customer dropdown — and
 * nothing ever appeared, because the only renderer of the dialog was the layout the
 * compact template replaces. It is a shared component now, so every template renders the
 * same dialog from the same POSSales-owned state.
 *
 * Purely presentational: the form state and both writers (handleSaveQuickCustomer,
 * setSelectedCustomer) stay owned by POSSales.jsx.
 */
export default function QuickCustomerModal({
  show,
  form,
  setForm,
  duplicateWarning,
  loading,
  error,
  onClose,
  onSave,
  setSelectedCustomer,
  showFeedback
}) {
  const nameInputRef = useRef(null);

  // The cashier typed the customer into the search box a moment ago; land the caret in the
  // form instead of making them click into it.
  useEffect(() => {
    if (!show) return undefined;
    const timer = window.setTimeout(() => nameInputRef.current?.focus?.(), 60);
    return () => window.clearTimeout(timer);
  }, [show]);

  // Esc closes. posInputV2: delivered by the POS input controller through this registration
  // (which also keeps scans out of the sale while the dialog is open); otherwise the legacy
  // window listener below does it.
  const posInputV2 = usePosInputV2();
  usePosOverlay({ open: Boolean(show), scope: POS_SCOPES.MODAL, onEscape: () => onClose?.() });
  useEffect(() => {
    if (!show || posInputV2) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, posInputV2, onClose]);

  if (!show || !form) return null;

  const hasDuplicates = !!(duplicateWarning && duplicateWarning.length > 0);
  const patch = (changes) => setForm({ ...form, ...changes });

  return (
    <div
      className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Create and Auto-Assign Customer"
      data-pos-scan-suppress="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#F5C742] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/30 flex items-center justify-center text-[#1E293B]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wide text-[#1E293B]">Quick Create &amp; Auto-Assign Customer</h2>
              <p className="text-xs text-[#1E293B]/70 mt-0.5">Instantly add and select customer for this transaction</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#1E293B]/70 hover:text-[#1E293B] transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Duplicate Warning */}
          {hasDuplicates && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-inner space-y-3">
              <div className="flex items-center gap-2.5 text-amber-800">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <h3 className="text-sm font-bold">Potential Duplicate Customers Detected!</h3>
              </div>
              <p className="text-xs text-amber-800/90">
                We found existing customers matching the phone, email, or TRN you entered:
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {duplicateWarning.map(dup => (
                  <div key={dup.id} className="bg-white border border-amber-200/80 rounded-xl p-3 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{dup.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Mobile: {dup.mobile || dup.phone || 'N/A'} {dup.email ? `| Email: ${dup.email}` : ''} {dup.trn ? `| TRN: ${dup.trn}` : ''}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => {
                        setSelectedCustomer?.(dup.id);
                        onClose?.();
                        // showFeedback is (type, message) — the inline copy of this dialog
                        // passed them the other way round, so the toast rendered blank.
                        if (showFeedback) showFeedback('success', 'Selected existing customer!');
                      }}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition-colors shadow-sm">
                      Use Existing
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-700 italic pt-1 border-t border-amber-200/60">
                Or, if this is a distinct customer, you can proceed to create a new record below.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Full Name <span className="text-red-500">*</span></label>
              <input ref={nameInputRef} type="text" value={form.name || ''}
                onChange={e => patch({ name: e.target.value })}
                placeholder="Enter customer full name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Mobile / Phone <span className="text-red-500">*</span></label>
              <input type="tel" value={form.mobile || ''}
                onChange={e => patch({ mobile: e.target.value })}
                placeholder="+971 50 000 0000"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Email Address</label>
              <input type="email" value={form.email || ''}
                onChange={e => patch({ email: e.target.value })}
                placeholder="email@example.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Tax Registration No. (TRN)</label>
              <input type="text" value={form.trn || ''}
                onChange={e => patch({ trn: e.target.value })}
                placeholder="15-digit TRN"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Customer Group / Type</label>
              <select value={form.customerType || 'Retail'}
                onChange={e => patch({ customerType: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white">
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Corporate">Corporate</option>
                <option value="VIP">VIP</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">City</label>
              <input type="text" value={form.city || ''}
                onChange={e => patch({ city: e.target.value })}
                placeholder="e.g. Dubai"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Country</label>
              <input type="text" value={form.country || ''}
                onChange={e => patch({ country: e.target.value })}
                placeholder="e.g. United Arab Emirates"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Billing / Delivery Address</label>
              <textarea rows={2} value={form.deliveryAddress || ''}
                onChange={e => patch({ deliveryAddress: e.target.value })}
                placeholder="Full street address..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white resize-none" />
            </div>
            <div className="col-span-2 border-t border-gray-100 pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCreditCustomer || false}
                  onChange={e => patch({ isCreditCustomer: e.target.checked })}
                  className="w-4 h-4 text-[#e6b838] border-gray-300 rounded focus:ring-[#F5C742]" />
                <span className="text-sm font-bold text-gray-800">Enable Credit Facility for this Customer</span>
              </label>
            </div>
            {form.isCreditCustomer && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Credit Limit (AED)</label>
                  <input type="number" min="0" step="0.01" value={form.creditLimit || ''}
                    onChange={e => patch({ creditLimit: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Opening Balance (AED)</label>
                  <input type="number" step="0.01" value={form.openingBalance || ''}
                    onChange={e => patch({ openingBalance: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 block">Internal Notes</label>
              <input type="text" value={form.notes || ''}
                onChange={e => patch({ notes: e.target.value })}
                placeholder="Cashier remarks, preferences..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C742] bg-white" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="button"
            disabled={loading || !form.name || !form.mobile}
            onClick={() => onSave(hasDuplicates)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${hasDuplicates
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20 text-white'
                : 'bg-[#F5C742] hover:bg-[#e6b838] shadow-[#F5C742]/30 text-[#1E293B]'
              }`}>
            {loading ? 'Saving...' : (hasDuplicates ? 'Create New Record Anyway' : 'Save & Auto-Select')}
          </button>
        </div>
      </div>
    </div>
  );
}
