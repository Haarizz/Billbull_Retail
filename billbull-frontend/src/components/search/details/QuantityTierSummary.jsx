import React from "react";
import { DetailSection } from "./DetailPanelShell";

// Pricing Phase 3 — a compact view of a product's live quantity tiers, per level (and branch).
// Renders nothing when the product has none, so products without tiers look exactly as before.
// The tiers are read with the rest of the product detail (api/entityDetailApi), so a revisited
// product is served from the detail cache with no extra request.

const qty = (q) => String(+Number(q).toFixed(3));

export const groupTiers = (tiers) => {
  const byLevel = new Map();
  (tiers || []).filter((t) => t && t.active !== false).forEach((t) => {
    const key = `${t.priceLevelId}|${t.branchId ?? ""}`;
    if (!byLevel.has(key)) {
      byLevel.set(key, {
        key,
        level: t.priceLevelName || `Level ${t.priceLevelId}`,
        branch: t.branchName || null,
        branchId: t.branchId ?? null,
        tiers: [],
      });
    }
    byLevel.get(key).tiers.push(t);
  });
  return [...byLevel.values()].map((g) => ({
    ...g,
    tiers: g.tiers.sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity)),
  }));
};

const QuantityTierSummary = ({ tiers, currency = "AED" }) => {
  const groups = groupTiers(tiers);
  if (groups.length === 0) return null;
  const unit = (tiers || []).find((t) => t?.baseUnit)?.baseUnit;

  return (
    <DetailSection title="Quantity tiers">
      <ul className="space-y-1 text-[11px] text-slate-700" data-testid="product-quantity-tiers">
        {groups.map((g) => (
          <li key={g.key} className="flex flex-wrap items-baseline gap-x-2 border-t border-slate-100 py-1.5">
            <span className="font-semibold">{g.level}</span>
            {g.branchId != null && (
              <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-700">{g.branch || "Branch"}</span>
            )}
            <span className="tabular-nums text-slate-600">
              {g.tiers
                .map((t) => `${qty(t.minQuantity)}${unit ? ` ${unit}` : ""}+ → ${currency} ${Number(t.price).toFixed(2)}`)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
};

export default QuantityTierSummary;
