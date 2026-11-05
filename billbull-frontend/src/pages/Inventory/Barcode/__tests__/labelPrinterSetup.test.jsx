import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    LABEL_CONNECTIONS,
    agentZplReadiness,
    buildLabelPrinterPayload,
    conflictingBranchDefault,
    emptyLabelPrinterForm,
    validateLabelPrinterForm,
} from '../labelPrinterSetup';

vi.mock('@billbull/shared/api/posPrinterApi', () => ({
    getPosPrinters: vi.fn(),
    createPosPrinter: vi.fn(),
    updatePosPrinter: vi.fn(),
    updatePosPrinterRuntime: vi.fn(async () => ({})),
    decommissionPosPrinter: vi.fn(),
}));
vi.mock('@billbull/shared/utils/localPrintAgent', () => ({
    listPrintAgentPrinters: vi.fn(),
    testConfiguredPrinter: vi.fn(),
    runtimeStatusFromPrintError: vi.fn(() => ({ runtimeStatus: 'OFFLINE' })),
    runtimeStatusFromPrintSuccess: vi.fn(() => ({ runtimeStatus: 'ONLINE' })),
}));
vi.mock('@billbull/shared/components/AppConfirmBridge', () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock('@billbull/shared/pages/Sales/POS/device/printing/PrintAgentPairing', () => ({ default: () => null }));

const printerApi = await import('@billbull/shared/api/posPrinterApi');
const agent = await import('@billbull/shared/utils/localPrintAgent');
const { default: LabelPrinterSetupPanel } = await import('../LabelPrinterSetupPanel');
const { default: BarcodePrintSettingsDialog } = await import('../BarcodePrintSettingsDialog');
const { normalizeBarcodePrintSettings } = await import('../barcodePrintSettings');

const labelPrinter = (over = {}) => ({
    id: 1,
    deviceCode: 'LBL-1',
    deviceType: 'LABEL_PRINTER',
    deviceName: 'Old Zebra',
    branchId: 7,
    branchName: 'Main',
    connectionType: 'NETWORK_IP',
    ipAddress: '10.0.0.5',
    portNumber: 9100,
    paperSize: '100x150mm',
    printTemplate: 'Label',
    defaultPrinter: true,
    status: 'ACTIVE',
    terminalId: null,
    ...over,
});

describe('label printer setup rules', () => {
    it('requires an IP and a valid port for a network printer', () => {
        const form = { ...emptyLabelPrinterForm(), deviceName: 'Z' };
        expect(validateLabelPrinterForm(form)).toMatch(/IP address/);
        expect(validateLabelPrinterForm({ ...form, ipAddress: '10.0.0.300' })).toMatch(/not a valid/);
        expect(validateLabelPrinterForm({ ...form, ipAddress: '10.0.0.5', portNumber: '70000' })).toMatch(/Port/);
        expect(validateLabelPrinterForm({ ...form, ipAddress: '10.0.0.5' })).toBeNull();
    });

    it('requires a Windows printer name for a USB printer', () => {
        const form = { ...emptyLabelPrinterForm(), deviceName: 'Z', connectionType: LABEL_CONNECTIONS.LOCAL };
        expect(validateLabelPrinterForm(form)).toMatch(/Windows printer/);
        expect(validateLabelPrinterForm({ ...form, systemPrinterName: 'ZDesigner ZD220' })).toBeNull();
    });

    it('always builds a branch-wide label printer and keeps the existing code on edit', () => {
        const form = { ...emptyLabelPrinterForm(), deviceName: ' Z ', ipAddress: '10.0.0.9', portNumber: '9100' };
        const created = buildLabelPrinterPayload(form, { branchId: '7', branchName: 'Main' });
        expect(created).toMatchObject({
            deviceType: 'LABEL_PRINTER', deviceName: 'Z', branchId: 7, terminalId: null,
            connectionType: 'NETWORK_IP', ipAddress: '10.0.0.9', portNumber: 9100, systemPrinterName: null, printTemplate: 'Label',
        });
        expect(created.deviceCode).toMatch(/^LBL-B7-/);

        const existing = labelPrinter({ terminalId: 'T5', paperSize: '50x25mm' });
        const edited = buildLabelPrinterPayload({ ...form, connectionType: 'USB', systemPrinterName: 'ZD220' }, { branchId: 7, existing });
        expect(edited).toMatchObject({ deviceCode: 'LBL-1', terminalId: null, connectionType: 'USB', systemPrinterName: 'ZD220', ipAddress: null, portNumber: null, paperSize: '50x25mm' });
    });

    it('finds the branch-wide default that must be cleared, ignoring terminal-bound and self', () => {
        const list = [labelPrinter({ id: 1, terminalId: 'T1' }), labelPrinter({ id: 2 }), labelPrinter({ id: 3, defaultPrinter: false })];
        expect(conflictingBranchDefault(list, 3)?.id).toBe(2);
        expect(conflictingBranchDefault(list, 2)).toBeNull();
    });

    it('says what the agent on this PC still needs for labels', () => {
        expect(agentZplReadiness({ agentProtocol: 'zpl' }).ok).toBe(true);
        expect(agentZplReadiness({ agentProtocol: null }).ok).toBe(false);
        expect(agentZplReadiness({ agentProtocol: 'escpos' }).text).toMatch(/receipts/);
        expect(agentZplReadiness(undefined).ok).toBe(false);
    });
});

describe('LabelPrinterSetupPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        agent.listPrintAgentPrinters.mockResolvedValue([]);
    });

    it('adds a network printer as the new default after clearing the old default', async () => {
        const old = labelPrinter();
        printerApi.getPosPrinters.mockResolvedValue([old]);
        printerApi.updatePosPrinter.mockResolvedValue({});
        printerApi.createPosPrinter.mockResolvedValue({ id: 2 });
        const onChanged = vi.fn();
        render(<LabelPrinterSetupPanel branchId={7} branchLabel="Main" onChanged={onChanged} />);

        await screen.findByText('Old Zebra');
        await userEvent.click(screen.getByRole('button', { name: /Add label printer/ }));
        await userEvent.type(screen.getByLabelText('Printer name'), 'Stockroom');
        await userEvent.type(screen.getByLabelText('IP address'), '10.0.0.8');
        await userEvent.click(screen.getByRole('checkbox'));
        expect(screen.getByText(/Replaces "Old Zebra"/)).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: 'Save printer' }));

        await waitFor(() => expect(printerApi.createPosPrinter).toHaveBeenCalled());
        expect(printerApi.updatePosPrinter).toHaveBeenCalledWith(1, expect.objectContaining({ defaultPrinter: false, deviceCode: 'LBL-1' }));
        expect(printerApi.updatePosPrinter.mock.invocationCallOrder[0]).toBeLessThan(printerApi.createPosPrinter.mock.invocationCallOrder[0]);
        expect(printerApi.createPosPrinter).toHaveBeenCalledWith(expect.objectContaining({
            deviceName: 'Stockroom', ipAddress: '10.0.0.8', portNumber: 9100, defaultPrinter: true, branchId: 7, terminalId: null,
        }));
        expect(onChanged).toHaveBeenCalled();
    });

    it('sends a ZPL test label sized to the page template and records the result', async () => {
        printerApi.getPosPrinters.mockResolvedValue([labelPrinter()]);
        agent.testConfiguredPrinter.mockResolvedValue({ message: 'Sent to 10.0.0.5:9100' });
        render(<LabelPrinterSetupPanel branchId={7} branchLabel="Main" testLabelSize={{ widthMm: 70, heightMm: 50 }} />);

        const row = (await screen.findByText('Old Zebra')).closest('li');
        await userEvent.click(within(row).getByRole('button', { name: /Test/ }));

        await screen.findByText('Sent to 10.0.0.5:9100');
        const [, { zplBase64 }] = agent.testConfiguredPrinter.mock.calls[0];
        const zpl = atob(zplBase64);
        expect(zpl).toMatch(/^\^XA/);
        expect(zpl).toContain(`^PW${Math.round(70 * 8)}`);
        expect(printerApi.updatePosPrinterRuntime).toHaveBeenCalledWith(1, { runtimeStatus: 'ONLINE' });
    });

    it('offers USB printers the agent sees and warns when one is not set up for labels', async () => {
        printerApi.getPosPrinters.mockResolvedValue([]);
        agent.listPrintAgentPrinters.mockResolvedValue([{ name: 'ZDesigner ZD220', agentProtocol: null }]);
        render(<LabelPrinterSetupPanel branchId={7} branchLabel="Main" />);

        const agentRow = (await screen.findByText('ZDesigner ZD220')).closest('li');
        await userEvent.click(within(agentRow).getByRole('button', { name: /Add/ }));

        expect(screen.getByLabelText('Windows printer').value).toBe('ZDesigner ZD220');
        expect(screen.getAllByText(/Zebra label printer \(ZPL\)/).length).toBeGreaterThan(0);
    });

    it('asks for a branch instead of guessing one', () => {
        render(<LabelPrinterSetupPanel branchId="ALL" />);
        expect(screen.getByText(/Label printers belong to a branch/)).toBeTruthy();
        expect(printerApi.getPosPrinters).not.toHaveBeenCalled();
    });
});

