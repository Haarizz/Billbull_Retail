import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { buildPosFunctionButtons } from '../../../lib/posFunctionButtons';
import { usePosInputV2, usePosOverlay } from '../../../input/PosOverlayContext';
import { POS_SCOPES } from '../../../input/posScope';

/**
 * TradeFunctionsPanel
 *
 * The compact template's counterpart to the Classic/Cart Focus "Actions" panel: a
 * right-side slide-over opened from the Functions button in TradeHeader. Trade POS has
 * no permanent right-hand action column — the cart owns that space — so every shared
 * function used to be unreachable from this template.
 *
 * The buttons themselves come from buildPosFunctionButtons(), the one definition the
 * other templates render, so nothing here can drift from them. The only thing this
 * component adds is the grouping (`group`) and the drawer chrome.
 */
export const TradeFunctionsPanel = React.memo(({ open, onClose, hiddenPanelButtons, ...ctx }) => {
  // Esc closes, same as the other POS overlays. posInputV2: the POS input controller delivers
  // it through this registration; otherwise the legacy window listener below does.
  const posInputV2 = usePosInputV2();
  usePosOverlay({ open, scope: POS_SCOPES.MODAL, onEscape: onClose });
  useEffect(() => {
    if (!open || posInputV2) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, posInputV2, onClose]);

  const groups = useMemo(() => {
    const buttons = buildPosFunctionButtons(ctx, 'h-5 w-5')
      .filter(b => !hiddenPanelButtons?.has?.(b.id));
    // Preserve first-seen group order so the panel follows the shared list's ordering.
    const ordered = [];
    const byName = new Map();
    buttons.forEach(btn => {
      const name = btn.group || 'Other';
      if (!byName.has(name)) { byName.set(name, []); ordered.push(name); }
      byName.get(name).push(btn);
    });
    return ordered.map(name => ({ name, buttons: byName.get(name) }));
    // ctx is a fresh object every render; the panel is cheap and only mounts while open.
  }, [ctx, hiddenPanelButtons]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex justify-end" role="dialog" aria-modal="true" aria-label="POS Functions">
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close functions"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
      />

      <aside className="relative h-full w-full max-w-sm bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Compact POS</p>
            <h2 className="text-lg font-black text-[#1E293B] leading-tight">Functions</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="shrink-0 px-4 pt-3 text-xs text-gray-500">
          Tap a function to open its workflow.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
          {groups.map(group => (
            <section key={group.name}>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                {group.name}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.buttons.map(btn => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => { onClose?.(); btn.action(); }}
                    aria-disabled={btn.locked || undefined}
                    title={btn.lockReason || undefined}
                    className={`flex flex-col items-center justify-center gap-1.5 min-h-[76px] py-2 px-1 rounded-xl border transition-colors ${btn.color}`}
                  >
                    {btn.icon}
                    <span className="text-[10px] font-semibold leading-tight text-center">{btn.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              All functions are hidden in POS configuration.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
});

TradeFunctionsPanel.displayName = 'TradeFunctionsPanel';

export default TradeFunctionsPanel;
