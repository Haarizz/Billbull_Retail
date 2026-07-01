import { useState } from "react";
import { supervisorTakeoverSession } from "../../api/posApi";

/**
 * Modal dialog that allows a supervisor to take over an occupied or suspended
 * POS session by entering their PIN.
 *
 * @param {{ sessionId: string|number, onSuccess: (session) => void, onCancel: () => void }} props
 */
export default function SupervisorTakeoverDialog({ sessionId, onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) { setError("Please enter the supervisor PIN."); return; }
    setError(null);
    setLoading(true);
    try {
      const session = await supervisorTakeoverSession(sessionId, pin);
      onSuccess(session);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data || "Invalid PIN or takeover failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Supervisor Takeover</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter your supervisor PIN to take over this session.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={10}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Supervisor PIN"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            autoFocus
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Take Over"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
