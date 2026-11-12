import { describe, expect, it } from "vitest";
import {
  buildVendorMessage, landedTotal, landedUnitCost, offersForItem, previousPriceFor, recommendOffer, vendorInitials,
  whatsappLink,
} from "../rfqUtils";

const offer = (o) => ({
  unitPrice: 100, quotedQty: 5, discountPercent: 0, taxPercent: 0, shippingCost: 0, additionalCost: 0,
  availability: "in-stock", alternative: false, ...o,
});

describe("landed cost", () => {
  it("applies discount, then tax, then spreads shipping over the quoted quantity", () => {
    const o = offer({ unitPrice: 200, discountPercent: 10, taxPercent: 5, shippingCost: 50, quotedQty: 5 });
    // 200 * 0.9 = 180; * 1.05 = 189; + 50/5 = 199
    expect(landedUnitCost(o)).toBeCloseTo(199);
    // 180*5 = 900; tax 45; + 50 shipping
    expect(landedTotal(o)).toBeCloseTo(995);
  });

  it("does not divide by zero when no quantity was quoted", () => {
    expect(landedUnitCost(offer({ quotedQty: 0, shippingCost: 20 }))).toBeCloseTo(120);
  });
});

describe("recommendOffer", () => {
  const item = { qtyNeeded: 5 };
  const v = (name) => ({ vendorName: name, vendorId: name.length });

  it("prefers the lowest landed cost among full-quantity offers", () => {
    const { pick, reason } = recommendOffer(item, [
      { vendor: v("Cheap partial"), offer: offer({ unitPrice: 80, quotedQty: 2 }) },
      { vendor: v("Full A"), offer: offer({ unitPrice: 100 }) },
      { vendor: v("Full B shipping"), offer: offer({ unitPrice: 95, shippingCost: 100 }) },
    ]);
    expect(pick.vendor.vendorName).toBe("Full A");
    expect(reason).toContain("Full quantity");
  });

  it("falls back to partial offers and ignores out-of-stock or unpriced ones", () => {
    const { pick, reason } = recommendOffer(item, [
      { vendor: v("OOS"), offer: offer({ unitPrice: 10, availability: "out-of-stock" }) },
      { vendor: v("Zero"), offer: offer({ unitPrice: 0 }) },
      { vendor: v("Partial"), offer: offer({ unitPrice: 90, quotedQty: 3 }) },
    ]);
    expect(pick.vendor.vendorName).toBe("Partial");
    expect(reason).toContain("Partial quantity only");
  });

  it("reports when nothing is usable", () => {
    expect(recommendOffer(item, []).pick).toBeNull();
  });
});

describe("offersForItem", () => {
  it("only counts vendors whose quote is submitted or revised", () => {
    const rfq = {
      vendors: [
        { id: 1, responseStatus: "SUBMITTED", offers: [{ id: 10, rfqItemId: 7 }, { id: 11, rfqItemId: 8 }] },
        { id: 2, responseStatus: "IN_PROGRESS", offers: [{ id: 20, rfqItemId: 7 }] },
        { id: 3, responseStatus: "REVISED", offers: [{ id: 30, rfqItemId: 7 }] },
      ],
    };
    expect(offersForItem(rfq, 7).map((c) => c.offer.id)).toEqual([10, 30]);
  });
});

describe("previousPriceFor", () => {
  it("returns the newest earlier price for that vendor", () => {
    const history = [
      { vendorId: 1, price: 510, date: "2026-06-14" },
      { vendorId: 1, price: 495, date: "2026-09-08" },
      { vendorId: 2, price: 300, date: "2026-10-01" },
    ];
    expect(previousPriceFor(history, 1).price).toBe(495);
    expect(previousPriceFor(history, 9)).toBeNull();
  });
});

describe("messages and export", () => {
  it("builds a vendor invitation listing every item", () => {
    const text = buildVendorMessage({
      rfqNumber: "RFQ-2026-0001", title: "Scanners", deadline: "2026-11-20", items: [
        { itemName: "Wireless Scanner", itemCode: "SC-1", qtyNeeded: 5, unit: "Pcs", brand: "Zebra", model: "LI4278", altBrandAllowed: false },
      ],
    }, { vendorName: "Gulf Tech" }, "Acme Trading");
    expect(text).toContain("Dear Gulf Tech,");
    expect(text).toContain("RFQ Number: RFQ-2026-0001");
    expect(text).toContain("1. Wireless Scanner [SC-1] — 5 Pcs");
    expect(text).toContain("Alternative brands not accepted");
    expect(text).toContain("Acme Trading");
  });

  it("puts the portal link in the message when there is one", () => {
    const text = buildVendorMessage({ rfqNumber: "R", title: "T", items: [] }, { vendorName: "V" }, "Acme", "https://erp.x/vendor-portal/abc");
    expect(text).toContain("https://erp.x/vendor-portal/abc");
    expect(text).toContain("one-time code");
  });

  it("strips non-digits from WhatsApp numbers", () => {
    expect(whatsappLink("+971 4 321-9900", "hi")).toBe("https://wa.me/97143219900?text=hi");
  });

  it("makes two-letter initials", () => {
    expect(vendorInitials("Gulf Tech Supplies LLC")).toBe("GT");
    expect(vendorInitials("Zebra")).toBe("ZE");
  });
});
