import { describe, expect, it } from "vitest";
import { offerMeetsItemRules, pickAutoAllocation, recommendOffer, validityDays, withCurrent } from "../rfqUtils";
import { blankOffer, buildQuotePayload, offerProblems, quoteProblems, toEditable } from "../OfferEditor";

const offer = (o) => ({
  unitPrice: 100, quotedQty: 5, discountPercent: 0, taxPercent: 0, shippingCost: 0, additionalCost: 0,
  availability: "in-stock", alternative: false, ...o,
});

describe("item rules (alternative brands / partial quantity)", () => {
  const strict = { id: 1, itemName: "Scanner", qtyNeeded: 5, unit: "PCS", altBrandAllowed: false, partialAllowed: false };

  it("rejects alternatives and short quantities when the item forbids them", () => {
    expect(offerMeetsItemRules(strict, offer({ alternative: true }))).toBe(false);
    expect(offerMeetsItemRules(strict, offer({ quotedQty: 3 }))).toBe(false);
    expect(offerMeetsItemRules(strict, offer({}))).toBe(true);
    expect(offerMeetsItemRules({ ...strict, altBrandAllowed: true, partialAllowed: true }, offer({ alternative: true, quotedQty: 1 }))).toBe(true);
  });

  it("never recommends an offer that breaks the rules even when it is cheaper", () => {
    const { pick } = recommendOffer(strict, [
      { vendor: { vendorName: "Alt" }, offer: offer({ unitPrice: 50, alternative: true }) },
      { vendor: { vendorName: "Short" }, offer: offer({ unitPrice: 60, quotedQty: 2 }) },
      { vendor: { vendorName: "OK" }, offer: offer({ unitPrice: 120 }) },
    ]);
    expect(pick.vendor.vendorName).toBe("OK");
  });

  it("flags the offending fields and lists them for the submit guard", () => {
    const p = offerProblems(offer({ alternative: true, description: "", quotedQty: 2 }), strict, true);
    expect(p.alternative).toBeTruthy();
    expect(p.description).toBeTruthy();
    expect(p.quotedQty).toMatch(/Full quantity/);
    expect(quoteProblems([{ ...offer({ quotedQty: 2 }), rfqItemId: 1 }], [strict], true)[0]).toMatch(/^Scanner:/);
    // drafts tolerate a missing price, out-of-stock lines have nothing to check
    expect(offerProblems(offer({ unitPrice: "" }), { ...strict, partialAllowed: true }, false)).toEqual({});
    expect(offerProblems(offer({ availability: "out-of-stock", quotedQty: 0 }), strict, true)).toEqual({});
  });

  it("checks availability against stock", () => {
    const item = { qtyNeeded: 10, partialAllowed: true };
    expect(offerProblems(offer({ quotedQty: 10, availableStock: 4 }), item).availableStock).toMatch(/Only 4/);
    expect(offerProblems(offer({ quotedQty: 10, availableStock: 10, availability: "partial" }), item).availableStock).toBeTruthy();
    expect(offerProblems(offer({ availability: "on-order", dispatchDate: "" }), item, true).dispatchDate).toBeTruthy();
  });
});

describe("tax-inclusive prices", () => {
  it("round-trips gross prices through the editable shape and keeps the payload net", () => {
    const e = toEditable({ id: 7, unitPrice: 100, taxPercent: 5, bulkTiers: [{ minQty: 10, unitPrice: 90 }] });
    expect(e.grossPrice).toBe(105);
    expect(e.bulkTiers[0].grossPrice).toBe(94.5);
    const payload = buildQuotePayload("SAVE", {}, [{ ...e, bulkTiers: [...e.bulkTiers, { minQty: 50, unitPrice: "" }] }]);
    expect(payload.offers[0].unitPrice).toBe(100);
    expect(payload.offers[0].bulkTiers).toHaveLength(1); // empty tier rows are dropped
  });

  it("starts a new offer from the item's quantity, date and warranty", () => {
    const o = blankOffer({ id: 3, qtyNeeded: 4, expectedDelivery: "2026-11-26", warrantyRequired: "1 Year", itemName: "X" }, false, { validUntil: "2026-12-01" });
    expect(o).toMatchObject({ rfqItemId: 3, quotedQty: 4, deliveryDate: "2026-11-26", warranty: "1 Year", validUntil: "2026-12-01", description: "X" });
  });
});

describe("pickAutoAllocation", () => {
  const items = [{ productId: 1, itemName: "A" }, { productId: 2, itemName: "B" }, { productId: 3, itemName: "C" }];
  const sug = (vendorId, score, products) => ({
    vendorId, score, productIds: products.map((p) => p[0]), products: products.map(([productId, s]) => ({ productId, score: s })),
  });
  const suggestions = [
    sug(10, 80, [[1, 90], [2, 70]]),
    sug(20, 60, [[1, 60], [2, 95]]),
    sug(30, 40, [[1, 30]]),
    sug(40, 35, [[1, 20]]),
    sug(50, 30, [[2, 10]]),
  ];

  it("covers every item's best vendor before adding second choices", () => {
    const { picks, uncovered } = pickAutoAllocation(items, suggestions, new Set([10, 20, 30, 40, 50]), { perItem: 3, max: 10 });
    expect(picks.slice(0, 2)).toEqual([10, 20]); // best for item 1, best for item 2
    expect(picks).toContain(30); // third for item 1
    expect(picks).not.toContain(40); // fourth for item 1 is beyond perItem
    expect(uncovered.map((i) => i.itemName)).toEqual(["C"]);
  });

  it("skips vendors that cannot be used and honours the cap", () => {
    const { picks } = pickAutoAllocation(items, suggestions, new Set([20, 30, 40]), { perItem: 3, max: 2 });
    expect(picks).toEqual([20, 30]);
  });
});

describe("pick-list helpers", () => {
  it("keeps a legacy value selectable and reads validity days", () => {
    expect(withCurrent(["a", "b"], "z")).toEqual(["z", "a", "b"]);
    expect(withCurrent(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(validityDays("15 days")).toBe(15);
    expect(validityDays("")).toBeNull();
  });
});
