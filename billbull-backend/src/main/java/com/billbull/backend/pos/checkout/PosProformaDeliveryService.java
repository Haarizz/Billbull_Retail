package com.billbull.backend.pos.checkout;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.reservation.PosStockReservationService;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.receipt.ZatcaQrGenerator;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.settings.branch.BranchRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Set;

/**
 * The PI Flow delivery workflow (BillBull Console → Behavior → Delivery Workflow → PI Flow).
 *
 * <p>Under PI Flow a delivery order does not become a sale when it leaves the shop. Going out
 * for delivery {@linkplain #issue issues} a Pro-forma Invoice: the sales invoice is created as
 * usual (number, lines, totals) but stays DRAFT, flagged {@code posProformaPending}. DRAFT is what
 * keeps it out of everything that counts sales — no stock movement, no GL journal, no session
 * totals, and every sales report already skips DRAFT invoices — while still listing it in the
 * Sales Invoice register as a draft and in Delivery Settlement as an order to settle.
 *
 * <p>Delivery Settlement then {@linkplain #convert converts} it, whichever way the delivery
 * ends: settled by pay mode, or returned. Conversion posts the invoice through exactly the path
 * a counter sale posts through ({@code SalesInvoiceService#updateStatus}), dated on the
 * settlement's business date and attached to the settling session, so the sale lands in the
 * sales reports and sales list of the day it was actually concluded. A return converts first and
 * then credits the goods back, so the refused order reads in the reports as a sale and its
 * credit note — the same trail a returned DEFAULT_SETTLEMENT delivery leaves.
 *
 * <p><b>Stock while the goods are out.</b> A DRAFT invoice moves no stock, so without a hold the
 * same units would look available to the next cashier while they sit in the van. Each non-batch
 * stock line is therefore held with a {@code POS_PROFORMA} soft reservation (the layaway
 * mechanism), released inside the conversion transaction immediately before the invoice posts.
 * An order raised from a confirmed Sales Order needs no extra hold: the order keeps reserving its
 * stock until conversion marks it INVOICED. Batch-controlled lines are not soft-reserved — batches
 * are picked by FEFO when the invoice posts at settlement.
 */
@Service
@Slf4j
public class PosProformaDeliveryService {

    /** Sales Order statuses that still reserve their stock (see SalesOrderRepository). */
    private static final Set<SalesOrderStatus> RESERVING_ORDER_STATUSES = EnumSet.of(
            SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_PAID, SalesOrderStatus.FULLY_PAID);

    private final SalesInvoiceRepository invoiceRepository;
    private final SalesInvoiceService invoiceService;
    private final PosStockReservationService stockReservationService;
    private final ProductRepository productRepository;
    private final ProductPackingRepository packingRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final PosSessionRepository sessionRepository;
    private final PosSessionService sessionService;
    private final BranchRepository branchRepository;
    private final BusinessDayClock businessDayClock;

    public PosProformaDeliveryService(SalesInvoiceRepository invoiceRepository,
                                      SalesInvoiceService invoiceService,
                                      PosStockReservationService stockReservationService,
                                      ProductRepository productRepository,
                                      ProductPackingRepository packingRepository,
                                      SalesOrderRepository salesOrderRepository,
                                      PosSessionRepository sessionRepository,
                                      PosSessionService sessionService,
                                      BranchRepository branchRepository,
                                      BusinessDayClock businessDayClock) {
        this.invoiceRepository = invoiceRepository;
        this.invoiceService = invoiceService;
        this.stockReservationService = stockReservationService;
        this.productRepository = productRepository;
        this.packingRepository = packingRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.sessionRepository = sessionRepository;
        this.sessionService = sessionService;
        this.branchRepository = branchRepository;
        this.businessDayClock = businessDayClock;
    }

