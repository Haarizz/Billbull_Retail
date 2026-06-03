package com.billbull.backend.sales.quotation;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.billbull.backend.customer.inquiries.CustomerInquiry;
import com.billbull.backend.customer.inquiries.CustomerInquiryRepository;
import com.billbull.backend.customer.inquiries.InquiryFollowUp;
import com.billbull.backend.customer.inquiries.InquiryFollowUpRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductInventoryPolicyRepository;
import com.billbull.backend.inventory.product.ProductMedia;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductPacking;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductTaxRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.settings.SalesPriceResolver;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Transactional
public class QuotationService {

    private static final Logger log = LoggerFactory.getLogger(QuotationService.class);

    private final QuotationRepository quotationRepo;
    private final ObjectMapper objectMapper;

    private final ProductRepository productRepo;
    private final ProductPricingRepository pricingRepo;
    private final ProductTaxRepository taxRepo;
    private final ProductInventoryPolicyRepository inventoryRepo;
    private final StockMovementRepository stockMovementRepo;
    private final com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo;
    private final com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepo;
    private final ProductPackingRepository packingRepo;
    private final ProductMediaRepository mediaRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final CustomerInquiryRepository customerInquiryRepo;
    private final InquiryFollowUpRepository inquiryFollowUpRepo;
    private final SalesSettingsService salesSettingsService;
    private final SalesDocumentNumberingService numberingService;
    private final BranchAccessService branchAccessService;

    public QuotationService(
            QuotationRepository quotationRepo,
            ObjectMapper objectMapper,
            ProductRepository productRepo,
            ProductPricingRepository pricingRepo,
            ProductTaxRepository taxRepo,
            ProductInventoryPolicyRepository inventoryRepo,
            StockMovementRepository stockMovementRepo,
            com.billbull.backend.sales.salesorder.SalesOrderRepository salesOrderRepo,
            com.billbull.backend.sales.invoice.SalesInvoiceRepository salesInvoiceRepo,
            ProductPackingRepository packingRepo,
            ProductMediaRepository mediaRepo,
            ProductBarcodeRepository barcodeRepo,
            CustomerInquiryRepository customerInquiryRepo,
            InquiryFollowUpRepository inquiryFollowUpRepo,
            SalesSettingsService salesSettingsService,
            SalesDocumentNumberingService numberingService,
            BranchAccessService branchAccessService) {
        this.quotationRepo = quotationRepo;
        this.objectMapper = objectMapper;
        this.productRepo = productRepo;
        this.pricingRepo = pricingRepo;
        this.taxRepo = taxRepo;
        this.inventoryRepo = inventoryRepo;
        this.stockMovementRepo = stockMovementRepo;
        this.salesOrderRepo = salesOrderRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.packingRepo = packingRepo;
        this.mediaRepo = mediaRepo;
        this.barcodeRepo = barcodeRepo;
        this.customerInquiryRepo = customerInquiryRepo;
        this.inquiryFollowUpRepo = inquiryFollowUpRepo;
        this.salesSettingsService = salesSettingsService;
        this.numberingService = numberingService;
        this.branchAccessService = branchAccessService;
    }

    // -------------------------------------------------
    // BRANCH RESOLUTION (Phase 3 vertical slice)
    // -------------------------------------------------

    /**
     * Stamps the originating branch onto a quotation. On create, takes the
     * session's active branch; on update, branch is locked to the existing
     * value so an admin who switched branches can't move a saved quotation
     * (PDF section 3.4 — transaction branch immutability).
     */
    private void applyBranchSnapshot(Quotation quotation, Quotation existing) {
        if (existing != null) {
            quotation.setBranchId(existing.getBranchId());
            quotation.setBranchName(existing.getBranchName());
            quotation.setBranchCode(existing.getBranchCode());
            quotation.setBranchLocation(existing.getBranchLocation());
            return;
        }

        Branch resolved = branchAccessService.getRequiredCurrentUserBranch();
        if (resolved == null) {
            return;
        }
        quotation.setBranchId(resolved.getId());
        quotation.setBranchName(resolved.getName());
        quotation.setBranchCode(resolved.getCode());
    }

