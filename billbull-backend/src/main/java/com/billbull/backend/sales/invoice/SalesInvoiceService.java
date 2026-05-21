package com.billbull.backend.sales.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.hibernate.Hibernate;
import org.springframework.http.HttpStatus;
import com.billbull.backend.sales.settings.CreditLimitPolicy;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
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
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.stockavailability.StockAvailabilityResponse;
import com.billbull.backend.inventory.stockavailability.StockAvailabilityService;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteItem;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteItemRequest;
import com.billbull.backend.sales.delivery.DeliveryNoteRequest;
import com.billbull.backend.sales.delivery.DeliveryNoteService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class SalesInvoiceService {

    private final SalesInvoiceRepository invoiceRepo;
    private final PostingEngineService postingEngineService;
    private final DeliveryNoteService deliveryNoteService;
    private final SalesSettingsService settingsService;
    private final SalesDocumentNumberingService numberingService;
    private final StockAvailabilityService stockAvailabilityService;
    private final ReceiptVoucherService receiptVoucherService;
    private final ProductRepository productRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository productMediaRepository;
    private final ProductPackingRepository packingRepo;
    private final com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository;
    private final DeliveryNoteRepository deliveryNoteRepository;
    private final CustomerRepository customerRepository;
    private final OpeningInvoiceRepository openingInvoiceRepository;
    private final WarehouseRepository warehouseRepository;
    private final BranchAccessService branchAccessService;
    private final StockMovementRepository stockMovementRepo;
    private final BinRepository binRepo;
    private final BatchSelectionService batchSelectionService;

    public SalesInvoiceService(SalesInvoiceRepository invoiceRepo,
            PostingEngineService postingEngineService,
            DeliveryNoteService deliveryNoteService,
            SalesSettingsService settingsService,
            SalesDocumentNumberingService numberingService,
            StockAvailabilityService stockAvailabilityService,
            ReceiptVoucherService receiptVoucherService,
            ProductRepository productRepo,
            ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository productMediaRepository,
            ProductPackingRepository packingRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepository,
            DeliveryNoteRepository deliveryNoteRepository,
            CustomerRepository customerRepository,
            OpeningInvoiceRepository openingInvoiceRepository,
            WarehouseRepository warehouseRepository,
            BranchAccessService branchAccessService,
            StockMovementRepository stockMovementRepo,
            BinRepository binRepo,
            BatchSelectionService batchSelectionService) {
        this.invoiceRepo = invoiceRepo;
        this.postingEngineService = postingEngineService;
        this.deliveryNoteService = deliveryNoteService;
        this.settingsService = settingsService;
        this.numberingService = numberingService;
        this.stockAvailabilityService = stockAvailabilityService;
        this.receiptVoucherService = receiptVoucherService;
        this.productRepo = productRepo;
        this.barcodeRepo = barcodeRepo;
        this.productMediaRepository = productMediaRepository;
        this.packingRepo = packingRepo;
        this.salesOrderRepository = salesOrderRepository;
        this.deliveryNoteRepository = deliveryNoteRepository;
        this.customerRepository = customerRepository;
        this.openingInvoiceRepository = openingInvoiceRepository;
        this.warehouseRepository = warehouseRepository;
        this.branchAccessService = branchAccessService;
        this.stockMovementRepo = stockMovementRepo;
        this.binRepo = binRepo;
        this.batchSelectionService = batchSelectionService;
    }

    // ----------------------------
    // CUSTOMER OUTSTANDING BALANCE
    // ----------------------------
    /**
     * Returns the total outstanding balance for a customer:
     * - sum of unpaid/non-cancelled SalesInvoice.balance records
     * - plus any remaining opening balance from migrated AR (Customer.balance)
     *
     * Used by the sales screen to show "Previous Outstanding" before a new invoice.
     */
    public Map<String, Object> getCustomerOutstanding(String customerCode) {
        Double invoiceOutstanding = invoiceRepo.findOutstandingBalanceByCustomerCode(customerCode);
        double invoiceAmt = invoiceOutstanding != null ? invoiceOutstanding : 0.0;

        // QA-035: unpaid amounts live in OpeningInvoice rows (one per migrated AR bill).
        // Customer.balance is only the seeded total at creation and does not decrement
        // as opening invoices get settled, so it cannot be used as the live opening
        // outstanding. Sum each opening invoice's current outstanding instead — this
        // mirrors what the Customer Ledger screen displays.
        double openingBalance = openingInvoiceRepository.findByCustomer_Code(customerCode).stream()
                .mapToDouble(this::resolveOpeningInvoiceOutstanding)
                .sum();

        double total = BigDecimal.valueOf(invoiceAmt + openingBalance)
                .setScale(2, RoundingMode.HALF_UP).doubleValue();

        return Map.of(
                "outstanding", total,
                "invoiceOutstanding", BigDecimal.valueOf(invoiceAmt).setScale(2, RoundingMode.HALF_UP).doubleValue(),
                "openingBalance", BigDecimal.valueOf(openingBalance).setScale(2, RoundingMode.HALF_UP).doubleValue());
    }

    private double resolveOpeningInvoiceOutstanding(OpeningInvoice invoice) {
        BigDecimal outstanding = invoice.getOutstanding();
        if (outstanding == null) {
            outstanding = invoice.getAmount();
        }
        if (outstanding == null || outstanding.compareTo(BigDecimal.ZERO) <= 0) {
            return 0.0;
        }
        return outstanding.doubleValue();
    }

    // ----------------------------
    // GENERATE INVOICE NUMBER
    // ----------------------------
    public String generateInvoiceNumber() {
        return numberingService.preview(SalesDocumentType.SALES_INVOICE);
    }

    // ----------------------------
    // CREATE / UPDATE
    // ----------------------------
    @Transactional
    public SalesInvoice save(SalesInvoice invoice) {
        SalesInvoice existing = invoice.getId() != null ? invoiceRepo.findById(invoice.getId()).orElse(null) : null;

        if (existing != null) {
            branchAccessService.assertTransactionBranchAccessible(existing.getBranchId(), "Sales Invoice");
            if (existing.getStatus() == SalesInvoiceStatus.POSTED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Posted invoices cannot be modified. Create a reversal instead.");
            }
        }

        Branch resolvedBranch = resolveBranchForSave(existing);
        applyBranchSnapshot(invoice, existing, resolvedBranch);
        validateInvoiceWarehouses(invoice, resolvedBranch != null ? resolvedBranch.getId() : null);

        if (invoice.getId() == null) {
            invoice.setInvoiceNumber(numberingService.resolveNumberForCreate(
                    SalesDocumentType.SALES_INVOICE,
                    invoice.getInvoiceNumber()));
        } else if (existing != null) {
            invoice.setInvoiceNumber(numberingService.resolveNumberForUpdate(
                    SalesDocumentType.SALES_INVOICE,
                    existing.getInvoiceNumber(),
                    invoice.getInvoiceNumber()));
        }

        // Calculate totals from items
        double subTotal = 0;
        double taxTotal = 0;
        List<DeliveryNoteItem> linkedDeliveryItems = loadLinkedDeliveryItems(invoice);

        if (invoice.getItems() != null) {
            for (SalesInvoiceItem item : invoice.getItems()) {
                item.setSalesInvoice(invoice);

                DeliveryNoteItem linkedDeliveryItem = findMatchingDeliveryItem(item, linkedDeliveryItems);
                if (linkedDeliveryItem != null) {
                    linkedDeliveryItems.remove(linkedDeliveryItem);
                    hydrateInvoiceItemFromDeliveryNote(item, linkedDeliveryItem);
                }
                normalizeInvoiceItemFinancials(item, linkedDeliveryItem != null);

                Product product = item.getItemCode() != null
                        ? productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null)
                        : null;
                if (product != null && product.isBatch()) {
                    int requiredQty = resolveBaseQty(product.getId(), item.getUnit(),
                            item.getQuantity() != null ? item.getQuantity() : 0)
                            + resolveBaseQty(product.getId(), item.getUnit(), item.getFoc() != null ? item.getFoc() : 0);
                    assignBatchBinIfNeeded(item, product, requiredQty);
                }

                double netAmount = item.getNetAmount() != null ? item.getNetAmount() : 0;
                double taxAmount = item.getTaxAmount() != null ? item.getTaxAmount() : 0;

                subTotal += (netAmount - taxAmount);
                taxTotal += taxAmount;
            }
        }

        // Round to 2 dp to eliminate floating-point noise from client-side arithmetic
        subTotal = BigDecimal.valueOf(subTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        taxTotal = BigDecimal.valueOf(taxTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double billDiscPct = invoice.getBillDiscount() != null ? invoice.getBillDiscount() : 0;
        double billDiscAmt = BigDecimal.valueOf(subTotal * (billDiscPct / 100))
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
        double total = BigDecimal.valueOf(subTotal - billDiscAmt + taxTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
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

        if (shouldCreateDraftPickingNote(saved, settings)) {
            autoGenerateDeliveryNote(saved, settings);
        }

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

    private List<DeliveryNoteItem> loadLinkedDeliveryItems(SalesInvoice invoice) {
        if (invoice.getLinkedDeliveryNote() == null || invoice.getLinkedDeliveryNote().isBlank()) {
            return new ArrayList<>();
        }

        List<String> dnNumbers = Arrays.stream(invoice.getLinkedDeliveryNote().split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();

        if (dnNumbers.isEmpty()) {
            return new ArrayList<>();
        }

        List<DeliveryNoteItem> result = new ArrayList<>();
        for (DeliveryNote note : deliveryNoteRepository.findByDnNumberIn(dnNumbers)) {
            Hibernate.initialize(note.getItems());
            result.addAll(note.getItems());
        }
        return result;
    }

    private DeliveryNoteItem findMatchingDeliveryItem(SalesInvoiceItem invoiceItem, List<DeliveryNoteItem> deliveryItems) {
        if (invoiceItem == null || deliveryItems == null || deliveryItems.isEmpty()) {
            return null;
        }

        if (invoiceItem.getSalesOrderItemId() != null) {
            for (DeliveryNoteItem deliveryItem : deliveryItems) {
                if (invoiceItem.getSalesOrderItemId().equals(deliveryItem.getSalesOrderItemId())) {
                    return deliveryItem;
                }
            }
        }

        String invoiceCode = normalizeCode(invoiceItem.getItemCode());
        if (invoiceCode == null) {
            return null;
        }

        for (DeliveryNoteItem deliveryItem : deliveryItems) {
            if (invoiceCode.equals(normalizeCode(deliveryItem.getItemCode()))) {
                return deliveryItem;
            }
        }

        return null;
    }

    private void hydrateInvoiceItemFromDeliveryNote(SalesInvoiceItem invoiceItem, DeliveryNoteItem deliveryItem) {
        if (invoiceItem == null || deliveryItem == null) {
            return;
        }

        if (invoiceItem.getItemCode() == null || invoiceItem.getItemCode().isBlank()) {
            invoiceItem.setItemCode(deliveryItem.getItemCode());
        }
        if ((invoiceItem.getDescription() == null || invoiceItem.getDescription().isBlank())
                && deliveryItem.getDescription() != null && !deliveryItem.getDescription().isBlank()) {
            invoiceItem.setDescription(deliveryItem.getDescription());
        }
        if ((invoiceItem.getItemName() == null || invoiceItem.getItemName().isBlank())
                && deliveryItem.getDescription() != null && !deliveryItem.getDescription().isBlank()) {
            invoiceItem.setItemName(deliveryItem.getDescription());
        }
        if (invoiceItem.getUnit() == null || invoiceItem.getUnit().isBlank()) {
            invoiceItem.setUnit(deliveryItem.getUnit());
        }
        if (invoiceItem.getQuantity() == null || invoiceItem.getQuantity() <= 0) {
            invoiceItem.setQuantity(deliveryItem.getCurrentQty() != null
                    ? deliveryItem.getCurrentQty()
                    : deliveryItem.getOrderedQty());
        }
        if (deliveryItem.getPrice() != null) {
            invoiceItem.setPrice(deliveryItem.getPrice());
        }
        if (deliveryItem.getDisc() != null) {
            invoiceItem.setDiscount(deliveryItem.getDisc());
        }
        if (deliveryItem.getTax() != null) {
            invoiceItem.setTaxRate(deliveryItem.getTax());
        }
        if (deliveryItem.getCost() != null) {
            invoiceItem.setCost(deliveryItem.getCost());
        }
        if (invoiceItem.getBinId() == null) {
            invoiceItem.setBinId(deliveryItem.getBinId());
        }
        if (invoiceItem.getSalesOrderItemId() == null) {
            invoiceItem.setSalesOrderItemId(deliveryItem.getSalesOrderItemId());
        }
        if ((invoiceItem.getImage() == null || invoiceItem.getImage().isBlank())
                && deliveryItem.getImage() != null && !deliveryItem.getImage().isBlank()) {
            invoiceItem.setImage(deliveryItem.getImage());
        }
    }

    private void normalizeInvoiceItemFinancials(SalesInvoiceItem item, boolean linkedToDeliveryNote) {
        if (item == null) {
            return;
        }

        boolean shouldCalculate = isMissingOrZero(item.getNetAmount())
                && (linkedToDeliveryNote || !isMissingOrZero(item.getPrice()));

        if (!shouldCalculate) {
            return;
        }

        double qty = item.getQuantity() != null ? item.getQuantity() : 0;
        double price = item.getPrice() != null ? item.getPrice() : 0;
        double discountPercent = item.getDiscount() != null ? item.getDiscount() : 0;
        double taxPercent = item.getTaxRate() != null ? item.getTaxRate() : 0;

        double gross = qty * price;
        double discountAmount = gross * (discountPercent / 100);
        double taxableAmount = Math.max(0, gross - discountAmount);
        double taxAmount = taxableAmount * (taxPercent / 100);
        double netAmount = taxableAmount + taxAmount;

        item.setGrossAmount(roundCurrency(gross));
        item.setTaxAmount(roundCurrency(taxAmount));
        item.setNetAmount(roundCurrency(netAmount));
    }

    private boolean isMissingOrZero(Double value) {
        return value == null || Math.abs(value) < 0.0001d;
    }

    private double roundCurrency(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private String normalizeCode(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase();
    }

    // ----------------------------
    // GET BY ID
    // ----------------------------
    @Transactional(readOnly = true)
    public SalesInvoice getById(Long id) {
        SalesInvoice invoice = invoiceRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Invoice not found: " + id));
        branchAccessService.assertTransactionBranchAccessible(invoice.getBranchId(), "Sales Invoice");

        Hibernate.initialize(invoice.getItems());
        enrichItems(invoice.getItems());
        applyBatchSelectionSummary(invoice);
        return invoice;
    }

    // ----------------------------
    // GET ALL
    // ----------------------------
    @Transactional(readOnly = true)
    public List<SalesInvoice> getAll() {
        List<SalesInvoice> invoices = new ArrayList<>(
                branchAccessService.filterBranchScoped(invoiceRepo.findAll(), SalesInvoice::getBranchId));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                invoices,
                SalesInvoice::getInvoiceDate,
                SalesInvoice::getInvoiceNumber,
                SalesInvoice::getId);

        invoices.forEach(inv -> {
            Hibernate.initialize(inv.getItems());
            enrichItems(inv.getItems());
            applyBatchSelectionSummary(inv);
        });

        return invoices;
    }

    // ----------------------------
    // ENRICH ITEMS FROM PRODUCT
    // ----------------------------
    private void enrichItems(java.util.List<SalesInvoiceItem> items) {
        if (items == null || items.isEmpty()) return;
        Map<Long, String> barcodeMap = new HashMap<>();
        for (SalesInvoiceItem item : items) {
            if (item.getItemCode() == null || item.getItemCode().isBlank()) continue;
            productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).ifPresent(p -> {
                item.setBatchControlled(p.isBatch());
                item.setFefoEnabled(p.isFefoEnabled());
                item.setMinExpiryDaysForSale(p.getMinExpiryDaysForSale() != null ? p.getMinExpiryDaysForSale() : 0);
                item.setBaseRequiredQuantity(
                        resolveBaseQty(p.getId(), item.getUnit(), item.getQuantity() != null ? item.getQuantity() : 0)
                                + resolveBaseQty(p.getId(), item.getUnit(), item.getFoc() != null ? item.getFoc() : 0));
                item.setBinCode(resolveBinCode(item.getBinId()));
                if (item.getSku() == null || item.getSku().isBlank()) item.setSku(p.getSku());
                if (item.getLocalName() == null || item.getLocalName().isBlank()) item.setLocalName(p.getLocalName());
                if (item.getDescription() == null || item.getDescription().isBlank()) item.setDescription(p.getShortDesc());
                if (item.getItemName() == null || item.getItemName().isBlank()) item.setItemName(p.getName());
                if (item.getBrandName() == null && p.getBrand() != null) {
                    item.setBrandName(p.getBrand().getName());
                }
                if (item.getDetailedDesc() == null && p.getDetailedDesc() != null) {
                    item.setDetailedDesc(p.getDetailedDesc());
                }
                if (item.getBarcode() == null || item.getBarcode().isBlank()) {
                    String barcode = barcodeMap.computeIfAbsent(
                            p.getId(),
                            productId -> barcodeRepo.findByProductId(productId).stream()
                                    .map(com.billbull.backend.inventory.product.ProductBarcode::getBarcode)
                                    .filter(value -> value != null && !value.isBlank())
                                    .findFirst()
                                    .orElse(null));
                    item.setBarcode(barcode);
                }
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

    @Transactional
    public SalesInvoice saveBatchSelection(Long invoiceId, Long itemId, BatchSelectionRequest request) {
        SalesInvoice invoice = getEditableDirectInvoice(invoiceId);
        SalesInvoiceItem item = findItem(invoice, itemId);
        Product product = productRepo.findByCodeAndIsActiveTrue(item.getItemCode())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Product not found: " + item.getItemCode()));
        int requiredQty = resolveBaseQty(product.getId(), item.getUnit(), item.getQuantity() != null ? item.getQuantity() : 0)
                + resolveBaseQty(product.getId(), item.getUnit(), item.getFoc() != null ? item.getFoc() : 0);
        batchSelectionService.saveSalesInvoiceLineSelection(invoice, item, request, requiredQty);
        invoiceRepo.save(invoice);
        return getById(invoiceId);
    }

    @Transactional
    public SalesInvoice deleteBatchSelection(Long invoiceId, Long itemId) {
        SalesInvoice invoice = getEditableDirectInvoice(invoiceId);
        SalesInvoiceItem item = findItem(invoice, itemId);
        batchSelectionService.releaseSourceLine(
                BatchSelectionService.DOC_TYPE_SALES_INVOICE,
                invoice.getId(),
                item.getId());
        return getById(invoiceId);
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
        batchSelectionService.releaseSalesInvoice(id);
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
            boolean isCancelledTransition = status == SalesInvoiceStatus.CANCELLED
                    && previousStatus != SalesInvoiceStatus.CANCELLED;
            boolean isNewlyCancelled = isCancelledTransition && previousStatus != SalesInvoiceStatus.DRAFT;

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
                ensureDirectInvoiceBatchSelections(invoice);
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
                batchSelectionService.releaseSalesInvoice(invoice.getId());
                invoice.setDeliveryStatus(DeliveryStatus.CANCELLED);
            } else if (isCancelledTransition) {
                batchSelectionService.releaseSalesInvoice(invoice.getId());
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
        if (invoice.getLinkedDeliveryNote() != null && !invoice.getLinkedDeliveryNote().isBlank())
            return;

        List<String> insufficientItems = new ArrayList<>();

        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.getItemCode() == null || item.getItemCode().isBlank())
                continue;

            Product product = productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null);
            if (product == null)
                continue;
            // QA-001: service products have no physical inventory — never validate stock.
            if (product.isService())
                continue;

            int requiredQty = resolveBaseQty(product.getId(), item.getUnit(), item.getQuantity() != null ? item.getQuantity() : 0)
                    + resolveBaseQty(product.getId(), item.getUnit(), item.getFoc() != null ? item.getFoc() : 0);
            if (requiredQty <= 0)
                continue;

            try {
                Long warehouseId = item.getWarehouseId();
                StockAvailabilityResponse stock = stockAvailabilityService.getStockAvailability(item.getItemCode(), warehouseId, null, null, null);
                int available;
                if (warehouseId != null && stock.getLocations() != null) {
                    // Check only the item's specific warehouse
                    available = stock.getLocations().stream()
                            .filter(loc -> warehouseId.equals(loc.getLocationId()))
                            .mapToInt(loc -> loc.getAvailable() != null ? loc.getAvailable() : 0)
                            .sum();
                } else {
                    // No warehouse set — fall back to total across all warehouses
                    available = stock.getLocations() == null ? 0
                            : stock.getLocations().stream()
                                    .mapToInt(loc -> loc.getAvailable() != null ? loc.getAvailable() : 0)
                                    .sum();
                }
                available += resolveSourceReservationCredit(invoice, item, product, warehouseId);

                if (available < requiredQty) {
                    insufficientItems.add(String.format("'%s' (required: %d, available: %d)",
                            item.getItemCode(), requiredQty, available));
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

    private void applyBatchSelectionSummary(SalesInvoice invoice) {
        if (invoice == null || invoice.getItems() == null) {
            return;
        }
        Map<Long, List<DeliveryBatchSelectionResponse>> directSelections =
                invoice.getId() != null
                        ? batchSelectionService.getSelections(BatchSelectionService.DOC_TYPE_SALES_INVOICE, invoice.getId())
                        : Map.of();
        Map<Long, List<DeliveryBatchSelectionResponse>> salesOrderSelections = Map.of();
        if (invoice.getLinkedSalesOrder() != null && !invoice.getLinkedSalesOrder().isBlank()) {
            salesOrderSelections = salesOrderRepository.findBySoNumber(invoice.getLinkedSalesOrder())
                    .map(so -> batchSelectionService.getSelections(BatchSelectionService.DOC_TYPE_SALES_ORDER, so.getId()))
                    .orElse(Map.of());
        }
        List<DeliveryNote> linkedDeliveryNotes = resolveLinkedDeliveryNotes(invoice);

        for (SalesInvoiceItem item : invoice.getItems()) {
            List<DeliveryBatchSelectionResponse> selections = List.of();
            if (invoice.getSalesType() == SalesType.DIRECT_SALE && item.getId() != null) {
                selections = directSelections.getOrDefault(item.getId(), List.of());
            } else if (item.getSalesOrderItemId() != null) {
                selections = salesOrderSelections.getOrDefault(item.getSalesOrderItemId(), List.of());
            }
            if (selections.isEmpty()) {
                selections = getLinkedDeliverySelections(item, linkedDeliveryNotes);
            }
            item.setBatchSelections(selections);
            item.setBatchSelectedQuantity(selections.stream()
                    .filter(selection -> selection.status == BatchAllocationStatus.RESERVED
                            || selection.status == BatchAllocationStatus.CONSUMED)
                    .mapToInt(selection -> selection.quantity != null ? selection.quantity : 0)
                    .sum());
            item.setBatchSelectionMode(selections.stream()
                    .findFirst()
                    .map(selection -> selection.allocationMethod != null ? selection.allocationMethod.name() : null)
                    .orElse("AUTO_FEFO"));
        }
    }

    private List<DeliveryNote> resolveLinkedDeliveryNotes(SalesInvoice invoice) {
        if (invoice == null || invoice.getLinkedDeliveryNote() == null || invoice.getLinkedDeliveryNote().isBlank()) {
            return List.of();
        }
        List<String> dnNumbers = Arrays.stream(invoice.getLinkedDeliveryNote().split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
        if (dnNumbers.isEmpty()) {
            return List.of();
        }
        List<DeliveryNote> notes = deliveryNoteRepository.findByDnNumberIn(dnNumbers);
        notes.forEach(note -> Hibernate.initialize(note.getItems()));
        return notes;
    }

    private List<DeliveryBatchSelectionResponse> getLinkedDeliverySelections(
            SalesInvoiceItem invoiceItem,
            List<DeliveryNote> notes) {
        if (invoiceItem == null || notes == null || notes.isEmpty()) {
            return List.of();
        }
        for (DeliveryNote note : notes) {
            for (DeliveryNoteItem dnItem : note.getItems()) {
                boolean sameSalesOrderLine = invoiceItem.getSalesOrderItemId() != null
                        && invoiceItem.getSalesOrderItemId().equals(dnItem.getSalesOrderItemId());
                boolean sameItemCode = invoiceItem.getItemCode() != null
                        && invoiceItem.getItemCode().equals(dnItem.getItemCode());
                if (sameSalesOrderLine || sameItemCode) {
                    List<DeliveryBatchSelectionResponse> selections =
                            batchSelectionService.getSelectionsForDeliveryLine(note, dnItem);
                    if (!selections.isEmpty()) {
                        return selections;
                    }
                }
            }
        }
        return List.of();
    }

    private SalesInvoice getEditableDirectInvoice(Long invoiceId) {
        SalesInvoice invoice = getById(invoiceId);
        if (invoice.getSalesType() != SalesType.DIRECT_SALE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch selection on Sales Invoice is only allowed for Direct Sale invoices.");
        }
        if (invoice.getStatus() != SalesInvoiceStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Direct invoice batch selection can only be changed while the invoice is Draft.");
        }
        return invoice;
    }

    private SalesInvoiceItem findItem(SalesInvoice invoice, Long itemId) {
        return invoice.getItems().stream()
                .filter(item -> item.getId() != null && item.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Sales Invoice item not found: " + itemId));
    }

    private void ensureDirectInvoiceBatchSelections(SalesInvoice invoice) {
        if (invoice.getSalesType() != SalesType.DIRECT_SALE || invoice.getItems() == null) {
            return;
        }
        Map<Long, List<DeliveryBatchSelectionResponse>> selectionsByLine =
                batchSelectionService.getSelections(BatchSelectionService.DOC_TYPE_SALES_INVOICE, invoice.getId());
        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.getItemCode() == null || item.getItemCode().isBlank()) {
                continue;
            }
            Product product = productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null);
            if (product == null || !product.isBatch()) {
                continue;
            }
            int requiredQty = resolveBaseQty(product.getId(), item.getUnit(), item.getQuantity() != null ? item.getQuantity() : 0)
                    + resolveBaseQty(product.getId(), item.getUnit(), item.getFoc() != null ? item.getFoc() : 0);
            int selectedQty = selectionsByLine.getOrDefault(item.getId(), List.of()).stream()
                    .filter(selection -> selection.status == BatchAllocationStatus.RESERVED)
                    .mapToInt(selection -> selection.quantity != null ? selection.quantity : 0)
                    .sum();
            if (selectedQty != requiredQty) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Batch selection must exactly match Direct Invoice quantity for " + item.getItemCode()
                                + ". Selected: " + selectedQty + " | Required: " + requiredQty);
            }
        }
    }

    private void assignBatchBinIfNeeded(SalesInvoiceItem item, Product product, int requiredQty) {
        if (item == null || product == null || !product.isBatch() || item.getBinId() != null) {
            return;
        }
        Long binId = findPreferredBinId(item.getWarehouseId(), product.getId(), requiredQty);
        if (binId != null) {
            item.setBinId(binId);
            item.setBinCode(resolveBinCode(binId));
        }
    }

    private Long findPreferredBinId(Long warehouseId, Long productId, int requiredQty) {
        if (warehouseId == null || productId == null || requiredQty <= 0) {
            return null;
        }
        return stockMovementRepo.findActiveBinsByWarehouseAndProduct(warehouseId, productId).stream()
                .filter(row -> ((Number) row[1]).doubleValue() >= requiredQty)
                .map(row -> (Long) row[0])
                .findFirst()
                .orElse(null);
    }

    private String resolveBinCode(Long binId) {
        if (binId == null) {
            return null;
        }
        return binRepo.findById(binId)
                .map(Bin::getCode)
                .orElse(null);
    }

    private int resolveSourceReservationCredit(SalesInvoice invoice, SalesInvoiceItem item, Product product,
            Long warehouseId) {
        int deliveryNoteCredit = 0;
        if (invoice.getId() != null) {
            deliveryNoteCredit = safeDecimal(deliveryNoteRepository.sumReservedQtyForSourceDocument(
                    "SALES_INVOICE",
                    invoice.getId(),
                    product.getId(),
                    warehouseId)).intValue();
        }

        if (deliveryNoteCredit > 0) {
            return deliveryNoteCredit;
        }

        if (product.isBatch()
                && invoice.getSalesType() == SalesType.DIRECT_SALE
                && invoice.getId() != null
                && item.getId() != null) {
            return sumActiveBatchSelections(batchSelectionService
                    .getSelections(BatchSelectionService.DOC_TYPE_SALES_INVOICE, invoice.getId())
                    .getOrDefault(item.getId(), List.of()));
        }

        if (invoice.getLinkedSalesOrder() == null || invoice.getLinkedSalesOrder().isBlank()) {
            return 0;
        }

        return salesOrderRepository.findBySoNumber(invoice.getLinkedSalesOrder())
                .map(so -> {
                    if (so.getStatus() != com.billbull.backend.sales.salesorder.SalesOrderStatus.CONFIRMED
                            && so.getStatus() != com.billbull.backend.sales.salesorder.SalesOrderStatus.PARTIALLY_PAID) {
                        return 0;
                    }
                    if (warehouseId != null && so.getWarehouse() != null
                            && !warehouseId.equals(so.getWarehouse().getId())) {
                        return 0;
                    }
                    if (so.getItems() == null) {
                        return 0;
                    }

                    return so.getItems().stream()
                            .filter(soItem -> item.getItemCode().equals(soItem.getItemCode()))
                            .mapToInt(soItem -> resolveBaseQty(
                                    product.getId(),
                                    soItem.getUnit(),
                                    soItem.getQuantity() != null ? soItem.getQuantity() : 0))
                            .sum();
                })
                .orElse(0);
    }

    private int sumActiveBatchSelections(List<DeliveryBatchSelectionResponse> selections) {
        if (selections == null || selections.isEmpty()) {
            return 0;
        }
        return selections.stream()
                .filter(selection -> selection.status == BatchAllocationStatus.RESERVED
                        || selection.status == BatchAllocationStatus.CONSUMED)
                .mapToInt(selection -> selection.quantity != null ? selection.quantity : 0)
                .sum();
    }

    private BigDecimal safeDecimal(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private int resolveBaseQty(Long productId, String unitName, int qty) {
        if (qty <= 0 || unitName == null || unitName.isBlank()) return qty;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? BigDecimal.valueOf(qty).multiply(p.getConversion())
                                .setScale(0, RoundingMode.HALF_UP).intValue()
                        : qty)
                .orElse(qty);
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

        // Look up credit limit directly from the customer record (authoritative source)
        double creditLimit = customerRepository.findByCode(invoice.getCustomerCode())
                .map(c -> c.getCreditLimitAmount() != null ? c.getCreditLimitAmount().doubleValue() : 0.0)
                .orElse(0.0);

        // Only enforce if a credit limit is actually configured for this customer
        if (creditLimit <= 0)
            return;

        // Sum outstanding (non-paid, non-cancelled) balances for this customer
        Double outstanding = invoiceRepo.findOutstandingBalanceByCustomerCode(invoice.getCustomerCode());
        double outstandingAmount = outstanding != null ? outstanding : 0.0;

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
        req.branchId = invoice.getBranchId();
        req.branchName = invoice.getBranchName();
        req.branchCode = invoice.getBranchCode();

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
                // QA-001: service lines never deliver — no stock movement, no DN line.
                Product itemProduct = item.getItemCode() != null
                        ? productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).orElse(null)
                        : null;
                if (itemProduct != null && itemProduct.isService()) {
                    continue;
                }
                DeliveryNoteItemRequest iReq = new DeliveryNoteItemRequest();
                iReq.itemCode = item.getItemCode();
                iReq.barcode = item.getBarcode();
                iReq.description = item.getDescription() != null && !item.getDescription().isBlank()
                        ? item.getDescription()
                        : item.getItemName();
                iReq.unit = item.getUnit();
                iReq.orderedQty = item.getQuantity();
                iReq.currentQty = item.getQuantity();
                iReq.foc = item.getFoc();
                iReq.focUnit = item.getUnit();
                iReq.image = item.getImage();
                iReq.binId = item.getBinId();
                iReq.salesOrderItemId = item.getSalesOrderItemId();
                iReq.sourceLineId = item.getId();
                iReq.price = item.getPrice();
                iReq.disc = item.getDiscount();
                iReq.tax = item.getTaxRate();
                iReq.cost = item.getCost();
                req.items.add(iReq);
            }
        }

        // QA-001: if every line on the invoice was a service item, there's
        // nothing to deliver. Skip DN creation entirely and treat the invoice
        // as delivered so revenue recognition still proceeds.
        if (req.items.isEmpty()) {
            System.out.println("[Auto-DN] Skipped: invoice " + invoice.getInvoiceNumber()
                    + " has no stock items (all lines are services).");
            return true;
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

    private boolean shouldCreateDraftPickingNote(SalesInvoice invoice, SalesSettings settings) {
        boolean pickingRequested = !Boolean.FALSE.equals(invoice.getRequirePickingNote());
        boolean pickingTypeRequested = invoice.getRequestedFulfillmentType() == null
                || invoice.getRequestedFulfillmentType().isBlank()
                || "PICKING".equalsIgnoreCase(invoice.getRequestedFulfillmentType());
        boolean linkedToExistingDelivery = invoice.getLinkedDeliveryNote() != null
                && !invoice.getLinkedDeliveryNote().isBlank();

        return pickingRequested
                && pickingTypeRequested
                && invoice.getId() != null
                && invoice.getStatus() == SalesInvoiceStatus.DRAFT
                && invoice.getSalesType() != SalesType.DIRECT_SALE
                && settings.getSalesMode() != SalesMode.FAST_SALE
                && !linkedToExistingDelivery
                && !deliveryNoteService.hasActiveDeliveryNoteForSource("SALES_INVOICE", invoice.getId());
    }

    // ----------------------------
    // PRICE HISTORY
    // ----------------------------
    @Transactional(readOnly = true)
    public List<PriceHistoryDTO> getPriceHistory(String itemCode) {
        Long currentBranchId = branchAccessService.getCurrentUserBranchId();
        if (currentBranchId == null) {
            return List.of();
        }
        return invoiceRepo.findPriceHistoryByItemCodeAndBranchScope(
                itemCode,
                currentBranchId,
                org.springframework.data.domain.PageRequest.of(0, 10));
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

    private Branch resolveBranchForSave(SalesInvoice existing) {
        if (existing != null && existing.getBranchId() == null) {
            return null;
        }
        return branchAccessService.getRequiredCurrentUserBranch();
    }

    private void applyBranchSnapshot(SalesInvoice invoice, SalesInvoice existing, Branch resolvedBranch) {
        if (existing != null && existing.getBranchId() == null) {
            invoice.setBranchId(null);
            invoice.setBranchName(null);
            invoice.setBranchCode(null);
            invoice.setBranch(existing.getBranch());
            return;
        }

        if (resolvedBranch == null) {
            invoice.setBranchId(null);
            invoice.setBranchName(null);
            invoice.setBranchCode(null);
            return;
        }

        invoice.setBranchId(resolvedBranch.getId());
        invoice.setBranchName(resolvedBranch.getName());
        invoice.setBranchCode(resolvedBranch.getCode());
        invoice.setBranch(resolvedBranch.getName());
    }

    private void validateInvoiceWarehouses(SalesInvoice invoice, Long branchId) {
        if (branchId == null || invoice.getItems() == null) {
            return;
        }

        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.getWarehouseId() == null) {
                continue;
            }

            Warehouse warehouse = warehouseRepository.findById(item.getWarehouseId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Warehouse not found for item " + item.getItemCode()));
            branchAccessService.assertWarehouseMatchesBranch(warehouse, branchId, "Sales Invoice item");
        }
    }
}
