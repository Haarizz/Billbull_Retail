package com.billbull.backend.sales.returns;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.settings.branch.BranchAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Read side of Sales Return: §8 invoice search and §9 eligibility.
 *
 * <p>Deliberately a collaborator of {@link SalesReturnService} rather than a parallel
 * implementation — §27 requires one business layer shared by both entry points. This class
 * owns only the read/validation concerns; every write still goes through SalesReturnService.
 *
 * <p><b>Nothing this class returns is a guarantee.</b> Its verdicts are snapshots taken
 * outside a lock. {@link SalesReturnService} re-runs the returnable-quantity check inside the
 * confirmation transaction under row locks, which is what actually prevents the §29 double
 * return. Treat this as "what to show the cashier", not "what is permitted".
 */
@Service
@Slf4j
public class SalesReturnEligibilityService {

    /** Max invoices returned by one §8 search. Keeps the results list scannable and the query cheap. */
    private static final int SEARCH_LIMIT = 25;

    @Autowired
    private SalesInvoiceRepository salesInvoiceRepository;

    @Autowired
    private SalesReturnRepository salesReturnRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private BranchAccessService branchAccessService;

    /** Return window and approval thresholds — see {@link SalesReturnAuthorizationPolicy}. */
    @Autowired
    private SalesReturnAuthorizationPolicy authorizationPolicy;

    @Autowired
    private SalesReturnCustomerAccountResolver customerAccountResolver;

    // ---------------------------------------------------------------
    // §8 — Find original invoice
    // ---------------------------------------------------------------

    /**
     * Searches invoices by number, POS receipt/checkout key, customer name, customer code, or
     * customer mobile. Mobile is resolved through the Customer master first, because the
     * invoice table stores only the customer code.
     *
     * <p>Results are branch-scoped: a BRANCH_ADMIN searching from their branch will not see
     * another branch's invoices, consistent with how every other read path behaves.
     */
    @Transactional(readOnly = true)
    public List<ReturnInvoiceSearchResult> searchInvoices(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        String q = query.trim();

        // Resolve the query as a mobile/phone/email/code first; the Customer master is the only
        // place a mobile number lives, so a bare "+971 50 ..." can't match the invoice table.
        List<String> customerCodes = resolveCustomerCodesByContact(q);

        Long branchId = currentBranchIdOrNull();

        List<SalesInvoice> invoices = salesInvoiceRepository.searchReturnableInvoices(
                q, customerCodes, branchId, PageRequest.of(0, SEARCH_LIMIT));

        if (invoices.isEmpty()) {
            return List.of();
        }

        // One batched lookup of prior returns for every hit, instead of a query per invoice.
        List<String> invoiceNumbers = invoices.stream().map(SalesInvoice::getInvoiceNumber).toList();
        Map<String, Map<String, Integer>> returnedByInvoice = loadReturnedQtyByInvoice(invoiceNumbers);

        List<ReturnInvoiceSearchResult> out = new ArrayList<>();
        for (SalesInvoice inv : invoices) {
            ReturnInvoiceSearchResult r = new ReturnInvoiceSearchResult();
            r.invoiceId = inv.getId();
            r.invoiceNumber = inv.getInvoiceNumber();
            r.receiptNumber = inv.getPosCheckoutKey();
            r.invoiceDate = inv.getInvoiceDate();
            r.customerCode = inv.getCustomerCode();
            r.customerName = inv.getCustomerName();
            r.customerMobile = resolveCustomerMobile(inv.getCustomerCode());
            r.branchName = inv.getBranchName();
            r.salesperson = inv.getSalesperson();
            r.paymentMode = inv.getPaymentMode();
            r.invoiceTotal = inv.getInvoiceTotal();
            r.status = inv.getStatus() != null ? inv.getStatus().name() : null;

            List<SalesInvoiceItem> items = sellableItems(inv);
            r.itemCount = items.size();

            Map<String, Integer> returned = returnedByInvoice.getOrDefault(
                    inv.getInvoiceNumber(), Map.of());

            int sold = 0;
            int alreadyReturned = 0;
            for (SalesInvoiceItem it : items) {
                int soldQty = it.getQuantity() != null ? it.getQuantity() : 0;
                sold += soldQty;
                alreadyReturned += Math.min(soldQty, returned.getOrDefault(it.getItemCode(), 0));
            }
            r.alreadyReturnedQty = alreadyReturned;
            r.returnableQty = Math.max(0, sold - alreadyReturned);

            if (r.returnableQty <= 0) {
                r.returnEligible = false;
                r.ineligibleReason = sold == 0 ? "No returnable items" : "Fully returned";
            } else {
                r.returnEligible = true;
            }
            out.add(r);
        }
        return out;
    }

