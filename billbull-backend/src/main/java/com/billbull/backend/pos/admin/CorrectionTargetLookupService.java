package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Enterprise Console &gt; POS Administration — the pickers that turn something an operator
 * recognises into a correction target: an invoice number into the {@code RECEIPT_VOUCHER} that
 * settled it, and a terminal/cashier/date into the closed {@code POS_SESSION} whose drawer count
 * is being restated. Nobody at a counter knows either surrogate id.
 *
 * <p>Read-only by construction: it never mutates a {@link SalesInvoice}, {@link ReceiptVoucher} or
 * {@link PosSession}, it only answers "which record sits behind this, and may it be corrected?".
 * Every genuine validation still runs again at request time in
 * {@link PosTransactionCorrectionService} / {@link PosSessionDenominationCorrectionService} — this
 * service exists so the operator sees the block (draft invoice, no settlement receipt, open
 * session, correction already pending) while typing rather than after filling in the whole form.
 */
@Service
public class CorrectionTargetLookupService {

    private static final int MAX_RESULTS = 15;

    private final SalesInvoiceRepository invoiceRepository;
    private final ReceiptVoucherRepository receiptVoucherRepository;
    private final CustomerRepository customerRepository;
    private final PosSessionRepository sessionRepository;
    private final PosSessionDenominationCorrectionRepository denominationCorrectionRepository;

    public CorrectionTargetLookupService(SalesInvoiceRepository invoiceRepository,
                                          ReceiptVoucherRepository receiptVoucherRepository,
                                          CustomerRepository customerRepository,
                                          PosSessionRepository sessionRepository,
                                          PosSessionDenominationCorrectionRepository denominationCorrectionRepository) {
        this.invoiceRepository = invoiceRepository;
        this.receiptVoucherRepository = receiptVoucherRepository;
        this.customerRepository = customerRepository;
        this.sessionRepository = sessionRepository;
        this.denominationCorrectionRepository = denominationCorrectionRepository;
    }

    /**
     * Closed-session typeahead for denomination corrections. A blank {@code q} lists the most
     * recently closed sessions, because the common case is correcting a drawer that was just
     * counted — the operator should not have to know a session id to find it.
     */
    @Transactional(readOnly = true)
    public List<CorrectionSessionTargetResponse> searchClosedSessions(String q) {
        List<PosSession> sessions = sessionRepository.searchClosedSessions(
                q == null ? "" : q.trim(), PageRequest.of(0, MAX_RESULTS));
        List<CorrectionSessionTargetResponse> results = new ArrayList<>(sessions.size());
        for (PosSession session : sessions) {
            results.add(toSessionTarget(session));
        }
        return results;
    }

    private CorrectionSessionTargetResponse toSessionTarget(PosSession session) {
        CorrectionSessionTargetResponse r = new CorrectionSessionTargetResponse();
        r.setSessionId(session.getId());
        r.setTerminalId(session.getTerminalId());
        r.setCounterName(session.getCounterName());
        r.setClosedBy(session.getClosedByDisplayName() != null ? session.getClosedByDisplayName() : session.getClosedBy());
        r.setClosedAt(session.getClosedAt());
        r.setSessionDate(session.getSessionDate());
        r.setClosingCash(session.getClosingCash());
        r.setExpectedCash(session.getExpectedCash());
        r.setAlreadyCorrected(!denominationCorrectionRepository
                .findAppliedForSessionOrderByAppliedAtDesc(session.getId()).isEmpty());

        if (!denominationCorrectionRepository.findActiveForSession(session.getId()).isEmpty()) {
            r.setCorrectable(false);
            r.setBlockReason("A correction is already pending resolution for this session.");
            return r;
        }
        String denominations = session.getClosingDenominationsJson();
        if (denominations == null || denominations.isBlank() || "{}".equals(denominations.trim())) {
            r.setCorrectable(false);
            r.setBlockReason("This session was closed without a denomination breakdown — there is no count to restate.");
            return r;
        }
        r.setCorrectable(true);
        return r;
    }