    /**
     * Turns a freshly saved DRAFT delivery invoice into a Pro-forma Invoice out for delivery:
     * flags it and holds its stock. Nothing is posted.
     */
    @Transactional
    public SalesInvoice issue(Long invoiceId) {
        SalesInvoice invoice = invoiceRepository.findByIdWithItems(invoiceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (invoice.getStatus() != SalesInvoiceStatus.DRAFT) {
            throw new IllegalStateException("Only a DRAFT invoice can be issued as a Pro-forma Invoice: "
                    + invoice.getInvoiceNumber() + " is " + invoice.getStatus());
        }
        invoice.setPosProformaPending(Boolean.TRUE);
        invoice.setPosProformaIssuedAt(businessDayClock.now());
        invoiceRepository.save(invoice);

        if (!stockHeldBySalesOrder(invoice)) {
            reserveStock(invoice);
        }
        log.info("POS Pro-forma Invoice {} issued for delivery (driver={})",
                invoice.getInvoiceNumber(), invoice.getPosDriverName());
        return invoice;
    }

    /**
     * Converts a pending Pro-forma Invoice into the final sales invoice. Idempotent: an invoice
     * that is not (or no longer) a pending PI is left alone and {@code false} is returned, so a
     * settlement retry or a concurrent second settlement cannot post it twice — the row lock taken
     * here serialises them, and the loser finds the flag already cleared.
     *
     * <p>Joins the caller's transaction when there is one: Delivery Settlement converts inside its
     * own locked settlement transaction, so a payment that fails rolls the conversion back with it.
     *
     * @param sessionId    the settling session; when it is OPEN the sale is re-homed onto it, so it
     *                     is counted in the session (and Z-Report) in which it was concluded
     * @param businessDate the settlement's business date, which becomes the invoice date
     * @return true when this call converted the invoice
     */
    @Transactional
    public boolean convert(Long invoiceId, Long sessionId, LocalDate businessDate) {
        SalesInvoice invoice = invoiceRepository.findByIdForUpdate(invoiceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (!Boolean.TRUE.equals(invoice.getPosProformaPending())) {
            return false;
        }
        if (invoice.getStatus() != SalesInvoiceStatus.DRAFT) {
            // Posted by some other route while flagged (should not happen). Clear the stale flag
            // rather than post a second time.
            invoice.setPosProformaPending(Boolean.FALSE);
            invoiceRepository.save(invoice);
            stockReservationService.releaseSourceDocument(
                    PosStockReservationService.DOC_TYPE_POS_PROFORMA, invoiceId);
            return false;
        }

        // Release the PI's own hold first, in this same transaction, so the stock check run by
        // the posting below sees those units as available to this invoice.
        stockReservationService.releaseSourceDocument(PosStockReservationService.DOC_TYPE_POS_PROFORMA, invoiceId);

        PosSession settlingSession = openSession(sessionId);
        if (businessDate != null) {
            invoice.setInvoiceDate(businessDate);
        }
        if (settlingSession != null) {
            invoice.setPosSessionId(settlingSession.getId());
        }
        invoice.setPosProformaPending(Boolean.FALSE);
        invoice.setPosProformaConvertedAt(businessDayClock.now());
        invoiceRepository.save(invoice);

        // The same posting a counter sale goes through: stock check, FEFO, auto delivery note,
        // stock deduction and the GL invoice journal. CONFIRMED because nothing is paid yet — the
        // settlement records its payment right after, which moves it on to PAID.
        invoiceService.updateStatus(invoiceId, SalesInvoiceStatus.CONFIRMED);
        invoiceService.completeSalesOrderConversion(invoiceId);

        SalesInvoice posted = invoiceService.getByIdBypassingOwnership(invoiceId);
        if (settlingSession != null) {
            // Counted exactly as a DEFAULT_SETTLEMENT delivery is counted when it goes out.
            sessionService.recordInvoiceOnSession(settlingSession.getId(), posted);
        }
        archiveReceiptQr(posted);

        log.info("POS Pro-forma Invoice {} converted to a sales invoice on {} (session={})",
                posted.getInvoiceNumber(), posted.getInvoiceDate(),
                settlingSession != null ? settlingSession.getId() : "-");
        return true;
    }

    /**
     * The Sales Order advance a pending PI will absorb when it is converted — zero for anything
     * that is not a pending PI taken up from an order with an open advance. Delivery Settlement
     * shows it as already paid, so the cashier collects only the remainder.
     */
    public BigDecimal pendingSalesOrderAdvance(SalesInvoice invoice) {
        if (invoice == null || !Boolean.TRUE.equals(invoice.getPosProformaPending())) return BigDecimal.ZERO;
        return invoiceService.openSalesOrderAdvance(invoice.getLinkedSalesOrder());
    }

    /** The settling session, when one was given and it is open; otherwise null. */
    private PosSession openSession(Long sessionId) {
        if (sessionId == null) return null;
        return sessionRepository.findById(sessionId)
                .filter(s -> s.getStatus() == PosSessionStatus.OPEN)
                .orElse(null);
    }

    /**
     * An order taken up from a Sales Order that is still in a reserving status keeps holding its
     * stock through the order itself until conversion marks it INVOICED; a second hold here would
     * count the same units twice.
     */
    private boolean stockHeldBySalesOrder(SalesInvoice invoice) {
        String soNumber = invoice.getLinkedSalesOrder();
        if (soNumber == null || soNumber.isBlank()) return false;
        return salesOrderRepository.findBySoNumber(soNumber)
                .map(so -> RESERVING_ORDER_STATUSES.contains(so.getStatus()))
                .orElse(false);
    }

    private void reserveStock(SalesInvoice invoice) {
        if (invoice.getItems() == null) return;
        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.isVoided() || item.getId() == null || item.getItemCode() == null) continue;
            if (item.getWarehouseId() == null) continue;
            Product product = productRepository.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null);
            // Service lines own no stock; batch lines are picked by FEFO at conversion.
            if (product == null || product.isService() || product.isBatch()) continue;
            int qty = baseQty(product.getId(), item.getUnit(), item.getQuantity())
                    + baseQty(product.getId(), item.getUnit(), item.getFoc());
            if (qty <= 0) continue;
            stockReservationService.reserveForProformaLine(invoice.getId(), item.getId(), product.getId(),
                    item.getItemCode(), item.getWarehouseId(), qty);
        }
    }

    /** Selling-unit quantity in base units, via the product's packing conversion. */
    private int baseQty(Long productId, String unitName, Integer qty) {
        int q = qty != null ? qty : 0;
        if (q <= 0 || unitName == null || unitName.isBlank()) return q;
        return packingRepository.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? p.getConversion().multiply(BigDecimal.valueOf(q)).setScale(0, RoundingMode.HALF_UP).intValue()
                        : q)
                .orElse(q);
    }

    /** Same receipt QR a checkout archives — generated now, for the final invoice. Best-effort. */
    private void archiveReceiptQr(SalesInvoice invoice) {
        try {
            String sellerName = invoice.getBranchName();
            String trn = null;
            if (invoice.getBranchId() != null) {
                var branch = branchRepository.findById(invoice.getBranchId()).orElse(null);
                if (branch != null) {
                    if (sellerName == null || sellerName.isBlank()) sellerName = branch.getName();
                    trn = branch.getTrnNumber();
                }
            }
            BigDecimal total = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : BigDecimal.ZERO;
            BigDecimal vat = invoice.getTaxTotal() != null ? invoice.getTaxTotal() : BigDecimal.ZERO;
            var at = invoice.getInvoiceDate() != null ? invoice.getInvoiceDate().atStartOfDay() : businessDayClock.now();
            invoiceService.archiveReceiptQr(invoice.getId(), ZatcaQrGenerator.generate(sellerName, trn, at, total, vat));
        } catch (Exception e) {
            log.warn("Receipt QR archival failed for converted PI {}: {}", invoice.getInvoiceNumber(), e.getMessage());
        }
    }
}