    private SalesItemPricePolicy activePricePolicy() {
        SalesSettings settings = salesSettingsService.getSettings();
        return settings != null && settings.getSalesItemPricePolicy() != null
                ? settings.getSalesItemPricePolicy()
                : SalesItemPricePolicy.RETAIL;
    }

    // -------------------------------------------------
    // GET ALL
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public List<Quotation> getAllQuotations() {
        List<Quotation> quotations = new ArrayList<>(
                branchAccessService.filterBranchScoped(quotationRepo.findAll(), Quotation::getBranchId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                quotations,
                Quotation::getDate,
                Quotation::getQtnNo,
                Quotation::getId);
        quotations.forEach(this::initialize);
        enrichQuotationImages(quotations);
        return quotations;
    }

    // -------------------------------------------------
    // GET NEXT QUOTATION NO
    // -------------------------------------------------
    @Transactional
    public String generateNextQuotationNo() {
        return numberingService.preview(SalesDocumentType.QUOTATION);
    }

    // -------------------------------------------------
    // GET BY ID
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public Quotation getQuotationById(Long id) {
        Quotation quotation = quotationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Quotation not found with id: " + id));
        initialize(quotation);
        enrichQuotationImages(List.of(quotation));
        return quotation;
    }

    // -------------------------------------------------
    // CREATE / UPDATE
    // -------------------------------------------------
    public Quotation createOrUpdateQuotation(Quotation quotation) {
        Quotation existingQuotation = quotation.getId() != null
                ? quotationRepo.findById(quotation.getId()).orElse(null)
                : null;

        // Guard: restricted users can't edit a quotation belonging to another branch.
        if (existingQuotation != null) {
            branchAccessService.assertTransactionBranchAccessible(existingQuotation.getBranchId(), "Quotation");
        }

        // Stamp branch (create) or carry forward existing branch (update — immutable).
        applyBranchSnapshot(quotation, existingQuotation);

        enrichQuotationItemsFromProducts(quotation);
        validateAndCleanQuotationItems(quotation);

        if (quotation.getId() != null) {
    quotationRepo.findById(quotation.getId()).ifPresent(existing -> {

        // Preserve finalized statuses
        if (existing.getStatus() == QuotationStatus.CONVERTED
                || existing.getStatus() == QuotationStatus.INVOICED) {
            quotation.setStatus(existing.getStatus());
        }

        if (quotation.getSourceInquiryId() == null) {
            quotation.setSourceInquiryId(existing.getSourceInquiryId());
        }

        if (!hasText(quotation.getSourceInquiryNumber())) {
            quotation.setSourceInquiryNumber(existing.getSourceInquiryNumber());
        }

        if (existing.getStatus() == QuotationStatus.DRAFT) {
            quotation.setQtnNo(numberingService.resolveNumberForUpdate(
                    SalesDocumentType.QUOTATION,
                    existing.getQtnNo(),
                    quotation.getQtnNo()));
        } else {
            quotation.setQtnNo(existing.getQtnNo());
        }
    });

} else {
    quotation.setQtnNo(numberingService.resolveNumberForCreate(
            SalesDocumentType.QUOTATION,
            quotation.getQtnNo()));
}

        if (quotation.getItems() != null) {
            // Collect the set of persisted item ids for this quotation. Any incoming
            // item id that doesn't match a persisted row is a client-side temporary
            // key (e.g. Date.now()) — null it so Hibernate inserts instead of trying
            // to merge a phantom row (which throws StaleObjectStateException).
            final java.util.Set<Long> persistedItemIds = quotation.getId() == null
                    ? java.util.Collections.emptySet()
                    : quotationRepo.findById(quotation.getId())
                            .map(existing -> existing.getItems().stream()
                                    .map(QuotationItem::getId)
                                    .filter(java.util.Objects::nonNull)
                                    .collect(java.util.stream.Collectors.toSet()))
                            .orElse(java.util.Collections.emptySet());

            quotation.getItems().forEach(item -> {
                item.setQuotation(quotation);
                if (item.getId() != null && !persistedItemIds.contains(item.getId())) {
                    item.setId(null);
                }
            });
        }

        if (quotation.getAttachments() != null) {
            quotation.getAttachments().forEach(att -> att.setQuotation(quotation));
        }

        if (quotation.getRevisions() != null) {
            quotation.getRevisions().forEach(rev -> rev.setQuotation(quotation));
        }

        // Recalculate header totals from item-level values so the DB is always
        // consistent regardless of what the frontend sends.
        recalculateTotals(quotation);

        Quotation saved = quotationRepo.save(quotation);
        initialize(saved);
        if (shouldConvertSourceInquiry(saved)) {
            markSourceInquiryConverted(saved);
        }
        return saved;
    }

    private void enrichQuotationItemsFromProducts(Quotation quotation) {
        if (quotation == null || quotation.getItems() == null) {
            return;
        }

        for (QuotationItem item : quotation.getItems()) {
            if (item == null || !hasText(item.getItemCode())) {
                continue;
            }

            productRepo.findByCodeAndIsActiveTrue(item.getItemCode()).ifPresent(product -> {
                Long productId = product.getId();

                if (!hasText(item.getDescription())) {
                    item.setDescription(product.getName());
                }

                if (!hasText(item.getBarcode())) {
                    barcodeRepo.findByProductId(productId).stream()
                            .map(ProductBarcode::getBarcode)
                            .filter(this::hasText)
                            .findFirst()
                            .ifPresent(item::setBarcode);
                }

                if (!hasText(item.getImage())) {
                    mediaRepo.findByProductId(productId).stream()
                            .filter(ProductMedia::isPrimary)
                            .map(ProductMedia::getImageUrl)
                            .findFirst()
                            .or(() -> mediaRepo.findByProductId(productId).stream()
                                    .map(ProductMedia::getImageUrl)
                                    .findFirst())
                            .ifPresent(item::setImage);
                }

                if (!isPositive(item.getPrice())) {
                    SalesItemPricePolicy policy = activePricePolicy();
                    pricingRepo.findByProductId(productId)
                            .map(p -> SalesPriceResolver.resolve(p, policy))
                            .filter(this::isPositive)
                            .ifPresent(item::setPrice);
                }

                if (!hasText(item.getUnit())) {
                    inventoryRepo.findByProductId(productId)
                            .filter(inv -> inv.getDefaultUnit() != null)
                            .map(inv -> inv.getDefaultUnit().getName())
                            .filter(this::hasText)
                            .ifPresent(item::setUnit);
                }

                if (item.getBrandName() == null && product.getBrand() != null) {
                    item.setBrandName(product.getBrand().getName());
                }
                if (item.getDetailedDesc() == null && product.getDetailedDesc() != null) {
                    item.setDetailedDesc(product.getDetailedDesc());
                }
                // QA-029: hydrate the rest of the product identity so the
                // shared print template can render name / SKU / short desc /
                // arabic name without an extra fetch on the client side.
                if (item.getProductName() == null) {
                    item.setProductName(product.getName());
                }
                if (item.getSku() == null) {
                    item.setSku(product.getSku());
                }
                if (item.getShortDesc() == null) {
                    item.setShortDesc(product.getShortDesc());
                }
                if (item.getLocalName() == null) {
                    item.setLocalName(product.getLocalName());
                }

                completeMissingLineAmounts(item);
            });
        }
    }

    private void completeMissingLineAmounts(QuotationItem item) {
        if (!isPositive(item.getQuantity()) || !isPositive(item.getPrice())) {
            return;
        }

        if (isPositive(item.getLineTotal()) && item.getTaxAmount() != null) {
            return;
        }

        BigDecimal quantity = item.getQuantity();
        BigDecimal price = item.getPrice();
        BigDecimal discount = item.getDiscount() != null ? item.getDiscount() : BigDecimal.ZERO;
        BigDecimal taxRate = item.getTaxRate() != null ? item.getTaxRate() : BigDecimal.ZERO;

        BigDecimal gross = quantity.multiply(price);
        BigDecimal discountAmount = gross.multiply(discount)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal taxable = gross.subtract(discountAmount);
        BigDecimal taxAmount = taxable.multiply(taxRate)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal lineTotal = taxable.add(taxAmount).setScale(2, RoundingMode.HALF_UP);

        item.setTaxAmount(taxAmount);
        item.setLineTotal(lineTotal);
    }

    // -------------------------------------------------
    // DELETE
    // -------------------------------------------------
    public void deleteQuotation(Long id) {
        quotationRepo.deleteById(id);
    }

    // -------------------------------------------------
    // APPROVE / REJECT
    // -------------------------------------------------
    public Quotation updateStatus(Long id, QuotationStatus status) {

        Quotation quotation = quotationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Quotation not found"));

        if (status == QuotationStatus.PENDING_APPROVAL
                || status == QuotationStatus.APPROVED
                || status == QuotationStatus.CONVERTED
                || status == QuotationStatus.INVOICED) {
            validateAndCleanQuotationItems(quotation);
        }

        if (status == QuotationStatus.APPROVED) {
            validateStockBeforeApproval(quotation);
            if (quotation.getValidTill() == null) {
                quotation.setValidTill(LocalDate.now().plusDays(7));
            }
        }

        quotation.setStatus(status);
        Quotation saved = quotationRepo.save(quotation);
        initialize(saved);
        if (shouldConvertSourceInquiry(saved)) {
            markSourceInquiryConverted(saved);
        }
        return saved;
    }

    private boolean shouldConvertSourceInquiry(Quotation quotation) {
        return quotation != null
                && quotation.getSourceInquiryId() != null
                && (quotation.getStatus() == QuotationStatus.APPROVED
                        || quotation.getStatus() == QuotationStatus.CONVERTED);
    }

    private void markSourceInquiryConverted(Quotation quotation) {
        customerInquiryRepo.findByIdWithFollowUps(quotation.getSourceInquiryId())
                .ifPresentOrElse(inquiry -> {
                    String quoteNo = hasText(quotation.getQtnNo())
                            ? quotation.getQtnNo().trim()
                            : "quotation #" + quotation.getId();

                    inquiry.setStatus("Converted");
                    inquiry.setConvertedQuotationId(quotation.getId());
                    inquiry.setConvertedQuotationNo(quoteNo);
                    inquiry.setConvertedDate(LocalDate.now());

                    if (hasText(quotation.getSourceInquiryNumber()) && !hasText(inquiry.getInquiryNumber())) {
                        inquiry.setInquiryNumber(quotation.getSourceInquiryNumber());
                    }

                    if (!hasConversionActivity(inquiry, quoteNo)) {
                        LocalDateTime now = LocalDateTime.now();
                        InquiryFollowUp activity = new InquiryFollowUp();
                        activity.setType("Quotation");
                        activity.setSummary("Inquiry converted to approved quotation " + quoteNo + ".");
                        activity.setStatus("Converted");
                        activity.setNextFollowUpDate(now.toLocalDate());
                        activity.setNextFollowUpTime(now.toLocalTime().withNano(0));
                        activity.setCreatedBy("System");
                        activity.setCreatedAt(now);
                        activity.setUpdatedAt(now);
                        activity.setInquiry(inquiry);
                        inquiryFollowUpRepo.save(activity);
                    }

                    customerInquiryRepo.save(inquiry);
                }, () -> log.warn("Source inquiry {} was not found for quotation {}",
                        quotation.getSourceInquiryId(), quotation.getQtnNo()));
    }

    private boolean hasConversionActivity(CustomerInquiry inquiry, String quoteNo) {
        if (inquiry.getFollowUps() == null || !hasText(quoteNo)) {
            return false;
        }

        String quoteNoLower = quoteNo.toLowerCase();
        return inquiry.getFollowUps().stream()
                .map(InquiryFollowUp::getSummary)
                .filter(this::hasText)
                .map(String::toLowerCase)
                .anyMatch(summary -> summary.contains("quotation") && summary.contains(quoteNoLower));
    }

    // -------------------------------------------------
    // 🔒 STOCK VALIDATION (USED BY APPROVAL)
    // -------------------------------------------------
    private void validateAndCleanQuotationItems(Quotation quotation) {
        if (quotation == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quotation payload is missing.");
        }

        if (quotation.getItems() == null) {
            quotation.setItems(new ArrayList<>());
        }

        quotation.getItems().removeIf(this::isBlankQuotationItem);

        if (quotation.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Add at least one item before saving or approving the quotation.");
        }

        List<String> issues = new ArrayList<>();
        for (int i = 0; i < quotation.getItems().size(); i++) {
            QuotationItem item = quotation.getItems().get(i);
            int lineNo = i + 1;

            if (!hasText(item.getItemCode()) && !hasText(item.getDescription())) {
                issues.add("Line " + lineNo + ": select an item or enter a description.");
            }
            if (!isPositive(item.getQuantity())) {
                issues.add("Line " + lineNo + ": quantity must be greater than 0.00.");
            }
            if (!isPositive(item.getPrice())) {
                issues.add("Line " + lineNo + ": price must be greater than 0.00.");
            }
        }

        if (!issues.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join(" ", issues));
        }
    }

