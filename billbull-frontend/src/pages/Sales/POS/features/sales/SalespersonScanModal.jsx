import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, User, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * POS salesperson verification — ONE component, two entry states.
 *
 * Opened from the header's [Scan] button (first verification) and from the Actions panel
 * (re-verification). Those are not two flows: the only difference is whether a salesperson is
 * already verified when the modal mounts, which is a prop, not a second implementation. Both write
 * to the same `useSalesperson` state, so there is exactly one source of truth for what the
 * checkout will send.
 *
 *   current == null  →  "Select Salesperson" + scan field
 *   current != null  →  "Current Salesperson" + [Scan New] / [Continue]
 *   after a scan     →  "Employee Found" + [Change] / [Continue]
 *
 * SCANNER BEHAVIOUR: the POS keyboard-wedge listener in POSTouchScreen only captures keys when the
 * event target is NOT a text input (or IS the barcode input). This modal's field is a plain
 * autofocused <input>, so a scan lands here and never reaches product lookup — provided focus is
 * actually held, which is why focus is re-asserted on every state change. `data-pos-scan-suppress`
 * marks the subtree so the wedge listener can bail out explicitly even if focus is lost.
 */

const formatMoney = (value) => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Locale pinned to en-US rather than left to the host: the default locale varies by machine
  // (a Node/browser set to en-IN groups 100000 as "1,00,000"), and the same employee's target
  // must not read differently from one till to the next.
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const Field = ({ label, value, muted = false }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    <p className={`text-sm truncate ${muted ? 'text-gray-400 italic' : 'font-semibold text-[#1E293B]'}`}>
      {value}
    </p>
  </div>
);

export default function SalespersonScanModal({
  open,
  current = null,
  onVerify,
  onClear,
  onClose,
  verifying = false,
  error = '',
}) {
  const [code, setCode] = useState('');
  // "Replacing" means: a salesperson is already verified, but the user pressed Scan New and is now
  // being shown the scan field again. Local to the modal — it is a view state, not sale state.
  const [replacing, setReplacing] = useState(false);
  // Did THIS opening of the modal perform the scan? Purely so the confirmation reads "Employee
  // Found / Change" right after a scan and "Current Salesperson / Scan New" when re-opened later.
  // Same state, same action — only the wording follows how the user got here.
  const [justVerified, setJustVerified] = useState(false);
  const inputRef = useRef(null);

  // Re-assert focus whenever the modal opens or switches into a scanning state. A hardware scanner
  // types into whatever holds focus; if this field ever loses it, the scan becomes a product
  // barcode. This effect is the guard.
  useEffect(() => {
    if (!open) return undefined;
    const scanning = !current || replacing;
    if (!scanning) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus?.(), 30);
    return () => window.clearTimeout(timer);
  }, [open, current, replacing, error]);

  // Reset when the dialog closes, adjusted during render rather than in an effect. React's
  // documented pattern for "reset state when a prop changes": an effect here would set state
  // synchronously on every close and trigger a cascading re-render for no benefit.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setCode('');
      setReplacing(false);
      setJustVerified(false);
    }
  }

  if (!open) return null;

  const scanning = !current || replacing;

  const submit = async () => {
    const value = code.trim();
    if (!value || verifying) return;
    const employee = await onVerify?.(value);
    if (employee) {
      setCode('');
      setReplacing(false);
      setJustVerified(true);
    } else {
      // Rejected: keep the modal in its scan state and select the text so the next scan overwrites
      // it rather than appending to a bad code.
      inputRef.current?.select?.();
    }
  };

  const beginReplace = () => {
    setReplacing(true);
    setCode('');
    onClear?.();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"
      data-pos-scan-suppress="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#327F74]/10 text-[#327F74]">
              {scanning ? <ScanLine className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>
            <h2 className="text-base font-bold text-[#1E293B] truncate">
              {scanning ? 'Select Salesperson' : (justVerified ? 'Employee Found' : 'Salesperson Verified')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close salesperson verification"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* RE-VERIFICATION: a salesperson is already on the sale. */}
          {current && !replacing && (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {justVerified ? 'Employee Found' : 'Current Salesperson'}
                  </p>
                </div>
                <p className="text-lg font-bold text-[#1E293B] truncate">{current.name || '—'}</p>
                <p className="text-sm text-gray-600">{current.employeeCode || '—'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Role" value={current.role || '—'} />
                <Field label="Status" value={current.status || 'Active'} />
                <Field
                  label="Target"
                  value={formatMoney(current.targetAmount) ?? 'Not set'}
                  muted={formatMoney(current.targetAmount) == null}
                />
                {/* null commission is NOT 0% — it means nobody has configured one. */}
                <Field
                  label="Commission"
                  value={current.commissionRate != null ? `${Number(current.commissionRate).toFixed(2)}%` : 'Not set'}
                  muted={current.commissionRate == null}
                />
              </div>
            </>
          )}

          {/* SCAN STATE: first verification, or replacing an existing one. */}
          {scanning && (
            <>
              <p className="text-sm text-gray-600">Scan employee barcode</p>
              <input
                ref={inputRef}
                type="text"
                value={code}
                autoFocus
                autoComplete="off"
                aria-label="Employee barcode"
                placeholder="Scan / enter barcode"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  // A wedge scanner ends its burst with Enter. Stop propagation so the POS-level
                  // listener never sees it, even in the window before focus settles.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    submit();
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    onClose?.();
                  }
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base font-mono tracking-wide focus:outline-none focus:border-[#327F74]"
              />
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
          {scanning ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={verifying || !code.trim()}
                className="rounded-xl bg-[#327F74] px-5 py-2.5 text-sm font-bold text-white disabled:bg-gray-300"
              >
                {verifying ? 'Verifying…' : 'Verify'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={beginReplace}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                {/* Same action either way; the label matches how the user got here. */}
                {justVerified ? 'Change' : 'Scan New'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#327F74] px-5 py-2.5 text-sm font-bold text-white"
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