describe('Print Settings → Printers tab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        agent.listPrintAgentPrinters.mockResolvedValue([]);
    });

    const renderSettings = (props = {}) => {
        const onSave = vi.fn();
        const onReloadPrinters = vi.fn();
        const branchPrinters = [labelPrinter({ id: 1, deviceName: 'Old Zebra' }), labelPrinter({ id: 2, deviceName: 'Back Zebra', defaultPrinter: false })];
        render(<BarcodePrintSettingsDialog
            open
            settings={normalizeBarcodePrintSettings(null)}
            templates={[]}
            branchId={7}
            branchLabel="Main"
            printers={branchPrinters}
            printersLoading={false}
            printersError={null}
            onReloadPrinters={onReloadPrinters}
            onSave={onSave}
            onClose={() => {}}
            {...props}
        />);
        return { onSave, onReloadPrinters };
    };

    it('shows the branch default on General and opens the setup from there', async () => {
        printerApi.getPosPrinters.mockResolvedValue([labelPrinter()]);
        renderSettings();

        expect(screen.getByText(/Branch default — Old Zebra/)).toBeTruthy();
        expect(screen.queryByText('Branch label printers')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.getByRole('tab', { name: /Printers/ }).getAttribute('aria-selected')).toBe('true');
        expect(await screen.findByText(/Branch label printers/)).toBeTruthy();
    });

    it('saves this PC\'s printer choice from the Printers tab and reloads the picker after a change', async () => {
        printerApi.getPosPrinters.mockResolvedValue([labelPrinter()]);
        printerApi.updatePosPrinter.mockResolvedValue({});
        const { onSave, onReloadPrinters } = renderSettings({ initialTab: 'printers' });

        await userEvent.selectOptions(screen.getByLabelText('This PC prints labels to'), '2');
        await userEvent.click(screen.getByRole('button', { name: /Save Settings/ }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ printerByBranch: { 7: '2' } }));

        const row = (await screen.findAllByText('Old Zebra')).map((n) => n.closest('li')).find(Boolean);
        await userEvent.click(within(row).getByRole('button', { name: /Edit/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Save printer' }));
        await waitFor(() => expect(onReloadPrinters).toHaveBeenCalled());
    });
});
