package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@Slf4j
public class SalesReturnService {

    @Autowired
    private SalesReturnRepository salesReturnRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductPricingRepository productPricingRepository;

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        return salesReturnRepository.findAll();
    }

    public SalesReturn getReturnById(Long id) {
        return salesReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Return not found with ID: " + id));
    }

    @Transactional
    public SalesReturn saveReturn(SalesReturn salesReturn) {
        if (salesReturn.getId() != null) {
            SalesReturn existing = getReturnById(salesReturn.getId());
            if (existing.getStatus() == SalesReturnStatus.APPROVED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Approved returns cannot be modified. Create a reversal instead.");
            }
        }

        if (salesReturn.getId() == null
                && (salesReturn.getReturnNumber() == null || salesReturn.getReturnNumber().isEmpty())) {
            salesReturn.setReturnNumber(generateReturnNumber());
        }

        if (salesReturn.getStatus() == null) {
            salesReturn.setStatus(SalesReturnStatus.DRAFT);
        }

        if (salesReturn.getReturnDate() == null) {
            salesReturn.setReturnDate(LocalDate.now());
        }

        if (salesReturn.getItems() != null) {
            salesReturn.getItems().forEach(item -> item.setSalesReturn(salesReturn));
        }

        return salesReturnRepository.save(salesReturn);
    }

    @Transactional
    public void deleteReturn(Long id) {
        SalesReturn existing = getReturnById(id);
        if (existing.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be deleted.");
        }
        salesReturnRepository.deleteById(id);
    }

    public String generateReturnNumber() {
        String year   = String.valueOf(LocalDate.now().getYear());
        String prefix = "SR-" + year + "-";

        Optional<SalesReturn> lastReturn = salesReturnRepository.findTopByOrderByReturnNumberDesc();
        int lastNum = 0;

        if (lastReturn.isPresent()) {
            String lastReturnNum = lastReturn.get().getReturnNumber();
            if (lastReturnNum != null && lastReturnNum.startsWith(prefix)) {
                try {
                    String[] parts = lastReturnNum.split("-");
                    if (parts.length >= 3) {
                        lastNum = Integer.parseInt(parts[2]);
                    }
                } catch (NumberFormatException e) {
                    // fall back to 0
                }
            }
        }

        return prefix + String.format("%04d", lastNum + 1);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getReturnStats() {
        Map<String, Object> stats = new HashMap<>();

        LocalDate today        = LocalDate.now();
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart   = currentMonth.atDay(1);
        LocalDate monthEnd     = currentMonth.atEndOfMonth();

        Double todayReturns  = salesReturnRepository.getTotalReturnsForDate(today);
        Double monthReturns  = salesReturnRepository.getTotalReturnsBetweenDates(monthStart, monthEnd);
        Double totalApproved = salesReturnRepository.getTotalApprovedReturns();
        long   totalCount    = salesReturnRepository.count();

        stats.put("todayReturns",         todayReturns  != null ? todayReturns  : 0.0);
        stats.put("thisMonthReturns",      monthReturns  != null ? monthReturns  : 0.0);
        stats.put("totalApprovedReturns",  totalApproved != null ? totalApproved : 0.0);
        stats.put("totalTransactions",     totalCount);

        return stats;
    }

    @Transactional
    public SalesReturn updateStatus(Long id, SalesReturnStatus status) {
        SalesReturn salesReturn = getReturnById(id);

        if (salesReturn.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be modified.");
        }

        salesReturn.setStatus(status);
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (status == SalesReturnStatus.APPROVED) {
            postJournalForApprovedReturn(saved);
        }
        return saved;
    }

    // ---------------------------------------------------------------
    // Private — journal posting logic
    // ---------------------------------------------------------------

    /**
     * Determines:
     *  1. Whether revenue was already recognized (linked invoice was delivered)
     *     so the correct account is debited (Sales Revenue vs Deferred Revenue).
     *  2. The actual COGS to reverse using real product cost from the product
     *     master, instead of a fictional percentage.
     */
    private void postJournalForApprovedReturn(SalesReturn salesReturn) {
        // --- 1. Determine revenue account (recognized vs deferred) ---
        boolean revenueWasRecognized = resolveRevenueRecognized(salesReturn);

        // --- 2. Calculate COGS using actual product cost ---
        BigDecimal costOfGoodsReturned = resolveActualCogs(salesReturn);

        // --- 3. Post ---
        postingEngineService.createJournalFromSalesReturn(salesReturn, costOfGoodsReturned, revenueWasRecognized);
    }

    /**
     * Returns true if the linked invoice has already been delivered
     * (i.e., revenue was recognized at DN delivery).
     *
     * Falls back to true (assumes recognized) when the linked invoice
     * cannot be found — this is the safer choice for accounting:
     * it debits Sales Revenue rather than Deferred Revenue, which
     * is verifiable in the GL.
     */
    private boolean resolveRevenueRecognized(SalesReturn salesReturn) {
        String linkedInvoice = salesReturn.getLinkedInvoice();
        if (linkedInvoice == null || linkedInvoice.isBlank()) {
            log.warn("[SalesReturn] {} has no linkedInvoice — assuming revenue was recognized (defaulting to Sales Revenue debit).",
                    salesReturn.getReturnNumber());
            return true; // safe default — debit Sales Revenue
        }

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(linkedInvoice);
        if (invoiceOpt.isEmpty()) {
            log.warn("[SalesReturn] {} — linked invoice '{}' not found in DB. Assuming revenue was recognized.",
                    salesReturn.getReturnNumber(), linkedInvoice);
            return true;
        }

        SalesInvoice invoice = invoiceOpt.get();
        boolean recognized = invoice.getDeliveryStatus() == DeliveryStatus.DELIVERED;
        log.info("[SalesReturn] {} — linked invoice '{}' deliveryStatus={}, revenueWasRecognized={}",
                salesReturn.getReturnNumber(), linkedInvoice, invoice.getDeliveryStatus(), recognized);
        return recognized;
    }

    /**
     * Looks up the actual cost price for each returned item from the product
     * master and calculates total COGS to reverse.
     *
     * If a product's cost cannot be determined (product not found or no
     * pricing record), its contribution to COGS is zero and a warning is
     * logged.  A manual journal entry will be required for that item.
     */
    private BigDecimal resolveActualCogs(SalesReturn salesReturn) {
        if (salesReturn.getItems() == null || salesReturn.getItems().isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalCogs = BigDecimal.ZERO;

        for (SalesReturnItem item : salesReturn.getItems()) {
            String itemCode = item.getItemCode();
            int    returnQty = item.getReturnQty() != null ? item.getReturnQty() : 0;

            if (itemCode == null || returnQty <= 0) continue;

            Optional<Product> productOpt = productRepository.findByCodeAndIsActiveTrue(itemCode);
            if (productOpt.isEmpty()) {
                log.warn("[SalesReturn] {} — item code '{}' not found in product master. COGS for this item = 0. Post manual journal.",
                        salesReturn.getReturnNumber(), itemCode);
                continue;
            }

            Product product = productOpt.get();
            Optional<com.billbull.backend.inventory.product.ProductPricing> pricingOpt =
                    productPricingRepository.findByProductId(product.getId());

            if (pricingOpt.isEmpty() || pricingOpt.get().getCost() == null) {
                log.warn("[SalesReturn] {} — no cost record for product '{}' ({}). COGS for this item = 0. Post manual journal.",
                        salesReturn.getReturnNumber(), itemCode, product.getId());
                continue;
            }

            BigDecimal unitCost   = pricingOpt.get().getCost();
            BigDecimal itemCogs   = unitCost.multiply(BigDecimal.valueOf(returnQty));
            totalCogs             = totalCogs.add(itemCogs);

            log.info("[SalesReturn] {} — item '{}' qty={} unitCost={} itemCogs={}",
                    salesReturn.getReturnNumber(), itemCode, returnQty, unitCost, itemCogs);
        }

        if (totalCogs.compareTo(BigDecimal.ZERO) == 0) {
            log.warn("[SalesReturn] {} — COGS resolved to ZERO for all items. " +
                             "Inventory and COGS accounts will NOT be adjusted. Review product cost records.",
                    salesReturn.getReturnNumber());
        }

        return totalCogs;
    }
}