    // ---------------------------------------------------------------
    // §9 — Eligibility for one invoice
    // ---------------------------------------------------------------

    /**
     * Full eligibility verdict plus every sold line with its returnable ceiling — the single
     * payload the shared return screen loads after an invoice is chosen.
     */
    @Transactional(readOnly = true)
    public ReturnEligibilityResponse getEligibility(String invoiceNumber) {
        if (invoiceNumber == null || invoiceNumber.isBlank()) {
            return ReturnEligibilityResponse.ineligible("INVOICE_REQUIRED", "No invoice number supplied.");
        }

        Optional<SalesInvoice> invoiceOpt = salesInvoiceRepository.findByInvoiceNumber(invoiceNumber.trim());
        if (invoiceOpt.isEmpty()) {
            return ReturnEligibilityResponse.ineligible("INVOICE_NOT_FOUND",
                    "Invoice " + invoiceNumber + " was not found.");
        }
        SalesInvoice inv = invoiceOpt.get();

        // Branch scope is a hard boundary, not a display filter: refuse outright rather than
        // returning line data the caller is not entitled to see.
        branchAccessService.assertTransactionBranchAccessible(inv.getBranchId(), "Sales Return");

        ReturnEligibilityResponse res = new ReturnEligibilityResponse();
        res.invoiceId = inv.getId();
        res.invoiceNumber = inv.getInvoiceNumber();
        res.receiptNumber = inv.getPosCheckoutKey();
        res.invoiceDate = inv.getInvoiceDate();
        res.customerCode = inv.getCustomerCode();
        res.customerName = inv.getCustomerName();
        res.customerMobile = resolveCustomerMobile(inv.getCustomerCode());
        res.branchName = inv.getBranchName();
        res.branchId = inv.getBranchId();
        res.salesperson = inv.getSalesperson();
        res.paymentMode = inv.getPaymentMode();
        res.invoiceTotal = inv.getInvoiceTotal();
        res.status = inv.getStatus() != null ? inv.getStatus().name() : null;
        res.taxInclusive = Boolean.TRUE.equals(inv.getTaxInclusive());

        // §14 — which refund methods this particular sale can settle with. Computed here rather
        // than in the options endpoint because it depends on the invoice's customer, not on
        // global configuration. The same resolver enforces it at approval.
        res.walkInCustomer = customerAccountResolver.isWalkIn(inv.getCustomerCode());
        for (SalesReturnRefundMethod method : SalesReturnRefundMethod.values()) {
            String blocked = customerAccountResolver.blockedReason(method, inv.getCustomerCode());
            if (blocked != null) {
                res.blockedRefundMethods.put(method.name(), blocked);
            }
        }
        res.posSessionId = inv.getPosSessionId();
        res.posTerminalId = inv.getPosTerminalId();
        res.posCounterName = inv.getPosCounterName();

        // ---- Hard blocks -------------------------------------------------
        if (inv.getStatus() == SalesInvoiceStatus.CANCELLED) {
            res.eligible = false;
            res.ineligibleCode = "INVOICE_CANCELLED";
            res.ineligibleReason = "Invoice " + inv.getInvoiceNumber()
                    + " is cancelled and cannot be returned against.";
        } else if (inv.getStatus() == SalesInvoiceStatus.DRAFT) {
            res.eligible = false;
            res.ineligibleCode = "INVOICE_DRAFT";
            res.ineligibleReason = "Invoice " + inv.getInvoiceNumber()
                    + " is still a draft. Post the invoice before returning against it.";
        } else {
            res.eligible = true;
        }

        // ---- Lines and returnable quantities ------------------------------
        Map<String, Integer> returnedByCode = loadReturnedQtyByInvoice(List.of(inv.getInvoiceNumber()))
                .getOrDefault(inv.getInvoiceNumber(), Map.of());

        // Batch lots come from the existing, proven allocation walk on SalesReturnService —
        // not reimplemented here (§2: no duplicated business logic).
        Map<String, List<ReturnableBatchResponse>> batchesByCode = new HashMap<>();
        try {
            for (ReturnableBatchResponse b : salesReturnService.getReturnableBatchesForInvoice(inv.getInvoiceNumber())) {
                if (b.itemCode != null && b.allocationId != null) {
                    batchesByCode.computeIfAbsent(b.itemCode, k -> new ArrayList<>()).add(b);
                }
            }
        } catch (RuntimeException ex) {
            // Batch data is an enhancement to the line, not a precondition for showing it.
            log.warn("[SalesReturn] Eligibility for '{}' could not load returnable batches: {}",
                    inv.getInvoiceNumber(), ex.getMessage());
            res.warnings.add("Batch details unavailable; batch-controlled items may need manual selection.");
        }

        int totalReturnable = 0;
        for (SalesInvoiceItem it : sellableItems(inv)) {
            ReturnEligibilityLine line = new ReturnEligibilityLine();
            line.invoiceItemId = it.getId();
            line.itemCode = it.getItemCode();
            line.itemName = firstNonBlank(it.getDescription(), it.getItemName(), it.getItemCode());
            line.barcode = it.getBarcode();
            line.unit = it.getUnit();
            line.soldQty = it.getQuantity() != null ? it.getQuantity() : 0;
            line.returnedQty = Math.min(line.soldQty, returnedByCode.getOrDefault(it.getItemCode(), 0));
            line.availableQty = Math.max(0, line.soldQty - line.returnedQty);
            line.resolveStatus();

            line.unitPrice = it.getPrice();
            line.lineVat = it.getTaxAmount();
            line.lineTotal = it.getNetAmount();
            line.taxRate = it.getTaxRate();
            line.taxInclusive = res.taxInclusive;
            line.lineDiscount = resolveLineDiscount(it);

            line.serialControlled = it.getSerialNumber() != null && !it.getSerialNumber().isBlank();

            List<ReturnableBatchResponse> lots = batchesByCode.get(it.getItemCode());
            if (lots != null && !lots.isEmpty()) {
                line.batches = lots;
                line.batchControlled = true;
            } else {
                line.batchControlled = productRepository.findByCodeAndIsActiveTrue(it.getItemCode())
                        .map(Product::isBatch).orElse(false);
            }

            totalReturnable += line.availableQty;
            res.lines.add(line);
        }
        res.totalReturnableQty = totalReturnable;

        if (res.eligible && totalReturnable <= 0) {
            res.eligible = false;
            res.ineligibleCode = "FULLY_RETURNED";
            res.ineligibleReason = "Every item on invoice " + inv.getInvoiceNumber()
                    + " has already been returned.";
        }

        // ---- Prior returns ------------------------------------------------
        for (SalesReturn prior : salesReturnRepository.findByLinkedInvoiceWithItems(inv.getInvoiceNumber())) {
            if (prior.getReturnNumber() != null) {
                res.existingReturnNumbers.add(prior.getReturnNumber());
            }
        }

        // ---- Return window (advisory + approval trigger, never a hard block) ----
        if (inv.getInvoiceDate() != null) {
            res.invoiceAgeDays = ChronoUnit.DAYS.between(inv.getInvoiceDate(), LocalDate.now());
        }
        res.returnWindowDays = authorizationPolicy.getReturnWindowDays();
        if (authorizationPolicy.isReturnWindowExpired(res.invoiceAgeDays)) {
            res.returnWindowExpired = true;
            res.authorizationRequired = true;
            res.authorizationReason = "RETURN_WINDOW_EXPIRED";
            res.warnings.add("Invoice is " + res.invoiceAgeDays + " days old, beyond the "
                    + res.returnWindowDays + "-day return window. Supervisor approval is required.");
        }

        if (Boolean.TRUE.equals(inv.getTaxInclusive())) {
            res.warnings.add("Original invoice was priced VAT-inclusive; the refund reverses VAT at the invoiced rate.");
        }

        return res;
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /**
     * Units already returned per item code, keyed by invoice number.
     *
     * <p>Counts only returns that actually consumed stock. Note this deliberately differs from
     * the older inline version in {@code getReturnableBatchesForInvoice}, which compared the
     * {@link SalesReturnStatus} enum against the strings "DRAFT"/"REJECTED" — a comparison that
     * is never true, so DRAFT returns were being counted as already-returned and were
     * suppressing returnable quantity. Here the enum is compared as an enum, so a draft return
     * no longer blocks the units it has merely reserved.
     */
    private Map<String, Map<String, Integer>> loadReturnedQtyByInvoice(List<String> invoiceNumbers) {
        Map<String, Map<String, Integer>> out = new LinkedHashMap<>();
        for (String invoiceNumber : invoiceNumbers) {
            Map<String, Integer> byCode = new HashMap<>();
            for (SalesReturn r : salesReturnRepository.findByLinkedInvoiceWithItems(invoiceNumber)) {
                if (!countsAgainstReturnable(r.getStatus())) continue;
                if (r.getItems() == null) continue;
                for (SalesReturnItem ri : r.getItems()) {
                    if (ri.getItemCode() == null) continue;
                    byCode.merge(ri.getItemCode(),
                            ri.getReturnQty() != null ? ri.getReturnQty() : 0,
                            Integer::sum);
                }
            }
            out.put(invoiceNumber, byCode);
        }
        return out;
    }

    /** Only APPROVED returns have moved stock and money, so only they reduce returnable qty. */
    private boolean countsAgainstReturnable(SalesReturnStatus status) {
        return status == SalesReturnStatus.APPROVED;
    }

    /** Invoice lines that can be returned — voided lines never can. */
    private List<SalesInvoiceItem> sellableItems(SalesInvoice inv) {
        if (inv.getItems() == null) return List.of();
        return inv.getItems().stream()
                .filter(it -> !Boolean.TRUE.equals(it.getVoided()))
                .filter(it -> it.getItemCode() != null && !it.getItemCode().isBlank())
                .toList();
    }

    /**
     * Money value of the discount on an original invoice line. {@code discount} is a
     * percentage rate, so it is converted against the gross line value; any footer discount
     * already allocated to the line is added on top.
     */
    private BigDecimal resolveLineDiscount(SalesInvoiceItem it) {
        BigDecimal discount = BigDecimal.ZERO;
        if (it.getPrice() != null && it.getDiscount() != null && it.getDiscount() != 0d) {
            int qty = it.getQuantity() != null ? it.getQuantity() : 0;
            discount = it.getPrice()
                    .multiply(BigDecimal.valueOf(qty))
                    .multiply(BigDecimal.valueOf(it.getDiscount() / 100.0))
                    .setScale(2, java.math.RoundingMode.HALF_UP);
        }
        if (it.getFooterDiscount() != null) {
            discount = discount.add(it.getFooterDiscount());
        }
        return discount;
    }

    /** Customer codes whose mobile/phone/email/code matches the raw search term. */
    private List<String> resolveCustomerCodesByContact(String q) {
        List<String> codes = new ArrayList<>();
        try {
            customerRepository
                    .findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(q, q, q, q)
                    .map(Customer::getCode)
                    .ifPresent(codes::add);
        } catch (RuntimeException ex) {
            log.debug("[SalesReturn] Contact lookup for '{}' failed, continuing with text search: {}",
                    q, ex.getMessage());
        }
        return codes;
    }

    private String resolveCustomerMobile(String customerCode) {
        if (customerCode == null || customerCode.isBlank()) return null;
        return customerRepository.findByCode(customerCode)
                .map(c -> firstNonBlank(c.getMobile(), c.getPhone(), c.getWhatsapp()))
                .orElse(null);
    }

    private Long currentBranchIdOrNull() {
        try {
            return branchAccessService.getRequiredCurrentUserBranch() != null
                    ? branchAccessService.getRequiredCurrentUserBranch().getId()
                    : null;
        } catch (RuntimeException ex) {
            // No branch context (e.g. an ADMIN with global scope) — search across all branches.
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
