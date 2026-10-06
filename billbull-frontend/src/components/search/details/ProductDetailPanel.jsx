import React from "react";

import { ScrollArea } from "../../ui/scroll-area";
import { DetailSection, EmptyRow, StatusChip, initialsOf } from "./DetailPanelShell";
import { locationStockStatus, productStockStatus } from "./productStockStatus";

/**
 * Read-only stock picture for one product.
 *
 * <p>Every number here came from the server: On Hand, Reserved and Incoming from the
 * stock-availability service, and Available from that same service's own
 * {@code Available = On Hand - Reserved}. None of them is recomputed in React; the
 * headline totals are sums of the per-location rows the server returned.
 *
 * <p>The layout follows the design's eight-card overview and per-location table, but the
 * inventory model does not carry every figure the design shows, and none is invented:
 *
 * <ul>
 *   <li><b>Damaged</b> — there is no damaged quantity in the model. The card and column
 *       are kept for the layout and read "—" / "Not tracked", never a fabricated "0".
 *   <li><b>Zone</b> and per-location <b>Incoming</b> — stock is reported per warehouse,
 *       and open LPOs are not tied to one, so both columns read "—". Incoming is shown
 *       in total, and per LPO in the Incoming list.
 *   <li><b>Stock level</b> — measured against the product's configured maximum stock
 *       when it has one. Without it there is no capacity to measure against, so the bar
 *       shows how much of the on-hand stock is available instead, and says so.
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

const VALUE_TONE = {
  default: "text-slate-900",
  positive: "text-emerald-700",
  warning: "text-[#8A6D09]",
  negative: "text-red-600",
  info: "text-blue-700",
  muted: "text-slate-400",
};

/** Colour for a quantity: only a figure that is actually non-zero earns a tone. */
const toneIf = (value, tone) => (value != null && Number(value) !== 0 ? tone : "default");

const StockCard = ({ label, value, testId, tone = "default", hint }) => (
  // Short POS screens (720p/768p) get a tighter card so the location table stays in view.
  <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100 ring-inset [@media(max-height:800px)]:py-1.5">
    <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">
      {label}
    </p>
    <p
      data-testid={testId}
      title={typeof value === "string" ? value : undefined}
      className={`mt-1 truncate text-[17px] font-semibold leading-tight tabular-nums ${VALUE_TONE[tone] ?? VALUE_TONE.default}`}
    >
      {value}
    </p>
    {hint && (
      <p className="mt-0.5 truncate text-[10px] text-slate-400 [@media(max-height:800px)]:hidden">
        {hint}
      </p>
    )}
  </div>
);

/** A table cell figure. Negative values stay visible and read red; zero stays "0". */
const Qty = ({ value, tone = "default", strong = false }) => (
  <span
    className={`tabular-nums ${strong ? "font-medium" : ""} ${
      value != null && Number(value) < 0 ? VALUE_TONE.negative : VALUE_TONE[tone]
    }`}
  >
    {num(value)}
  </span>
);

const ProductHeader = ({ name, identifiers, chips }) => (
  <div className="border-b border-slate-100 px-5 py-4 [@media(max-height:800px)]:py-3">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-semibold tracking-wide text-blue-700"
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold leading-tight text-slate-900" title={name}>
          {name}
        </p>
        {identifiers && (
          <p className="mt-1 truncate text-[11px] text-slate-500" title={identifiers}>
            {identifiers}
          </p>
        )}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <StatusChip key={chip.label} tone={chip.tone}>
                {chip.label}
              </StatusChip>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const StockLevel = ({ onHand, available, maxStock, locationCount, uom }) => {
  const unit = uom ? ` ${uom.toLowerCase()}` : "";
  const hasMax = maxStock != null && maxStock > 0;
  // Against the configured maximum when there is one; otherwise the only honest ratio the
  // data supports is available out of on hand.
  const total = hasMax ? maxStock : onHand;
  const filled = hasMax ? onHand : available;
  if (!hasMax && !(onHand > 0)) {
    return (
      <p className="text-[11px] text-slate-400" data-testid="product-stock-level">
        No stock on hand, and no maximum stock level is set for this product.
      </p>
    );
  }
  const ratio = total > 0 ? filled / total : 0;
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  const percent = Math.round(ratio * 100);

  return (
    <div data-testid="product-stock-level">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[11px] text-slate-600">
        <span className="tabular-nums">
          {hasMax ? `${num(onHand)}${unit} on hand` : `${num(available)}${unit} available`}
        </span>
        <span className="truncate tabular-nums">
          {hasMax ? `${num(maxStock)}${unit} max stock` : `${num(onHand)}${unit} on hand`}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.max(0, Math.min(100, percent))}
        aria-label={hasMax ? "On hand as a share of max stock" : "Available as a share of on hand"}
      >
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[10px] text-slate-400">
        <span className="truncate">
          {num(onHand)} on hand across {locationCount} location{locationCount === 1 ? "" : "s"}
        </span>
        <span className="shrink-0 tabular-nums">
          {hasMax ? `${percent}% of max stock` : `${percent}% available`}
        </span>
      </div>
    </div>
  );
};

const TH = "py-1.5 px-2 text-right font-medium";
const TD = "py-2 px-2 text-right";

