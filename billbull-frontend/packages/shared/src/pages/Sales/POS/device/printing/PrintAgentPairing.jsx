import { useCallback, useEffect, useState } from 'react';
import { Link2, Link2Off, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  completePrintAgentPairing,
  getPrintAgentStatus,
  resetPrintAgentProbe,
  startPrintAgentPairing,
  unpairPrintAgent,
} from '../../../../../utils/localPrintAgent';

/**
 * Pairs this browser with the BillBull Print Agent on this PC.
 *
 * The agent (0.6.0+) only prints for a site it trusts AND a browser holding a token it
 * issued. Pairing: the agent shows a 6-digit code on this PC's screen (tray notification
 * and tray menu); the operator types it here. A web page cannot pair itself, because the
 * code is never sent over HTTP. See docs/standalone-pos/PRINT_AGENT_SECURITY.md.
 */
const TONE = {
  paired: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  unpaired: 'text-amber-800 bg-[#FFF8E7] border-[#FDE6A9]',
  outdated: 'text-red-700 bg-red-50 border-red-200',
  'untrusted-origin': 'text-red-700 bg-red-50 border-red-200',
  unreachable: 'text-gray-600 bg-gray-50 border-gray-200',
};

export default function PrintAgentPairing({ onPaired, label }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pairing, setPairing] = useState(null); // { pairingId, expiresAt }
  const [code, setCode] = useState('');

  const refresh = useCallback(async ({ reprobe = false } = {}) => {
    if (reprobe) resetPrintAgentProbe();
    try {
      setStatus(await getPrintAgentStatus());
    } catch (err) {
      setStatus({ state: 'unreachable', message: err?.message || 'Print agent unavailable.' });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'Print agent request failed.');
    } finally {
      setBusy(false);
    }
  };

  const begin = () => run(async () => {
    const started = await startPrintAgentPairing({ label });
    setPairing({ pairingId: started.pairingId, expiresAt: Date.now() + (started.expiresInSeconds || 120) * 1000 });
    setCode('');
  });

  const confirm = (e) => {
    e?.preventDefault();
    return run(async () => {
      try {
        await completePrintAgentPairing({ pairingId: pairing.pairingId, code });
      } catch (err) {
        if (err?.code === 'AGENT_PAIRING_EXPIRED' || err?.attemptsRemaining === 0) setPairing(null);
        throw err;
      }
      setPairing(null);
      setCode('');
      await refresh();
      onPaired?.();
    });
  };

  const unpair = () => run(async () => {
    await unpairPrintAgent();
    await refresh();
  });

  if (!status) return null;
  const Icon = status.state === 'paired' ? ShieldCheck : ShieldAlert;

  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${TONE[status.state] || TONE.unreachable}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold">
          <Icon className="h-4 w-4 shrink-0" />
          <span>{status.message}{status.version ? ` (agent ${status.version})` : ''}</span>
        </p>
        <div className="flex items-center gap-2">
          {(status.state === 'unreachable' || status.state === 'untrusted-origin' || status.state === 'outdated') && (
            <button type="button" disabled={busy} onClick={() => run(() => refresh({ reprobe: true }))}
              className="rounded-lg border border-current px-2 py-1 font-semibold disabled:opacity-60">
              Check again
            </button>
          )}
          {status.state === 'unpaired' && !pairing && (
            <button type="button" disabled={busy} onClick={begin}
              className="flex items-center gap-1 rounded-lg bg-[#F5C742] px-2.5 py-1 font-bold text-[#1E293B] hover:bg-[#e6b838] disabled:opacity-60">
              <Link2 className="h-3.5 w-3.5" />Pair this PC
            </button>
          )}
          {status.state === 'paired' && (
            <button type="button" disabled={busy} onClick={unpair}
              className="flex items-center gap-1 rounded-lg border border-current px-2 py-1 font-semibold disabled:opacity-60">
              <Link2Off className="h-3.5 w-3.5" />Unpair
            </button>
          )}
        </div>
      </div>

      {pairing && (
        <form onSubmit={confirm} className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="print-agent-pairing-code" className="text-[#1E293B]">
            Enter the 6-digit code the print agent is showing on this PC (tray icon):
          </label>
          <input
            id="print-agent-pairing-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-sm tracking-widest text-[#1E293B]"
          />
          <button type="submit" disabled={busy || code.length !== 6}
            className="rounded-lg bg-[#F5C742] px-2.5 py-1 font-bold text-[#1E293B] hover:bg-[#e6b838] disabled:opacity-60">
            Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => { setPairing(null); setError(''); }}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-600">
            Cancel
          </button>
        </form>
      )}

      {error && <p className="mt-2 font-semibold text-red-600">{error}</p>}
    </div>
  );
}
