import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPosPrinters } from '../api/posPrinterApi';
import { buildEscPosReceiptBase64 } from '../utils/escPosReceipt';
import { resolvePrinterForContext, sendEscPosReceiptToConfiguredPrinter } from '../utils/localPrintAgent';

// Thermal (58mm/80mm) printing of a back-office Sales Invoice.
//
// Thermal has only ever run from the POS screens; this bridges the same proven
// pipeline (resolvePrinterForContext -> buildEscPosReceiptBase64 ->
// sendEscPosReceiptToConfiguredPrinter) to the Sales Invoice preview. It's a thin
// adapter, not a second renderer: buildEscPosReceipt reads only id/invoiceNumber/
// invoiceDate/createdAt/items off the invoice, and its item reader already falls back
// across the field names the Sales Invoice DTO uses (itemName, quantity, price,
// netAmount, taxRate, itemCode).
//
// There's no terminal/cashier/counter context in the back office, so those receipt
// fields are simply omitted rather than faked.
export function useInvoiceThermalPrint({ branchId, company } = {}) {
    const [printers, setPrinters] = useState([]);
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getPosPrinters({ branchId: branchId ?? undefined, deviceType: 'RECEIPT_PRINTER' })
            .then((list) => { if (!cancelled && Array.isArray(list)) setPrinters(list); })
            .catch(() => { if (!cancelled) setPrinters([]); });
        return () => { cancelled = true; };
    }, [branchId]);

    const printer = resolvePrinterForContext(printers, {
        deviceType: 'RECEIPT_PRINTER',
        branchId: branchId ?? null,
    });

    // Surfaced as a tooltip on the disabled menu rows so the user knows WHY it's off.
    const thermalDisabledReason = printer
        ? ''
        : 'No active receipt printer is configured for this branch.';

    const printThermal = useCallback(async (invoice, paperSize = '80mm') => {
        if (!invoice) return;
        if (!printer) {
            toast.error('No active receipt printer is configured for this branch.');
            return;
        }
        setPrinting(true);
        try {
            const dataBase64 = await buildEscPosReceiptBase64(paperSize, invoice, {
                companyName: company?.companyName || company?.name || 'BillBull',
                trn: company?.trn || '',
                documentTitle: 'TAX INVOICE',
                currency: company?.currency || company?.currencySymbol || 'AED',
                outletAddress: company?.address || '',
                outletPhone: company?.phone || '',
            });
            await sendEscPosReceiptToConfiguredPrinter(printer, {
                dataBase64,
                receiptText: `Sales Invoice ${invoice.invoiceNumber || ''}`,
                title: `Sales Invoice ${invoice.invoiceNumber || ''}`,
                sourceType: 'SALES_INVOICE',
                sourceRefId: invoice.id != null ? String(invoice.id) : undefined,
            });
            toast.success(`Sent to ${printer.printerName || 'printer'} (${paperSize})`);
        } catch (err) {
            console.error('Thermal print failed', err);
            toast.error(err?.message || 'Thermal print failed.');
        } finally {
            setPrinting(false);
        }
    }, [printer, company]);

    return { printThermal, thermalDisabledReason, thermalPrinting: printing };
}

export default useInvoiceThermalPrint;