const ProductDetailPanel = ({ detail, currency = "AED" }) => {
  if (!detail) return null;

  const {
    name,
    code,
    sku,
    barcode,
    category,
    status,
    unitPrice,
    reorderLevel,
    maxStock,
    uom,
    onHand,
    reserved,
    available,
    incoming,
    locations,
    incomingLpos,
    stockUnavailable,
  } = detail;

  const identifiers = [
    code,
    sku && sku !== code ? `SKU: ${sku}` : null,
    barcode ? `Barcode: ${barcode}` : null,
    category,
  ]
    .filter(Boolean)
    .join(" · ");

  // Same rule the backend's low-stock alert uses, applied to the server's Available.
  const stockStatus = stockUnavailable ? null : productStockStatus(available, reorderLevel);
  const chips = [
    stockStatus ? { label: stockStatus } : null,
    // The record's own status (Active/Draft), only when the payload carries one.
    status ? { label: String(status), tone: String(status).toUpperCase() === "ACTIVE" ? "positive" : "neutral" } : null,
    unitPrice != null ? { label: `Unit price: ${money(unitPrice, currency)}`, tone: "neutral" } : null,
    reorderLevel != null ? { label: `Reorder point: ${num(reorderLevel)}`, tone: "neutral" } : null,
  ].filter(Boolean);

  // Locations actually holding stock. Rows the server returned at zero on hand are still
  // listed in the table, just not counted as active.
  const activeLocations = locations.filter((loc) => Number(loc.onHand) !== 0).length;
  const lowAgainstReorder = reorderLevel > 0 && available <= reorderLevel;

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="product-detail-panel">
        <ProductHeader name={name} identifiers={identifiers} chips={chips} />

        <DetailSection title="Stock overview">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StockCard label="Total on hand" value={num(onHand)} testId="product-on-hand" />
            <StockCard
              label="Available"
              value={num(available)}
              testId="product-available"
              tone={available < 0 ? "negative" : lowAgainstReorder ? "warning" : toneIf(available, "positive")}
            />
            <StockCard
              label="Reserved"
              value={num(reserved)}
              testId="product-reserved"
              tone={toneIf(reserved, "warning")}
            />
            <StockCard
              label="Incoming PO"
              value={num(incoming)}
              testId="product-incoming"
              tone={toneIf(incoming, "positive")}
            />
            <StockCard
              label="Damaged"
              value={DASH}
              testId="product-damaged"
              tone="muted"
              hint="Not tracked"
            />
            <StockCard
              label="Active locations"
              value={stockUnavailable ? DASH : num(activeLocations)}
              testId="product-active-locations"
              tone={toneIf(activeLocations, "info")}
            />
            <StockCard label="Reorder at" value={num(reorderLevel)} testId="product-reorder-point" />
            <StockCard
              label="Unit price"
              value={money(unitPrice, currency)}
              testId="product-unit-price"
            />
          </div>
          {stockUnavailable && (
            <p className="mt-2 text-[11px] text-slate-400">
              Stock figures are unavailable right now.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Stock by warehouse / branch">
          {locations.length === 0 ? (
            <EmptyRow>No stock recorded for this product.</EmptyRow>
          ) : (
            <table className="w-full table-fixed text-[11px]" data-testid="product-location-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[9px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="w-[30%] py-1.5 pl-2 pr-2 font-medium">Location</th>
                  {/* Zone, Incoming and Damaged carry no per-location figure in this model
                      (see the note at the top), so they give way first on narrow screens. */}
                  <th className="hidden py-1.5 px-2 font-medium lg:table-cell" title="Not reported per location">Zone</th>
                  <th className={TH}>On hand</th>
                  <th className={TH}>Reserved</th>
                  <th className={TH}>Available</th>
                  <th className={`hidden lg:table-cell ${TH}`} title="Open LPOs are not tied to a location">Incoming</th>
                  <th className={`hidden lg:table-cell ${TH}`} title="Not tracked">Damaged</th>
                  <th className="w-[92px] py-1.5 pl-3 pr-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc, index) => {
                  const locStatus = locationStockStatus(loc, reorderLevel);
                  return (
                    <tr
                      key={`${loc.locationId ?? "loc"}-${index}`}
                      className="border-b border-slate-100 text-slate-700 even:bg-slate-50/50 last:border-b-0"
                    >
                      <td className="truncate py-2 pl-2 pr-2 font-medium text-slate-800" title={loc.name || undefined}>
                        {loc.name || DASH}
                      </td>
                      <td className="hidden py-2 px-2 text-slate-300 lg:table-cell">{DASH}</td>
                      <td className={TD}>
                        <Qty value={loc.onHand} />
                      </td>
                      <td className={TD}>
                        <Qty value={loc.reserved} tone={toneIf(loc.reserved, "warning")} />
                      </td>
                      <td className={TD}>
                        <Qty value={loc.available} tone={toneIf(loc.available, "positive")} strong />
                      </td>
                      <td className={`hidden text-slate-300 lg:table-cell ${TD}`}>{DASH}</td>
                      <td className={`hidden text-slate-300 lg:table-cell ${TD}`}>{DASH}</td>
                      <td className="py-2 pl-3 pr-2">
                        <StatusChip tone={locStatus.tone} className="max-w-full truncate">
                          {locStatus.label}
                        </StatusChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DetailSection>

        {!stockUnavailable && (
          <DetailSection title="Overall stock level">
            <StockLevel
              onHand={onHand}
              available={available}
              maxStock={maxStock}
              locationCount={activeLocations}
              uom={uom}
            />
          </DetailSection>
        )}

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
