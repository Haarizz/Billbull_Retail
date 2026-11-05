import { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { disablePinSignIn, enablePinSignIn } from '@billbull/shared/api/posPinApi';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { clearPinDevice, readPinDevice, savePinDevice } from './pinDevice';

const button = 'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:opacity-50';

/**
 * Turns PIN sign-in on or off for THIS till (admins and branch admins). Turning it on stores a
 * secret device token in this browser; staff can then sign in here by tapping their name and
 * typing their PIN. Turning it off revokes the token on the server too.
 */
export default function PinSignInDialog({ onClose }) {
  const { activeBranch } = useBranch();
  const [device, setDevice] = useState(() => readPinDevice());
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const enable = async () => {
    if (!activeBranch?.id) {
      setError('Choose the till’s branch first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const enrolled = await enablePinSignIn({
        branchId: activeBranch.id,
        label: label.trim() || undefined,
        terminalId: localStorage.getItem(`billbull:pos:terminal_id:${activeBranch.id}`) || undefined,
      });
      if (!savePinDevice(enrolled)) {
        // The server has a device this browser can't remember; revoke it rather than orphan it.
        await disablePinSignIn(enrolled.deviceId).catch(() => {});
        throw new Error('This browser blocked local storage, so PIN sign-in can’t be turned on here.');
      }
      setDevice(readPinDevice());
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Couldn’t turn on PIN sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      await disablePinSignIn(device.deviceId);
    } catch (err) {
      // Already revoked or deleted is fine; anything else should be seen, but the till still forgets it.
      if (err?.response?.status !== 404) setError(err?.response?.data?.message || 'The server didn’t confirm, but this till has forgotten its PIN key.');
    } finally {
      clearPinDevice();
      setDevice(null);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#1C2838]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pin-signin-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF8E7] text-[#8a6a10]"><KeyRound size={20} /></span>
            <div>
              <h2 id="pin-signin-title" className="text-lg font-semibold text-[#1C2838]">PIN sign-in on this till</h2>
              <p className="text-sm text-[#66737F]">{device ? 'On' : 'Off'}{device?.branchName ? ` · ${device.branchName}` : ''}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#66737F] hover:bg-[#F3F1EC]"><X size={18} /></button>
        </div>

        {device ? (
          <div className="mt-5 space-y-4 text-sm text-[#334155]">
            <p>
              Staff can sign in here by tapping their name and entering their PIN.
              {device.label ? <> This till is named <span className="font-semibold">{device.label}</span>.</> : null}
            </p>
            <p className="text-[#66737F]">Turn it off if this computer is being moved, replaced or is no longer at the counter.</p>
            <button type="button" onClick={disable} disabled={busy} className={`${button} border border-red-200 text-red-600 hover:bg-red-50`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn off PIN sign-in
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4 text-sm text-[#334155]">
            <p>
              Let staff at <span className="font-semibold">{activeBranch?.name || 'this branch'}</span> sign in on this till with
              a 4–6 digit PIN instead of a password. Username and password keeps working.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[#66737F]">
              <li>Only turn this on for a till that stays at the counter.</li>
              <li>Each person needs POS access and a PIN in HR → Employees, and a BillBull login for this branch.</li>
              <li>Five wrong PINs lock that person out on this till for 5 minutes.</li>
            </ul>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#66737F]">Till name (optional)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} placeholder="e.g. Front counter"
                className="w-full rounded-lg border border-[#E3E1DA] px-3 py-2 text-sm focus:border-[#1C2838] focus:outline-none focus:ring-2 focus:ring-[#F5C742]/40" />
            </label>
            <button type="button" onClick={enable} disabled={busy} className={`${button} bg-[#F5C742] text-[#1A1A1A] hover:bg-[#E5B732]`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn on PIN sign-in
            </button>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
