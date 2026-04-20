package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.hibernate.Hibernate;
import org.springframework.http.HttpStatus;
import com.billbull.backend.sales.settings.CreditLimitPolicy;
import com.billbull.backend.sales.settings.SalesMode;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.stockavailability.StockAvailabilityResponse;
import com.billbull.backend.inventory.stockavailability.StockAvailabilityService;
import com.billbull.backend.sales.delivery.DeliveryNoteItemRequest;
import com.billbull.backend.sales.delivery.DeliveryNoteRequest;
import com.billbull.backend.sales.delivery.DeliveryNoteService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class SalesInvoiceService {

    private final SalesInvoiceRepository invoiceRepo;
    private final PostingEngineService postingEngineService;
    private final DeliveryNoteService deliveryNoteService;
    private final SalesSettingsService settingsService;
    private final StockAvailabilityService stockAvailabilityService;
    private final ReceiptVoucherService receiptVoucherService;
    private final ProductRepository productRepo;
    private final ProductMediaRepository productMediaRepository;
    private final com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository;

    public SalesInvoiceService(SalesInvoiceRepository invoiceRepo,
            PostingEngineService postingEngineService,
            DeliveryNoteService deliveryNoteService,
            SalesSettingsService settingsService,
            StockAvailabilityService stockAvailabilityService,
            ReceiptVoucherService receiptVoucherService,
            ProductRepository productRepo,
            ProductMediaRepository productMediaRepository,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository) {
        this.invoiceRepo = invoiceRepo;
        this.postingEngineService = postingEngineService;
        this.deliveryNoteService = deliveryNoteService;
        this.settingsService = settingsService;
        this.stockAvailabilityService = stockAvailabilityService;
        this.receiptVoucherService = receiptVoucherService;
        this.productRepo = productRepo;
        this.productMediaRepository = productMediaRepository;
        this.salesOrderRepository = salesOrderRepository;
    }

    // ----------------------------
    // GENERATE INVOICE NUMBER
    // ----------------------------
    public String generateInvoiceNumber() {
        String prefix = "INV-" + LocalDate.now().getYear() + "-";
        String lastNumber = invoiceRepo.findLastInvoiceNumberByPrefix(prefix);

        int nextNum = 1;
        if (lastNumber != null && lastNumber.startsWith(prefix)) {
            try {
                String numPart = lastNumber.substring(prefix.length());
                nextNum = Integer.parseInt(numPart) + 1;
            } catch (NumberFormatException e) {
                nextNum = 1;
            }
        }

        return prefix + String.format("%04d", nextNum);
    }

    // ----------------------------
    // CREATE / UPDATE
    // ----------------------------
    @Transactional
    public SalesInvoice save(SalesInvoice invoice) {

        if (invoice.getId() != null) {
            SalesInvoice existing = invoiceRepo.findById(invoice.getId()).orElse(null);
            if (existing != null && existing.getStatus() == SalesInvoiceStatus.POSTED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Posted invoices cannot be modified. Create a reversal instead.");
            }
        }

        // Auto-generate invoice number if new
        if (invoice.getId() == null && (invoice.getInvoiceNumber() == null || invoice.getInvoiceNumber().isBlank())) {
            invoice.setInvoiceNumber(generateInvoiceNumber());
        }

        // Calculate totals from items
        double subTotal = 0;
        double taxTotal = 0;

        if (invoice.getItems() != null) {
            for (SalesInvoiceItem item : invoice.getItems()) {
                item.setSalesInvoice(invoice);

                double netAmount = item.getNetAmount() != null ? item.getNetAmount() : 0;
                double taxAmount = item.getTaxAmount() != null ? item.getTaxAmount() : 0;

                subTotal += (netAmount - taxAmount);
                taxTotal += taxAmount;
            }
        }

        // Round to 2 dp to eliminate floating-point noise from client-side arithmetic
        subTotal = BigDecimal.valueOf(subTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        taxTotal = BigDecimal.valueOf(taxTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double total = BigDecimal.valueOf(subTotal + taxTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double paid = invoice.getAmountPaid() != null ? invoice.getAmountPaid() : 0;

        if (paid < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount paid cannot be negative.");
        }
        if (paid > total + 0.0001d) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount paid cannot exceed invoice total.");
        }

        invoice.setSubTotal(subTotal);
        invoice.setTaxTotal(taxTotal);
        invoice.setInvoiceTotal(total);
        invoice.setBalance(total - paid);

        // Fetch settings ONCE for this entire request — passed through the call chain
        // to avoid redundant DB hits.
        SalesSettings settings = settingsService.getSettings();

        // Status logic
        if (invoice.getStatus() == null) {
            invoice.setStatus(SalesInvoiceStatus.DRAFT);
        }

        // FAST_SALE enforcement: new invoices must never stay in DRAFT — the mode
        // requires immediate posting so that the auto-delivery chain is always triggered.
        if (invoice.getId() == null
                && settings.getSalesMode() == SalesMode.FAST_SALE
                && (invoice.getStatus() == null || invoice.getStatus() == SalesInvoiceStatus.DRAFT)) {
            System.out.println("[FAST_SALE] Forcing invoice status from DRAFT → POSTED (salesMode=FAST_SALE)");
            invoice.setStatus(SalesInvoiceStatus.POSTED);
        }

        SalesInvoiceStatus intendedStatus = invoice.getStatus();

        // Update status based on payment
        if (paid >= total && total > 0) {
            intendedStatus = SalesInvoiceStatus.PAID;
        } else if (paid > 0 && paid < total) {
            intendedStatus = SalesInvoiceStatus.PARTIALLY_PAID;
        }

        boolean isAlreadyFinalized = (invoice.getId() != null) && invoiceRepo.findById(invoice.getId())
                .map(inv -> inv.getStatus() != SalesInvoiceStatus.DRAFT
                        && inv.getStatus() != SalesInvoiceStatus.CANCELLED)
                .orElse(false);

        boolean isNewlyFinalized = intendedStatus != SalesInvoiceStatus.DRAFT
                && intendedStatus != SalesInvoiceStatus.CANCELLED && !isAlreadyFinalized;

        if (isNewlyFinalized) {
            // To ensure updateStatus handles the logic, we temporarily save it as DRAFT
            invoice.setStatus(SalesInvoiceStatus.DRAFT);
        } else {
            invoice.setStatus(intendedStatus);
        }

        // ENFORCE INTEGRITY: Invoices never deduct stock directly; we defer to Delivery
        // Notes

        SalesInvoice saved = invoiceRepo.save(invoice);

        if (isNewlyFinalized) {
            // Trigger doUpdateStatus with the already-fetched settings (single DB fetch
            // per request — avoids a redundant getSettings() call inside updateStatus).
            doUpdateStatus(saved.getId(), intendedStatus, settings);

            // Auto-update linked Sales Order to INVOICED
            if (saved.getLinkedSalesOrder() != null && !saved.getLinkedSalesOrder().isBlank()) {
                salesOrderRepository.findBySoNumber(saved.getLinkedSalesOrder()).ifPresent(so -> {
                    so.setStatus(com.billbull.backend.sales.salesorder.SalesOrderStatus.INVOICED);
                    salesOrderRepository.save(so);
                });
            }
        }

        if (isNewlyFinalized && paid > 0) {
            SalesInvoice refreshed = getById(saved.getId());
            createReceiptForInvoicePayment(
                    refreshed,
                    paid,
                    refreshed.getPaymentMode(),
                    "Initial receipt for INV: " + refreshed.getInvoiceNumber(),
                    refreshed.getInvoiceDate(),
                    null,   // bankAccount — not applicable for initial receipt
                    null);  // chequeDate  — not applicable for initial receipt
        }

        // Handle Linking "Before Sale" Delivery Notes
        if (invoice.getLinkedDeliveryNote() != null && !invoice.getLinkedDeliveryNote().isBlank() &&
                (invoice.getSalesType() != SalesType.DIRECT_SALE)) {
            String[] dnNumbersArray = invoice.getLinkedDeliveryNote().split(",");
            List<String> dnNumbers = new ArrayList<>();
            for (String dnNo : dnNumbersArray) {
                dnNumbers.add(dnNo.trim());
            }
            deliveryNoteService.linkDeliveryNotesToInvoice(dnNumbers, saved);
        }

        return getById(saved.getId());
    }

    // ----------------------------
    // GET BY ID
    // ----------------------------
    @Transactional(readOnly = true)
    public SalesInvoice getById(Long id) {
        SalesInvoice invoice = invoiceRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Invoice not found: " + id));

        Hibernate.initialize(invoice.getItems());
        enrichItems(invoice.getItems());
        return invoice;
    }

    // ----------------------------
    // GET ALL
    // ----------------------------
    @Transactional(readOnly = true)
    public List<SalesInvoice> getAll() {
        List<SalesInvoice> invoices = new ArrayList<>(invoiceRepo.findAll());
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                invoices,
                SalesInvoice::getInvoiceDate,
                SalesInvoice::getInvoiceNumber,
                SalesInvoice::getId);

        invoices.forEach(inv -> {
            Hibernate.initialize(inv.getItems());
            enrichItems(inv.getItems());
        });

        return invoices;
    }

    // ----------------------------
    // ENRICH ITEMS FROM PRODUCT
    // ----------------------------
    private void enrichItems(java.util.List<SalesInvoiceItem> items) {
        if (items == null || items.isEmpty()) return;
        for (SalesInvoiceItem item : items) {
            if (item.getItemCode() == null || item.getItemCode().isBlank()) continue;
            productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).ifPresent(p -> {
                if (item.getSku() == null || item.getSku().isBlank()) item.setSku(p.getSku());
                if (item.getLocalName() == null || item.getLocalName().isBlank()) item.setLocalName(p.getLocalName());
                if (item.getDescription() == null || item.getDescription().isBlank()) item.setDescription(p.getShortDesc());
                if (item.getItemName() == null || item.getItemName().isBlank()) item.setItemName(p.getName());
            });
        }

        List<String> codesNeedingImage = items.stream()
                .filter(i -> (i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null && !i.getItemCode().isBlank())
                .map(SalesInvoiceItem::getItemCode)
                .distinct()
                .toList();

        if (!codesNeedingImage.isEmpty()) {
            Map<String, String> imageMap = new HashMap<>();
            productMediaRepository.findPrimaryByProductCodesIn(codesNeedingImage)
                    .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));
            items.forEach(i -> {
                if ((i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null) {
                    String url = imageMap.get(i.getItemCode());
                    if (url != null) i.setImage(url);
                }
            });
        }
    }

    // ----------------------------
    // DELETE
    // ----------------------------
    @Transactional
    public void delete(Long id) {
        SalesInvoice existing = getById(id);
        if (existing != null && existing.getStatus() == SalesInvoiceStatus.POSTED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Posted invoices cannot be deleted.");
        }
        invoiceRepo.deleteById(id);
    }

    // ----------------------------
    // UPDATE STATUS
    // ----------------------------

    /**
     * Public entry point — called by the controller.
     * Fetches settings itself and delegates to the internal overload.
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateStatus(Long id, SalesInvoiceStatus status) {
        SalesSettings settings = settingsService.getSettings();
        doUpdateStatus(id, status, settings);
    }

    /**
     * Internal overload — called from save() with the already-fetched settings
     * to ensure a single getSettings() call per request.
     */
    private void doUpdateStatus(Long id, SalesInvoiceStatus status, SalesSettings settings) {
        invoiceRepo.findById(id).ifPresent(invoice -> {
            SalesInvoiceStatus previousStatus = invoice.getStatus();

            if (previousStatus == SalesInvoiceStatus.POSTED && status == SalesInvoiceStatus.DRAFT) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Cannot un-post a posted invoice. Create a reversal instead.");
            }

            // Block manual PAID status if delivery is not yet completed.
            // Exception: first-time posting from DRAFT may go directly to PAID for
            // Before-Sale invoices (where delivery precedes the invoice).
            boolean isFirstTimePosting = previousStatus == SalesInvoiceStatus.DRAFT || previousStatus == null;
            if (status == SalesInvoiceStatus.PAID
                    && !isFirstTimePosting
                    && invoice.getDeliveryStatus() != DeliveryStatus.DELIVERED) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invoice cannot be marked PAID until delivery is completed. "
                                + "Use PARTIALLY_PAID for advance payments.");
            }

            invoice.setStatus(status);

            boolean isNewlyPosted = ((status == SalesInvoiceStatus.POSTED || status == SalesInvoiceStatus.CONFIRMED
                    || status == SalesInvoiceStatus.PAID || status == SalesInvoiceStatus.PARTIALLY_PAID)
                    && (previousStatus == SalesInvoiceStatus.DRAFT || previousStatus == null));
            boolean isNewlyCancelled = (status == SalesInvoiceStatus.CANCELLED
                    && previousStatus != SalesInvoiceStatus.CANCELLED && previousStatus != SalesInvoiceStatus.DRAFT);

            if (isNewlyPosted) {
                // FIX: Force-initialize the lazy items collection here so that ALL downstream
                // logic
                // (stock check, delivery note generation, COGS) sees the actual items.
                Hibernate.initialize(invoice.getItems());

                // -------------------------------------------------------
                // SETTINGS ENFORCEMENT — runs only when newly posting
                // settings is passed in from the caller (single fetch per request)
                // -------------------------------------------------------

                // 1. STOCK CHECK
                enforceStockCheck(invoice, settings);

                // 2. CREDIT LIMIT CHECK
                enforceCreditLimit(invoice, settings);
                // -------------------------------------------------------

                boolean isLinkedToDn = invoice.getLinkedDeliveryNote() != null
                        && !invoice.getLinkedDeliveryNote().isBlank();

                // Generate a Delivery Note for Direct Sales / Non-Linked Invoices.
                // Pass settings so the method can check salesMode without a second DB call.
                if (!isLinkedToDn) {
                    boolean autoDelivered = autoGenerateDeliveryNote(invoice, settings);
                    invoice.setDeliveryStatus(autoDelivered ? DeliveryStatus.DELIVERED : DeliveryStatus.PENDING);
                } else {
                    // Already linked to a Before-Sale DN, therefore it's already delivered
                    invoice.setDeliveryStatus(DeliveryStatus.DELIVERED);
                }
            } else if (isNewlyCancelled) {
                // Cancel any auto-generated delivery notes to reverse their
                // reservations/deductions
                deliveryNoteService.cancelBySourceDocument("SALES_INVOICE", invoice.getId());
                invoice.setDeliveryStatus(DeliveryStatus.CANCELLED);
            }

            invoiceRepo.save(invoice);

            // AUTO-GENERATE JOURNAL ENTRY when status changes from Draft to Active.
            // IFRS 15: Revenue is DEFERRED at invoice posting.
            // Entry: Dr AR / Cr Deferred Revenue (2107) / Cr VAT Output
            //
            // Revenue + COGS are recognized later when Delivery Note is DELIVERED.
            // For Before-Sale invoices (DN already delivered before invoice raised),
            // recognition is triggered by linkDeliveryNotesToInvoice() called in save().
            // This unified approach ensures all revenue flows through the same DN path.
            if (isNewlyPosted) {
                postingEngineService.createJournalFromInvoicePosting(invoice);
            }

            // Reverse invoice journal on cancellation (if it was posted)
            if (isNewlyCancelled && previousStatus != SalesInvoiceStatus.DRAFT) {
                postingEngineService.reverseJournalFromInvoiceCancellation(invoice);
            }
        });
    }

    // ----------------------------
    // RECORD PAYMENT
    // ----------------------------
    @Transactional
    public SalesInvoice recordPayment(Long id, Double paymentAmount, String paymentMode,
            String paymentReference, LocalDate paymentDate) {
        return recordPayment(id, paymentAmount, paymentMode, paymentReference, paymentDate, null);
    }

    @Transactional
    public SalesInvoice recordPayment(Long id, Double paymentAmount, String paymentMode,
            String paymentReference, LocalDate paymentDate, String bankAccount) {
        return recordPayment(id, paymentAmount, paymentMode, paymentReference, paymentDate, bankAccount, null);
    }

    @Transactional
    public SalesInvoice recordPayment(Long id, Double paymentAmount, String paymentMode,
            String paymentReference, LocalDate paymentDate, String bankAccount, LocalDate chequeDate) {
        SalesInvoice invoice = getById(id);

        if (paymentAmount == null || paymentAmount <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be greater than zero.");
        }

        createReceiptForInvoicePayment(invoice, paymentAmount, paymentMode, paymentReference, paymentDate, bankAccount, chequeDate);

        // Sync invoice's paymentMode to the actual mode used for payment
        if (paymentMode != null && !paymentMode.isBlank()) {
            SalesInvoice toUpdate = invoiceRepo.findById(id).orElseThrow();
            toUpdate.setPaymentMode(paymentMode);
            invoiceRepo.save(toUpdate);
        }

        return getById(id);
    }

    private void createReceiptForInvoicePayment(SalesInvoice invoice, double paymentAmount, String paymentMode,
            String paymentReference, LocalDate paymentDate, String bankAccount, LocalDate chequeDate) {
        ReceiptVoucher rv = new ReceiptVoucher();
        rv.setDate(paymentDate != null ? paymentDate : LocalDate.now());
        rv.setPaymentMode((paymentMode != null && !paymentMode.isBlank()) ? paymentMode : "Bank Transfer");
        rv.setReference((paymentReference != null && !paymentReference.isBlank())
                ? paymentReference
                : "Auto-RV for INV: " + invoice.getInvoiceNumber());
        rv.setAmount(BigDecimal.valueOf(paymentAmount));
        rv.setMemberName(invoice.getCustomerName() != null ? invoice.getCustomerName() : "Walk-in Customer");
        rv.setStatus("Completed");
        rv.setPurpose(ReceiptPurpose.AGAINST_INVOICE);
        rv.setSalesInvoiceId(invoice.getId());
        if (bankAccount != null && !bankAccount.isBlank()) {
            rv.setBankAccount(bankAccount);
        }
        if (chequeDate != null) {
            rv.setChequeDate(chequeDate);
        }

        receiptVoucherService.createReceipt(rv, null);
    }

    // ----------------------------
    // SETTINGS ENFORCEMENT HELPERS
    // ----------------------------

    /**
     * If stockCheckRequired is enabled, verifies that every item on the invoice
     * has sufficient available stock. Throws 400 if any item is short.
     */
    private void enforceStockCheck(SalesInvoice invoice, SalesSettings settings) {
        if (!settings.isStockCheckRequired())
            return;
        if (invoice.getItems() == null || invoice.getItems().isEmpty())
            return;

        List<String> insufficientItems = new ArrayList<>();

        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.getItemCode() == null || item.getItemCode().isBlank())
                continue;

            int requiredQty = (item.getQuantity() != null ? item.getQuantity() : 0)
                    + (item.getFoc() != null ? item.getFoc() : 0);
            if (requiredQty <= 0)
                continue;

            try {
                StockAvailabilityResponse stock = stockAvailabilityService.getStockAvailability(item.getItemCode());
                int totalAvailable = stock.getLocations() == null ? 0
                        : stock.getLocations().stream()
                                .mapToInt(loc -> loc.getAvailable() != null ? loc.getAvailable() : 0)
                                .sum();

                if (totalAvailable < requiredQty) {
                    insufficientItems.add(String.format("'%s' (required: %d, available: %d)",
                            item.getItemCode(), requiredQty, totalAvailable));
                }
            } catch (Exception e) {
                // If stock check fails (e.g. product not found), skip silently
                System.out.println("[StockCheck] Warning: could not check stock for " + item.getItemCode() + " — "
                        + e.getMessage());
            }
        }

        if (!insufficientItems.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Stock check failed. Insufficient stock for: " + String.join(", ", insufficientItems) +
                            ". Please reduce quantities or disable the stock check requirement in Sales Settings.");
        }
    }

    /**
     * Enforces the credit limit policy. If BLOCK, throws 400 when the customer's
     * outstanding balance exceeds their credit limit (currently based on existing
     * invoice balance). If WARNING, the check is informational — the frontend shows
     * a banner but the backend allows the post.
     */
    private void enforceCreditLimit(SalesInvoice invoice, SalesSettings settings) {
        if (settings.getCreditLimitPolicy() == CreditLimitPolicy.NO_IMPACT)
            return;
        if (invoice.getCustomerCode() == null || invoice.getCustomerCode().isBlank())
            return;

        // Sum outstanding (non-paid, non-cancelled) balances for this customer
        Double outstanding = invoiceRepo.findOutstandingBalanceByCustomerCode(invoice.getCustomerCode());
        double outstandingAmount = outstanding != null ? outstanding : 0.0;

        // Use the customer's credit limit from the invoice entity (if set), fallback 0
        double creditLimit = invoice.getCreditLimit() != null ? invoice.getCreditLimit() : 0.0;

        // Only enforce if a credit limit is actually configured for this customer
        if (creditLimit <= 0)
            return;

        boolean isOverLimit = outstandingAmount > creditLimit;

        if (isOverLimit && settings.getCreditLimitPolicy() == CreditLimitPolicy.BLOCK) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    String.format("Credit limit exceeded for customer '%s'. Outstanding: %.2f, Limit: %.2f. " +
                            "Change the Credit Limit Policy in Sales Settings, or collect payment before posting.",
                            invoice.getCustomerName(), outstandingAmount, creditLimit));
        }
        // WARNING mode: frontend handles UX; backend allows posting through
    }

    // ----------------------------
    // AUTO-GENERATE DELIVERY NOTE
    // ----------------------------
    /**
     * Creates an auto-generated Delivery Note for the given invoice.
     * For DIRECT_SALE invoices, immediately advances the DN to DELIVERED so that
     * stock is deducted at the moment the sale is posted.
     *
     * @return true if the DN was auto-delivered (stock deducted), false if it
     *         remains in DRAFT/PENDING or was skipped.
     */
    private boolean autoGenerateDeliveryNote(SalesInvoice invoice, SalesSettings settings) {
        // Determine whether auto-delivery is required:
        // either the per-invoice type is DIRECT_SALE, or the global mode is FAST_SALE.
        boolean isAutoDelivery = invoice.getSalesType() == SalesType.DIRECT_SALE
                || settings.getSalesMode() == SalesMode.FAST_SALE;

        // Prevent generating duplicate delivery notes for the same invoice
        if (deliveryNoteService.hasActiveDeliveryNoteForSource("SALES_INVOICE", invoice.getId())) {
            System.out.println(
                    "[Auto-DN] Skipped: active Delivery Note already exists for invoice " + invoice.getInvoiceNumber());
            return false;
        }

        String baseDnNumber = "DN-" + invoice.getInvoiceNumber();
        String finalDnNumber = baseDnNumber;
        int sequence = 1;

        // Ensure dnNumber is unique to avoid collision with cancelled DNs
        while (deliveryNoteService.existsByDnNumber(finalDnNumber)) {
            finalDnNumber = baseDnNumber + "-" + sequence;
            sequence++;
        }

        DeliveryNoteRequest req = new DeliveryNoteRequest();
        req.dnNumber = finalDnNumber;
        req.dnDate = invoice.getInvoiceDate() != null ? invoice.getInvoiceDate() : LocalDate.now();
        req.customerCode = invoice.getCustomerCode();
        req.customerName = invoice.getCustomerName();
        req.salesOrderNo = invoice.getLinkedSalesOrder();

        req.autoGenerated = true;
        req.sourceDocumentType = "SALES_INVOICE";
        req.sourceDocumentId = invoice.getId();

        // Pick the first non-null warehouseId from any item
        if (invoice.getItems() != null) {
            req.warehouseId = invoice.getItems().stream()
                    .filter(i -> i.getWarehouseId() != null)
                    .map(SalesInvoiceItem::getWarehouseId)
                    .findFirst()
                    .orElse(null);
        }

        // Cannot create delivery note without a warehouse.
        // In auto-delivery mode (FAST_SALE / DIRECT_SALE) this must fail hard —
        // a silent skip would leave an invoice posted with no stock deduction.
        if (req.warehouseId == null) {
            if (isAutoDelivery) {
                System.err.println("[Auto-DN] FAST_SALE/DIRECT_SALE: invoice " + invoice.getInvoiceNumber()
                        + " has no warehouseId — auto-delivery blocked."
                        + " salesMode=" + settings.getSalesMode()
                        + ", salesType=" + invoice.getSalesType());
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Auto-delivery requires a warehouse on every item. Invoice "
                        + invoice.getInvoiceNumber() + " has no warehouse assigned. "
                        + "Set the warehouse field on all line items before posting.");
            }
            System.out.println("[Auto-DN] Skipped: no warehouseId on invoice " + invoice.getInvoiceNumber());
            return false;
        }

        req.items = new ArrayList<>();
        if (invoice.getItems() != null) {
            for (SalesInvoiceItem item : invoice.getItems()) {
                DeliveryNoteItemRequest iReq = new DeliveryNoteItemRequest();
                iReq.itemCode = item.getItemCode();
                iReq.description = item.getItemName();
                iReq.unit = item.getUnit();
                iReq.orderedQty = item.getQuantity();
                iReq.currentQty = item.getQuantity();
                iReq.foc = item.getFoc();
                req.items.add(iReq);
            }
        }

        var created = deliveryNoteService.create(req);

        if (created == null || created.id == null) {
            if (isAutoDelivery) {
                System.err.println("[Auto-DN] FAST_SALE/DIRECT_SALE: DN entity creation returned null for invoice "
                        + invoice.getInvoiceNumber() + ". salesMode=" + settings.getSalesMode());
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Failed to create Delivery Note for invoice " + invoice.getInvoiceNumber()
                        + ". Auto-delivery aborted. No stock was deducted.");
            }
            return false;
        }

        // Link the DN to the invoice BEFORE advancing status so that revenue
        // recognition in markDelivered() can find the linked invoice.
        deliveryNoteService.linkSingleDeliveryNoteToInvoice(created.id, invoice);

        // Auto-delivery: triggered for per-invoice DIRECT_SALE type OR global FAST_SALE mode.
        // Immediately advance the DN to DELIVERED so stock is deducted at point of sale.
        // The full chain (markDispatched → markDelivered → stockMovement → recognizeRevenue)
        // runs inside the outer save() @Transactional — any failure rolls back the invoice too.
        if (isAutoDelivery) {
            deliveryNoteService.markDispatched(created.id);
            deliveryNoteService.markDelivered(created.id, "Auto");
            System.out.println("[Auto-DN] Auto-delivery complete: invoice=" + invoice.getInvoiceNumber()
                    + " | DN=" + created.dnNumber
                    + " | salesType=" + invoice.getSalesType()
                    + " | salesMode=" + settings.getSalesMode()
                    + " | stock deducted + revenue recognised.");
            return true;
        }

        // WORKFLOW_DRIVEN: DN stays in DRAFT — stock deducted only when manually marked DELIVERED
        return false;
    }

    // ----------------------------
    // PRICE HISTORY
    // ----------------------------
    @Transactional(readOnly = true)
    public List<PriceHistoryDTO> getPriceHistory(String itemCode) {
        return invoiceRepo.findPriceHistoryByItemCode(itemCode, org.springframework.data.domain.PageRequest.of(0, 10));
    }

    // ----------------------------
    // RECONCILIATION
    // ----------------------------
    /**
     * Returns a summary of financial integrity issues across invoices and delivery notes.
     * Covers five categories:
     *  1. Orphaned invoices — posted but no delivery
     *  2. Under-recognized — delivered but revenue < subTotal
     *  3. Over-recognized — revenue > subTotal (data corruption)
     *  4. Delivered DNs without GL journals (accounting gap)
     *  5. Deferred revenue not cleared — fully delivered invoices still showing a gap
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> reconcile() {
        List<SalesInvoice> orphaned = invoiceRepo.findOrphanedInvoices();
        List<SalesInvoice> underRecognized = invoiceRepo.findUnderRecognizedInvoices();
        List<SalesInvoice> overRecognized = invoiceRepo.findOverRecognizedInvoices();

        // FIX 5 — DNs delivered but no GL journal posted
        List<java.util.Map<String, Object>> dnsWithoutAccounting =
                deliveryNoteService.findDeliveredWithoutAccounting();

        // FIX 5 — Invoices fully delivered but deferred revenue not cleared.
        // Subset of underRecognized where deliveryStatus is DELIVERED — these are the
        // most critical: delivery done, but revenue still sitting in Deferred Revenue (2107).
        List<java.util.Map<String, Object>> deferredNotCleared = underRecognized.stream()
                .filter(inv -> inv.getDeliveryStatus() == DeliveryStatus.DELIVERED
                        && inv.getStatus() != SalesInvoiceStatus.CANCELLED)
                .map(inv -> java.util.Map.<String, Object>of(
                        "invoiceNumber", inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : "",
                        "customerName", inv.getCustomerName() != null ? inv.getCustomerName() : "",
                        "subTotal", inv.getSubTotal() != null ? inv.getSubTotal() : 0,
                        "issue", "Delivery complete but deferred revenue (2107) not fully cleared to Sales Revenue (4101)"))
                .toList();

        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();

        result.put("orphanedInvoices", orphaned.stream()
                .map(inv -> java.util.Map.of(
                        "invoiceNumber", inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : "",
                        "customerName", inv.getCustomerName() != null ? inv.getCustomerName() : "",
                        "invoiceTotal", inv.getInvoiceTotal() != null ? inv.getInvoiceTotal() : 0,
                        "status", inv.getStatus() != null ? inv.getStatus().name() : "",
                        "deliveryStatus", inv.getDeliveryStatus() != null ? inv.getDeliveryStatus().name() : "",
                        "issue", "Posted invoice with no delivery completed"))
                .toList());

        result.put("underRecognizedInvoices", underRecognized.stream()
                .map(inv -> java.util.Map.of(
                        "invoiceNumber", inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : "",
                        "customerName", inv.getCustomerName() != null ? inv.getCustomerName() : "",
                        "subTotal", inv.getSubTotal() != null ? inv.getSubTotal() : 0,
                        "issue", "Delivery complete but revenue recognition < invoice subTotal"))
                .toList());

        result.put("overRecognizedInvoices", overRecognized.stream()
                .map(inv -> java.util.Map.of(
                        "invoiceNumber", inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : "",
                        "customerName", inv.getCustomerName() != null ? inv.getCustomerName() : "",
                        "subTotal", inv.getSubTotal() != null ? inv.getSubTotal() : 0,
                        "issue", "DATA CORRUPTION: recognized revenue exceeds invoice subTotal"))
                .toList());

        result.put("deliveredDnsWithoutAccounting", dnsWithoutAccounting);

        result.put("deferredRevenueNotCleared", deferredNotCleared);

        result.put("summary", java.util.Map.of(
                "orphanedCount", orphaned.size(),
                "underRecognizedCount", underRecognized.size(),
                "overRecognizedCount", overRecognized.size(),
                "dnsWithoutAccountingCount", dnsWithoutAccounting.size(),
                "deferredNotClearedCount", deferredNotCleared.size(),
                "totalIssues", orphaned.size() + underRecognized.size() + overRecognized.size()
                        + dnsWithoutAccounting.size() + deferredNotCleared.size()));

        return result;
    }
}
