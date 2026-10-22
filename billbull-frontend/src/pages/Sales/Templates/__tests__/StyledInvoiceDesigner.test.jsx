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

        await user.click(screen.getByRole("switch", { name: "Hide all in Footer" }));

        await waitFor(() => {
            const settings = lastSettings();
            expect(settings.showSignature).toBe(false);
            expect(settings.showThankYou).toBe(false);
            expect(settings.showContactLine).toBe(false);
        });
        expect(screen.getByText("0/3")).toBeInTheDocument();
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