    /**
     * The current invoice-numbering prefix (e.g. {@code INV-2026-}), derived from the newest
     * invoice on file by stripping its trailing sequence digits. The form pins this in front of
     * the search box so the operator types only the sequence. Returns {@code null} when no
     * invoice exists yet, in which case the UI simply shows a plain search box.
     */
    @Transactional(readOnly = true)
    public String currentInvoicePrefix() {
        List<String> latest = invoiceRepository.findLatestInvoiceNumbers(PageRequest.of(0, 1));
        if (latest.isEmpty() || latest.get(0) == null) return null;
        String number = latest.get(0);
        int end = number.length();
        while (end > 0 && Character.isDigit(number.charAt(end - 1))) end--;
        return end == 0 ? null : number.substring(0, end);
    }

    /**
     * Invoice-number typeahead. {@code q} may be the trailing sequence only ("0211"), the whole
     * number, or any fragment of it; matching is a case-insensitive contains so the prefixed and
     * unprefixed forms both resolve.
     */
    @Transactional(readOnly = true)
    public List<CorrectionInvoiceTargetResponse> searchInvoices(String q) {
        if (q == null || q.isBlank()) return List.of();
        List<SalesInvoice> invoices =
                invoiceRepository.searchByInvoiceNumberFragment(q.trim(), PageRequest.of(0, MAX_RESULTS));
        List<CorrectionInvoiceTargetResponse> results = new ArrayList<>(invoices.size());
        for (SalesInvoice invoice : invoices) {
            results.add(toTarget(invoice));
        }
        return results;
    }

    private CorrectionInvoiceTargetResponse toTarget(SalesInvoice invoice) {
        CorrectionInvoiceTargetResponse r = new CorrectionInvoiceTargetResponse();
        r.setInvoiceId(invoice.getId());
        r.setInvoiceNumber(invoice.getInvoiceNumber());
        r.setInvoiceDate(invoice.getInvoiceDate());
        r.setInvoiceStatus(invoice.getStatus() != null ? invoice.getStatus().name() : null);
        r.setCustomerCode(invoice.getCustomerCode());
        r.setCustomerName(resolveCustomerName(invoice.getCustomerCode(), invoice.getCustomerName()));
        r.setInvoiceTotal(invoice.getInvoiceTotal());
        r.setBranchName(invoice.getBranchName());

        ReceiptVoucher receipt = resolveSettlementReceipt(invoice.getId());
        if (receipt == null) {
            r.setCorrectable(false);
            r.setBlockReason("No settlement receipt exists for this invoice yet — nothing to correct.");
            return r;
        }
        r.setReceiptVoucherId(receipt.getId());
        r.setReceiptVoucherNumber(receipt.getVoucherId());
        r.setReceiptCustomerCode(receipt.getCustomerCode());
        r.setReceiptPaymentMode(receipt.getPaymentMode());
        r.setReceiptAmount(receipt.getAmount());
        r.setCorrectable(true);
        return r;
    }

    /**
     * The receipt a correction should target for an invoice. An invoice can carry several
     * receipts (part payments); the newest completed one is the settlement record an operator
     * means when they say "this sale was rung up wrong". Cancelled/voided receipts are skipped
     * outright — {@link PosTransactionCorrectionService} refuses them anyway.
     */
    private ReceiptVoucher resolveSettlementReceipt(Long invoiceId) {
        return receiptVoucherRepository.findBySalesInvoiceId(invoiceId).stream()
                .filter(rv -> rv.getStatus() == null
                        || (!rv.getStatus().equalsIgnoreCase("Cancelled") && !rv.getStatus().equalsIgnoreCase("Voided")))
                .max(Comparator.comparing(ReceiptVoucher::getId))
                .orElse(null);
    }

    /** Falls back to the name stamped on the invoice when the customer record is gone. */
    private String resolveCustomerName(String customerCode, String fallback) {
        if (customerCode == null || customerCode.isBlank()) return fallback;
        return customerRepository.findByCode(customerCode)
                .map(c -> c.getName() != null ? c.getName() : fallback)
                .orElse(fallback);
    }
}
