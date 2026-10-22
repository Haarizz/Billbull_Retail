import { describe, expect, it } from "vitest";
import {
    buildChequePrintHtml, chequeFieldValues, chequeSettingsFromTemplate, formatChequeDate,
} from "../chequePrint";

const cheque = {
    chequeNumber: "000147",
    chequeDate: "2026-10-16",
    payeeName: "Al Noor <Supplies> LLC",
    amount: 2500.5,
    memo: null,
    chequeBook: { currency: "AED", accountNumber: "1014782930001" },
    allocations: [
        { sourceNumber: "PV-1", reference: "PINV-2026-0008", active: true },
        { sourceNumber: "PV-2", reference: "PINV-2026-0009", active: false },
    ],
};

describe("chequePrint", () => {
    it("formats the date the way cheque date boxes expect", () => {
        expect(formatChequeDate("2026-10-16")).toBe("16 / 10 / 2026");
    });

    it("fills every designer field from the cheque, skipping released allocations in the memo", () => {
        const v = chequeFieldValues(cheque);
        expect(v.payee).toBe("Al Noor <Supplies> LLC");
        expect(v["amount-digits"]).toBe("**AED 2,500.50**");
        expect(v["amount-words"]).toMatch(/Two Thousand Five Hundred Dirhams/);
        expect(v["amount-words"]).toMatch(/Fifty Fils/);
        expect(v.memo).toBe("Payment against PINV-2026-0008");
        expect(v["account-no"]).toBe("1014782930001");
    });

    it("prints at the template's physical size without the background scan, escaping text", () => {
        const settings = chequeSettingsFromTemplate({
            name: "ENBD",
            displayOptions: JSON.stringify({
                widthMm: 200, heightMm: 90, backgroundImageUrl: "data:image/png;base64,AAAA",
                fields: [{ id: "payee", enabled: true, x: 10, y: 20, width: 50, fontSize: 12, fontFamily: "Arial", textAlign: "left" },
                         { id: "memo", enabled: false, x: 0, y: 0, width: 10, fontSize: 9 }],
            }),
        });
        const html = buildChequePrintHtml(cheque, settings);
        expect(html).toContain("size: 200mm 90mm");
        expect(html).toContain("left:10%;top:20%;width:50%");
        expect(html).toContain("Al Noor &lt;Supplies&gt; LLC");
        expect(html).not.toContain("base64");
        expect(html).not.toContain("Payment against");
    });

    it("falls back to the default layout when the template has no fields", () => {
        const settings = chequeSettingsFromTemplate({ name: "Empty", displayOptions: "{}" });
        expect(settings.fields.length).toBeGreaterThan(0);
        expect(settings.widthMm).toBe(216);
    });
});
