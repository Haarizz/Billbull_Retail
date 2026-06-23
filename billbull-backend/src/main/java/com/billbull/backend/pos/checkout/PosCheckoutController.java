package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * POS-specific checkout endpoint. Accepts the cart + payment details in one call,
 * creates the SalesInvoice (salesType=POS_SALE) and records the payment atomically.
 */
@RestController
@RequestMapping("/api/pos/checkout")
@CrossOrigin
public class PosCheckoutController {

    private final SalesInvoiceService invoiceService;
    private final PosSessionService sessionService;
    private final SalesInvoiceRepository invoiceRepository;

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService, SalesInvoiceRepository invoiceRepository) {
        this.invoiceService = invoiceService;
        this.sessionService = sessionService;
        this.invoiceRepository = invoiceRepository;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SalesInvoice> checkout(@RequestBody PosCheckoutRequest request) {
        SalesInvoice invoice = buildInvoice(request);
        SalesInvoice saved = invoiceService.save(invoice);

        // Record payment via existing payment service
        if (request.getAmountTendered() != null && request.getAmountTendered() > 0) {
            double invoiceTotal = saved.getInvoiceTotal() != null ? saved.getInvoiceTotal().doubleValue() : 0.0;
            double paymentAmount = Math.min(request.getAmountTendered(), invoiceTotal);
            String paymentMode = resolvePaymentMode(request);
            String cardRef = request.getCardReference();
            invoiceService.recordPayment(saved.getId(), paymentAmount, paymentMode, cardRef, LocalDate.now(),
                    null, null, null, request.getCombinedPaymentMode());
        }

        // Update session totals
        if (request.getSessionId() != null) {
            sessionService.recordInvoiceOnSession(request.getSessionId(), saved);
        }

        return ResponseEntity.ok(invoiceService.getById(saved.getId()));
    }

    /**
     * List POS invoices for the reprint screen.
     * Returns lightweight invoice summaries (no items) ordered latest-first.
     */
    @GetMapping("/invoices")
    @PreAuthorize("isAuthenticated()")
    public List<SalesInvoice> getPosInvoices(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long branchId) {
        LocalDate from = dateFrom != null ? LocalDate.parse(dateFrom) : LocalDate.now();
        LocalDate to   = dateTo   != null ? LocalDate.parse(dateTo)   : LocalDate.now();
        return invoiceRepository.findPosInvoicesByDateRange(from, to, branchId);
    }

    private SalesInvoice buildInvoice(PosCheckoutRequest req) {
        SalesInvoice inv = new SalesInvoice();
        inv.setSalesType(SalesType.POS_SALE);
        inv.setInvoiceDate(LocalDate.now());
        inv.setCustomerCode(req.getCustomerCode() != null ? req.getCustomerCode() : "WALK-IN");
        inv.setCustomerName(req.getCustomerName() != null ? req.getCustomerName() : "Walk-in Customer");
        inv.setPaymentMode(resolvePaymentMode(req));
        inv.setBranchId(req.getBranchId());
        inv.setBranchName(req.getBranchName());
        inv.setBranchCode(req.getBranchCode());
        inv.setPosSessionId(req.getSessionId());
        inv.setPosTerminalId(req.getTerminalId());
        inv.setPosCounterName(req.getCounterName());
        inv.setBillDiscountAmount(req.getBillDiscountAmount() != null
                ? java.math.BigDecimal.valueOf(req.getBillDiscountAmount()) : null);
        inv.setInternalNotes(req.getNotes());

        if (req.getItems() != null) {
            inv.setItems(req.getItems().stream().map(item -> {
                com.billbull.backend.sales.invoice.SalesInvoiceItem si = new com.billbull.backend.sales.invoice.SalesInvoiceItem();
                si.setItemCode(item.getItemCode());
                si.setItemName(item.getItemName());
                si.setQuantity(item.getQuantity());
                si.setUnit(item.getUnit() != null ? item.getUnit() : "Each");
                si.setPrice(item.getPrice() != null ? java.math.BigDecimal.valueOf(item.getPrice()) : null);
                si.setDiscount(item.getDiscount() != null ? item.getDiscount() : 0.0);
                si.setTaxRate(item.getTaxRate() != null ? item.getTaxRate() : 5.0);
                si.setVoided(Boolean.TRUE.equals(item.getVoided()));
                if (!si.isVoided() && item.getBatchNumber() != null && !item.getBatchNumber().isBlank()) {
                    si.setPinnedBatchNumber(item.getBatchNumber().trim());
                }
                si.setSalesInvoice(inv);
                return si;
            }).toList());
        }

        return inv;
    }

    private String resolvePaymentMode(PosCheckoutRequest req) {
        if (req.getCombinedPaymentMode() != null && !req.getCombinedPaymentMode().isBlank()) {
            return req.getCombinedPaymentMode();
        }
        if (req.getPaymentMode() != null) return req.getPaymentMode();
        return "Cash";
    }
}
