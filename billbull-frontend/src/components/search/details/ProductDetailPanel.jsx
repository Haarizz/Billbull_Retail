import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import {
  DetailHeader,
  DetailSection,
  EmptyRow,
  SummaryStat,
} from "./DetailPanelShell";

/**
 * Read-only stock picture for one product.
 *
 * <p>Every number here came from the server: On Hand, Reserved and Incoming from the
 * stock-availability service, and Available from that same service's own
 * {@code Available = On Hand - Reserved}. None of them is recomputed in React.
 *
 * <p>Two fields are deliberately absent:
 *
 * <ul>
 *   <li><b>Damaged</b> — the inventory model has no damaged quantity, so showing a
 *       "0" would be inventing a figure rather than reporting one.
 *   <li><b>Total On Hand / Active Locations as headline counts</b> — the summary row
 *       sums the per-location figures the server returned, and is labelled as such;
 *       no separate "active locations" metric is claimed while its definition is
 *       still open.
 * </ul>
 */

const DASH = "—";

const num = (value) => (value == null ? DASH : Number(value).toLocaleString());

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const ProductDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    name,
    code,
    sku,
    status,
    unitPrice,
    reorderLevel,
    onHand,
    reserved,
    available,
    incoming,
    locations,
    incomingLpos,
    stockUnavailable,
  } = detail;

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="product-detail-panel">
        <DetailHeader
          title={name}
          subtitle={[code, sku && sku !== code ? sku : null].filter(Boolean).join(" • ")}
          badge={status || undefined}
          // Only the figures the server actually returned become chips — a missing price
          // is left out rather than shown as a dash in a pill.
          chips={[
            unitPrice != null ? `Unit price: ${money(unitPrice, currency)}` : null,
            reorderLevel != null ? `Reorder point: ${num(reorderLevel)}` : null,
          ]}
        />

        <DetailSection title="Stock summary">
          {/* Four across for the quantities, then the wider money/threshold pair, so a
              long "AED 1,234,567.00" is not squeezed into a quarter column. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryStat label="On hand" value={num(onHand)} testId="product-on-hand" />
            <SummaryStat label="Reserved" value={num(reserved)} testId="product-reserved" />
            <SummaryStat label="Available" value={num(available)} testId="product-available" />
            <SummaryStat label="Incoming PO" value={num(incoming)} testId="product-incoming" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SummaryStat
              label="Unit price"
              value={money(unitPrice, currency)}
              testId="product-unit-price"
            />
            <SummaryStat
              label="Reorder point"
              value={num(reorderLevel)}
              testId="product-reorder-point"
            />
          </div>
          {stockUnavailable && (
            <p className="mt-2 text-[11px] text-slate-400">
              Stock figures are unavailable right now.
            </p>
          )}
        </DetailSection>

        <DetailSection title="By location">
          {locations.length === 0 ? (
            <EmptyRow>No stock recorded for this product.</EmptyRow>
          ) : (
            <table className="w-full text-[11px]" data-testid="product-location-table">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[9px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="py-1 pr-2 font-medium">Location</th>
                  <th className="py-1 px-1 text-right font-medium">On hand</th>
                  <th className="py-1 px-1 text-right font-medium">Reserved</th>
                  <th className="py-1 px-1 text-right font-medium">Available</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc, index) => (
                  <tr
                    key={`${loc.locationId ?? "loc"}-${index}`}
                    className="border-t border-slate-50 text-slate-700"
                  >
                    <td className="max-w-[140px] truncate py-1.5 pr-2">{loc.name || DASH}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums">{num(loc.onHand)}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums">{num(loc.reserved)}</td>
                    <td className="py-1.5 px-1 text-right font-medium tabular-nums">
                      {num(loc.available)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DetailSection>

        {incomingLpos.length > 0 && (
          <DetailSection title="Incoming">
            <ul className="space-y-1" data-testid="product-incoming-list">
              {incomingLpos.map((lpo, index) => (
                <li
                  key={`${lpo.lpoNumber}-${index}`}
                  className="flex items-center justify-between gap-2 border-t border-slate-100 py-1.5 text-[11px] text-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {lpo.lpoNumber}
                    {lpo.supplierName ? ` · ${lpo.supplierName}` : ""}
                  </span>
                  <span className="shrink-0 text-slate-500">{lpo.expectedDate || DASH}</span>
                  <span className="shrink-0 font-medium tabular-nums">{num(lpo.quantity)}</span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}
      </div>
    </ScrollArea>
  );
};

export default ProductDetailPanel;