    private boolean isBlankQuotationItem(QuotationItem item) {
        if (item == null) {
            return true;
        }

        return !hasText(item.getItemCode())
                && !hasText(item.getDescription())
                && !isPositive(item.getQuantity())
                && !isPositive(item.getPrice())
                && !isPositive(item.getLineTotal())
                && !isPositive(item.getFoc());
    }

    private boolean isPositive(BigDecimal value) {
        return value != null && value.compareTo(BigDecimal.ZERO) > 0;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private void validateStockBeforeApproval(Quotation quotation) {

        for (QuotationItem item : quotation.getItems()) {
            String itemCode = item.getItemCode();

            // Skip stock validation for free-text items
            if (itemCode == null || itemCode.trim().isEmpty()) {
                continue;
            }

            Long productId = resolveProductId(item);

            BigDecimal onHand = stockMovementRepo.getTotalAvailableStock(productId);
            BigDecimal qtnReserved = quotationRepo.sumReservedQuantity(itemCode);
            BigDecimal soReserved = salesOrderRepo.sumReservedQuantity(itemCode);
            BigDecimal invReserved = salesInvoiceRepo.sumDraftDirectSaleQuantity(itemCode);

            int totalReserved = (qtnReserved != null ? qtnReserved.intValue() : 0) +
                    (soReserved != null ? soReserved.intValue() : 0) +
                    (invReserved != null ? invReserved.intValue() : 0);

            int availableQty = (onHand != null ? onHand.intValue() : 0) - totalReserved;
            int requiredQty = item.getQuantity().intValue();

            if (availableQty < requiredQty) {
                // Now a Soft Reservation Rule: Do not block Quotations from being approved
                log.warn("Soft Reservation Warning: Insufficient stock for item {}. Available: {}, Required: {}",
                        item.getItemCode(), availableQty, requiredQty);
            }
        }
    }

    // -------------------------------------------------
    // 🕒 EXPIRY SCHEDULER
    // -------------------------------------------------
    @Scheduled(cron = "0 0 0 * * ?") // Runs daily at midnight
    public void expireOldQuotations() {
        log.info("Running Quotation Expiry Scheduler...");
        List<Quotation> expiredList = quotationRepo.findExpiredQuotations();

        int expiredCount = 0;
        for (Quotation qtn : expiredList) {
            QuotationStatus current = qtn.getStatus();
            // Safety: never expire a quotation already finalized downstream.
            if (current == QuotationStatus.DRAFT
                    || current == QuotationStatus.PENDING_APPROVAL
                    || current == QuotationStatus.APPROVED) {
                qtn.setStatus(QuotationStatus.EXPIRED);
                quotationRepo.save(qtn);
                log.info("Quotation {} expired automatically (Valid Till: {}, Prev Status: {})",
                        qtn.getQtnNo(), qtn.getValidTill(), current);
                expiredCount++;
            }
        }
        log.info("Quotation Expiry Scheduler finished. {} quotations expired.", expiredCount);
    }

    // -------------------------------------------------
    // 🟡 READ-ONLY STOCK CHECK (FOR UI)
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public List<QuotationStockCheckDTO> checkStockForApproval(Long quotationId) {

        Quotation quotation = getQuotationById(quotationId);
        List<QuotationStockCheckDTO> result = new ArrayList<>();

        for (QuotationItem item : quotation.getItems()) {
            String itemCode = item.getItemCode();

            if (itemCode == null || itemCode.trim().isEmpty()) {
                QuotationStockCheckDTO dto = new QuotationStockCheckDTO();
                dto.setItemCode("N/A");
                dto.setItemName(item.getDescription());
                dto.setRequestedQty(item.getQuantity() != null ? item.getQuantity().intValue() : 0);
                dto.setAvailableQty(0);
                dto.setSufficient(true); // Treat free-text as sufficient
                result.add(dto);
                continue;
            }

            // QA-001: SERVICE products carry no inventory — always report as sufficient.
            com.billbull.backend.inventory.product.Product product =
                    productRepo.findByCodeAndIsActiveTrue(itemCode).orElse(null);
            if (product != null && product.isService()) {
                QuotationStockCheckDTO dto = new QuotationStockCheckDTO();
                dto.setItemCode(itemCode);
                dto.setItemName(item.getDescription());
                dto.setRequestedQty(item.getQuantity() != null ? item.getQuantity().intValue() : 0);
                dto.setAvailableQty(Integer.MAX_VALUE);
                dto.setSufficient(true);
                result.add(dto);
                continue;
            }

            Long productId = resolveProductId(item);

            BigDecimal onHand = stockMovementRepo.getTotalAvailableStock(productId);
            BigDecimal qtnReserved = quotationRepo.sumReservedQuantity(itemCode);
            BigDecimal soReserved = salesOrderRepo.sumReservedQuantity(itemCode);
            BigDecimal invReserved = salesInvoiceRepo.sumDraftDirectSaleQuantity(itemCode);

            int totalReserved = (qtnReserved != null ? qtnReserved.intValue() : 0) +
                    (soReserved != null ? soReserved.intValue() : 0) +
                    (invReserved != null ? invReserved.intValue() : 0);

            int availableQty = (onHand != null ? onHand.intValue() : 0) - totalReserved;

            BigDecimal requested = item.getQuantity();
            int requestedQty = requested != null ? requested.intValueExact() : 0;

            QuotationStockCheckDTO dto = new QuotationStockCheckDTO();
            dto.setItemCode(itemCode);
            dto.setItemName(item.getDescription());
            dto.setRequestedQty(requestedQty);
            dto.setAvailableQty(availableQty);
            dto.setSufficient(availableQty >= requestedQty);

            result.add(dto);
        }

        return result;
    }

    // -------------------------------------------------
    // HELPERS
    // -------------------------------------------------

    /**
     * Recomputes subTotal, taxAmount, and totalAmount on the Quotation header from
     * the item-level lineTotal / taxAmount values.  Mirrors the approach in
     * SalesOrderService so the stored header totals are always authoritative.
     */
    private void recalculateTotals(Quotation quotation) {
        double subTotal = 0;
        double taxTotal = 0;

        if (quotation.getItems() != null) {
            for (QuotationItem item : quotation.getItems()) {
                double lineTotal = item.getLineTotal() != null ? item.getLineTotal().doubleValue() : 0;
                double taxAmt    = item.getTaxAmount() != null ? item.getTaxAmount().doubleValue() : 0;
                subTotal += (lineTotal - taxAmt);
                taxTotal += taxAmt;
            }
        }

        double billDiscPct = quotation.getBillDiscount() != null ? quotation.getBillDiscount().doubleValue() : 0;
        double billDiscAmt = BigDecimal.valueOf(subTotal * (billDiscPct / 100))
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
        subTotal = BigDecimal.valueOf(subTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        taxTotal = BigDecimal.valueOf(taxTotal).setScale(2, RoundingMode.HALF_UP).doubleValue();
        double total = BigDecimal.valueOf(subTotal - billDiscAmt + taxTotal)
                .setScale(2, RoundingMode.HALF_UP).doubleValue();

        quotation.setSubTotal(BigDecimal.valueOf(subTotal));
        quotation.setTaxAmount(BigDecimal.valueOf(taxTotal));
        quotation.setTotalAmount(BigDecimal.valueOf(total));
    }

    private Long resolveProductId(QuotationItem item) {

        return productRepo.findByCodeAndIsActiveTrue(item.getItemCode())
                .orElseThrow(() -> new IllegalStateException(
                        "Active product not found for item code: " + item.getItemCode()))
                .getId();
    }

    // -------------------------------------------------
    // ATTACHMENTS
    // -------------------------------------------------
    public Quotation uploadAttachment(Long quotationId, MultipartFile file) throws IOException {

        Quotation quotation = getQuotationById(quotationId);

        QuotationAttachment attachment = new QuotationAttachment();
        attachment.setFileName(file.getOriginalFilename());
        attachment.setFileType(file.getContentType());
        attachment.setFileSize(file.getSize());
        attachment.setData(file.getBytes());
        attachment.setQuotation(quotation);

        quotation.getAttachments().add(attachment);

        Quotation saved = quotationRepo.save(quotation);
        initialize(saved);
        return saved;
    }

    // -------------------------------------------------
    // REVISIONS
    // -------------------------------------------------
    public Quotation createRevision(Long quotationId, String note)
            throws JsonProcessingException {

        Quotation current = getQuotationById(quotationId);

        QuotationRevision revision = new QuotationRevision();
        revision.setRevisionNumber(current.getRevisions().size() + 1);

        revision.setQtnNoDisplay(
                current.getQtnNo() + " Rev " +
                        String.format("%02d", revision.getRevisionNumber()));

        revision.setRevisionDate(LocalDate.now());
        revision.setFollowUpNote(note);
        revision.setStatusAtTime(current.getStatus());
        revision.setTotalAmountSnapshot(current.getTotalAmount());
        revision.setItemsSnapshotJson(objectMapper.writeValueAsString(current.getItems()));
        revision.setQuotation(current);

        current.getRevisions().add(0, revision);
        current.setStatus(QuotationStatus.DRAFT);

        Quotation saved = quotationRepo.save(current);
        initialize(saved);
        return saved;
    }

    // -------------------------------------------------
    // PRODUCT LOOKUP
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public List<SalesProductDTO> getProductsForSales() {
        return productRepo.findAllByIsActiveTrue()
                .stream()
                .map(this::mapToSalesProductDTO)
                .toList();
    }

    private SalesProductDTO mapToSalesProductDTO(Product product) {

        SalesProductDTO dto = new SalesProductDTO();
        dto.setId(product.getId());
        dto.setCode(product.getCode());
        dto.setName(product.getName());
        dto.setMaxDiscount(product.getMaxDiscount());
        dto.setSku(product.getSku());

        // ✅ Map barcode
        List<ProductBarcode> barcodes = barcodeRepo.findByProductId(product.getId());
        String barcodeStr = barcodes.stream()
                .map(ProductBarcode::getBarcode)
                .findFirst()
                .orElse("");
        dto.setBarcode(barcodeStr);

        // ✅ Map stock
        dto.setStock(stockMovementRepo.getTotalAvailableStock(product.getId()));
        // ✅ Map product image
        List<ProductMedia> mediaList = mediaRepo.findByProductId(product.getId());
        String primaryImage = mediaList.stream()
                .filter(ProductMedia::isPrimary)
                .map(ProductMedia::getImageUrl)
                .findFirst()
                .orElse(mediaList.stream().map(ProductMedia::getImageUrl).findFirst().orElse(null));

        dto.setPrimaryImage(primaryImage);

        SalesItemPricePolicy policy = activePricePolicy();
        pricingRepo.findByProductId(product.getId())
                .ifPresent(p -> dto.setPrice(SalesPriceResolver.resolve(p, policy)));

        taxRepo.findByProductId(product.getId())
                .ifPresent(t -> dto.setTaxRate(t.getSalesTax()));

        inventoryRepo.findByProductId(product.getId())
                .ifPresent(inv -> {
                    if (inv.getDefaultUnit() != null) {
                        dto.setUnit(inv.getDefaultUnit().getName());
                    }
                });

        // ✅ Fetch and map packing levels
        List<ProductPacking> packings = packingRepo.findByProductId(product.getId());
        List<PackingDTO> packingDTOs = packings.stream()
                .map(packing -> {
                    PackingDTO packingDTO = new PackingDTO();
                    packingDTO.setUnit(packing.getUnit() != null ? packing.getUnit().getName() : null);
                    packingDTO.setConversion(packing.getConversion());
                    packingDTO.setCost(packing.getCost());
                    packingDTO.setPrice(packing.getPrice());
                    return packingDTO;
                })
                .toList();
        dto.setPackings(packingDTOs);

        return dto;
    }

    // -------------------------------------------------
    // PRICE HISTORY
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public List<QuotationHistoryDTO> getItemPriceHistory(String itemCode) {
        List<Quotation> recentQuotations = quotationRepo.findTopByItemCodeOrderByIdDesc(
                itemCode, org.springframework.data.domain.PageRequest.of(0, 3));

        return recentQuotations.stream().map(qtn -> {
            QuotationItem matchedItem = qtn.getItems().stream()
                    .filter(i -> itemCode.equals(i.getItemCode()))
                    .findFirst()
                    .orElse(null);

            BigDecimal price = matchedItem != null ? matchedItem.getPrice() : BigDecimal.ZERO;
            BigDecimal qty = matchedItem != null ? matchedItem.getQuantity() : BigDecimal.ZERO;

            return new QuotationHistoryDTO(
                    qtn.getQtnNo(),
                    qtn.getDate() != null ? qtn.getDate() : java.time.LocalDate.now(),
                    qty,
                    price);
        }).collect(java.util.stream.Collectors.toList());
    }

    // -------------------------------------------------
    // LAZY INIT
    // -------------------------------------------------
    private void enrichQuotationImages(List<Quotation> quotations) {
        List<String> codes = quotations.stream()
                .flatMap(q -> q.getItems().stream())
                .filter(i -> (i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null && !i.getItemCode().isBlank())
                .map(QuotationItem::getItemCode)
                .distinct()
                .toList();

        if (codes.isEmpty()) return;

        Map<String, String> imageMap = new HashMap<>();
        mediaRepo.findPrimaryByProductCodesIn(codes)
                .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));

        quotations.forEach(q -> q.getItems().forEach(i -> {
            if ((i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null) {
                String url = imageMap.get(i.getItemCode());
                if (url != null) i.setImage(url);
            }
        }));
    }

    private void initialize(Quotation quotation) {
        quotation.getItems().size();
        quotation.getAttachments().size();
        quotation.getRevisions().size();
        // QA-001: enrich each line with its product's type so the frontend can
        // short-circuit stock validation for SERVICE items on reload.
        enrichProductTypes(quotation);
    }

    private void enrichProductTypes(Quotation quotation) {
        if (quotation == null || quotation.getItems() == null) return;
        java.util.List<String> codes = quotation.getItems().stream()
                .map(QuotationItem::getItemCode)
                .filter(c -> c != null && !c.isBlank())
                .distinct()
                .toList();
        if (codes.isEmpty()) return;
        java.util.Map<String, com.billbull.backend.inventory.product.Product> productByCode = new java.util.HashMap<>();
        for (String code : codes) {
            productRepo.findByCodeAndIsActiveTrue(code)
                    .ifPresent(p -> productByCode.put(code, p));
        }
        quotation.getItems().forEach(i -> {
            com.billbull.backend.inventory.product.Product p = productByCode.get(i.getItemCode());
            if (p == null) return;
            if (p.getProductType() != null) i.setProductType(p.getProductType().name());
            // Service products are never batch-controlled (no inventory). For
            // stock products, mirror the master's batch/FEFO/min-expiry flags so
            // the SO conversion preserves batch-selection requirements.
            boolean isService = p.isService();
            i.setBatchControlled(!isService && p.isBatch());
            i.setFefoEnabled(p.isFefoEnabled());
            i.setMinExpiryDaysForSale(p.getMinExpiryDaysForSale());
        });
    }
}
