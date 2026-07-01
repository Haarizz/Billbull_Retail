import { useState, useEffect, useCallback } from "react";
import {
  getCounters, createCounter, updateCounter, setCounterStatus, deleteCounter,
} from "../../api/counterApi";

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-500 border-gray-200",
  MAINTENANCE: "bg-orange-100 text-orange-700 border-orange-200",
};

function CounterForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    counterCode: "",
    counterName: "",
    description: "",
    defaultCashDrawer: "",
    defaultReceiptPrinter: "",
    displayOrder: "",
    ...initial,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Counter Code</label>
          <input value={form.counterCode} onChange={set("counterCode")} placeholder="Auto" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Counter Name *</label>
          <input value={form.counterName} onChange={set("counterName")} placeholder="e.g. Counter 1" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Description</label>
        <input value={form.description} onChange={set("description")} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Cash Drawer</label>
          <input value={form.defaultCashDrawer} onChange={set("defaultCashDrawer")} placeholder="Device ID" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Receipt Printer</label>
          <input value={form.defaultReceiptPrinter} onChange={set("defaultReceiptPrinter")} placeholder="Device ID" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Display Order</label>
        <input type="number" value={form.displayOrder} onChange={set("displayOrder")} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.counterName}
          className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function POSCounters() {
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCounters();
      setCounters(data);
    } catch {
      setError("Failed to load counters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    setSaving(true);
    setActionError(null);
    try {
      if (editing) {
        const updated = await updateCounter(editing.id, form);
        setCounters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCounter(form);
        setCounters((prev) => [...prev, created]);
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      setActionError(e?.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (counter) => {
    const newStatus = counter.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const updated = await setCounterStatus(counter.id, newStatus);
      setCounters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Status update failed.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this counter? This cannot be undone.")) return;
    try {
      await deleteCounter(id);
      setCounters((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setActionError(e?.response?.data?.message || "Delete failed.");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Counter Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage POS counters for this branch</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); setActionError(null); }}
          className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600"
        >
          + New Counter
        </button>
      </div>

      {actionError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {actionError}
        </div>
      )}

      {(showForm && !editing) && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Counter</h2>
          <CounterForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading counters…</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-sm">{error}</div>
      ) : counters.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No counters yet. Create your first counter above.</div>
      ) : (
        <div className="space-y-3">
          {counters.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                {c.displayOrder || "#"}
              </div>
              <div className="flex-1 min-w-0">
                {editing?.id === c.id ? (
                  <CounterForm initial={c} onSave={handleSave}
                    onCancel={() => setEditing(null)} saving={saving} />
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{c.counterName}</span>
                      <span className="text-xs text-gray-400">{c.counterCode}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                    {(c.defaultCashDrawer || c.defaultReceiptPrinter) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.defaultCashDrawer && `Drawer: ${c.defaultCashDrawer}`}
                        {c.defaultCashDrawer && c.defaultReceiptPrinter && " · "}
                        {c.defaultReceiptPrinter && `Printer: ${c.defaultReceiptPrinter}`}
                      </p>
                    )}
                  </>
                )}
              </div>
              {editing?.id !== c.id && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleStatusToggle(c)}
                    className="px-2.5 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                    {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => { setEditing(c); setShowForm(false); setActionError(null); }}
                    className="px-2.5 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className="px-2.5 py-1 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
