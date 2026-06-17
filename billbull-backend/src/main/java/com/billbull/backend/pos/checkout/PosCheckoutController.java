package com.billbull.backend.pos.checkout;

import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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

    public PosCheckoutController(SalesInvoiceService invoiceService, PosSessionService sessionService) {
        this.invoiceService = invoiceService;
        this.sessionService = sessionService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SalesInvoice> checkout(@RequestBody PosCheckoutRequest request) {
        SalesInvoice invoice = buildInvoice(request);
        SalesInvoice saved = invoiceService.save(invoice);

        // Record payment via existing payment service
        if (request.getAmountTendered() != null && request.getAmountTendered() > 0) {
            double paymentAmount = Math.min(request.getAmountTendered(), saved.getInvoiceTotal());
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
        inv.setBillDiscountAmount(req.getBillDiscountAmount());
        inv.setInternalNotes(req.getNotes());

        if (req.getItems() != null) {
            inv.setItems(req.getItems().stream().map(item -> {
                com.billbull.backend.sales.invoice.SalesInvoiceItem si = new com.billbull.backend.sales.invoice.SalesInvoiceItem();
                si.setItemCode(item.getItemCode());
                si.setItemName(item.getItemName());
                si.setQuantity(item.getQuantity());
                si.setUnit(item.getUnit() != null ? item.getUnit() : "Each");
                si.setPrice(item.getPrice());
                si.setDiscount(item.getDiscount() != null ? item.getDiscount() : 0.0);
                si.setTaxRate(item.getTaxRate() != null ? item.getTaxRate() : 5.0);
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
