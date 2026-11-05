import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StyledInvoiceDesigner } from "../StyledInvoiceDesigner";
import { generatePrintHtmlAsync, printHtml } from "@billbull/shared/utils/printGenerator";

// The renderer is covered by salesInvoiceStyledLayouts.test.js; here we only
// check that the designer feeds it, and the real print path, the same input.
vi.mock("@billbull/shared/utils/printGenerator", () => ({
    generatePrintHtmlAsync: vi.fn(async () => "<html><body>preview</body></html>"),
    printHtml: vi.fn(),
    downloadPdfViaServer: vi.fn(),
    renderPdfViaServer: vi.fn()
}));

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const lastSettings = () => {
    const [template] = generatePrintHtmlAsync.mock.calls.at(-1);
    return JSON.parse(template.displayOptions).salesDesignerSettings;
};

const renderDesigner = (props = {}) => {
    const onSave = vi.fn();
    render(
        <StyledInvoiceDesigner
            layoutStyle="column-bilingual"
            templateName="My Column Invoice"
            onClose={vi.fn()}
            onSave={onSave}
            {...props}
        />
    );
    return { onSave };
};

describe("StyledInvoiceDesigner", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists every section group as a collapsible group with its own switch", async () => {
        const user = userEvent.setup();
        renderDesigner();

        // First group open, the rest collapsed until clicked.
        expect(screen.getByRole("switch", { name: "Tagline" })).toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: "Sl. No" })).not.toBeInTheDocument();

        await user.click(screen.getByText("Item Columns"));
        expect(screen.getByRole("switch", { name: "Sl. No" })).toBeInTheDocument();

        await user.click(screen.getByText("Expand all"));
        expect(screen.getByRole("switch", { name: "Signature Lines" })).toBeInTheDocument();
    });

    it("turns a whole group off from its header switch and re-renders the preview", async () => {
        const user = userEvent.setup();
        renderDesigner();
        await waitFor(() => expect(generatePrintHtmlAsync).toHaveBeenCalled());

        // Stamp and QR start off, so the group switch first turns everything on.
        await user.click(screen.getByRole("switch", { name: "Show all in Footer" }));
        expect(screen.getByText("5/5")).toBeInTheDocument();
        await user.click(screen.getByRole("switch", { name: "Hide all in Footer" }));

        await waitFor(() => {
            const settings = lastSettings();
            expect(settings.showSignature).toBe(false);
            expect(settings.showThankYou).toBe(false);
            expect(settings.showContactLine).toBe(false);
        });
        expect(screen.getByText("0/5")).toBeInTheDocument();
    });

    it("filters sections by name", async () => {
        const user = userEvent.setup();
        renderDesigner();

        await user.type(screen.getByPlaceholderText("Find a section…"), "trn");
        expect(screen.getByRole("switch", { name: "TRN Line" })).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Customer TRN" })).toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: "Tagline" })).not.toBeInTheDocument();
    });

    it("previews a no-tax invoice through the same tax-aware filter the real print uses", async () => {
        const user = userEvent.setup();
        renderDesigner();
        await user.selectOptions(screen.getByTitle("Sample invoice"), "no-tax");

        await waitFor(() => {
            const [template, data] = generatePrintHtmlAsync.mock.calls.at(-1);
            expect(data.title).toBe("Sales Invoice");
            const settings = JSON.parse(template.displayOptions).salesDesignerSettings;
            expect(settings.colVAT).toBe(false);
            expect(settings.showTRN).toBe(false);
        });
    });

    it("test print sends the preview HTML through the real printHtml path", async () => {
        const user = userEvent.setup();
        renderDesigner();
        await user.click(screen.getByRole("button", { name: /Test print/ }));
        await waitFor(() => expect(printHtml).toHaveBeenCalledWith("<html><body>preview</body></html>"));
    });

    it("uploads a template logo and stamp and turns the stamp on from the Branding panel", async () => {
        const user = userEvent.setup();
        const { onSave } = renderDesigner();
        await user.click(screen.getByRole("button", { name: /Branding/ }));

        const png = (name) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
        await user.upload(screen.getByLabelText("Upload Company Logo"), png("logo.png"));
        await user.upload(screen.getByLabelText("Upload Company Stamp"), png("stamp.png"));
        await user.click(screen.getByRole("switch", { name: "Show Company Stamp" }));
        await user.click(screen.getByRole("switch", { name: "Show Watermark" }));
        await user.clear(screen.getByLabelText("Watermark text"));
        await user.type(screen.getByLabelText("Watermark text"), "COPY");

        await waitFor(() => {
            const settings = lastSettings();
            expect(settings.logoUrl).toMatch(/^data:image\/png;base64,/);
            expect(settings.stampUrl).toMatch(/^data:image\/png;base64,/);
            expect(settings.showCompanyStamp).toBe(true);
            expect(settings.watermarkText).toBe("COPY");
        });

        await user.click(screen.getByRole("button", { name: /Save Template/ }));
        expect(onSave.mock.calls[0][0]).toMatchObject({ showCompanyStamp: true, showWatermark: true, watermarkText: "COPY" });
    });

    it("saves the edited settings with the layout style", async () => {
        const user = userEvent.setup();
        const { onSave } = renderDesigner();
        await user.click(screen.getByRole("switch", { name: "Tagline" }));
        await user.click(screen.getByRole("button", { name: /Save Template/ }));

        const [saved] = onSave.mock.calls[0];
        expect(saved).toMatchObject({ layoutStyle: "column-bilingual", showTagline: false, templateName: "My Column Invoice" });
        expect(within(document.body).getByText("• Unsaved")).toBeInTheDocument();
    });
});
