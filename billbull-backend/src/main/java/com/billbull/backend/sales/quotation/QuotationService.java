package com.billbull.backend.sales.quotation;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
            ProductBarcodeRepository barcodeRepo) {
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
    }

    // -------------------------------------------------
    // GET ALL
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public List<Quotation> getAllQuotations() {
        List<Quotation> quotations = new ArrayList<>(quotationRepo.findAll());
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                quotations,
                Quotation::getDate,
                Quotation::getQtnNo,
                Quotation::getId);
        quotations.forEach(this::initialize);
        return quotations;
    }

    // -------------------------------------------------
    // GET NEXT QUOTATION NO
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public String generateNextQuotationNo() {
        Quotation lastQtn = quotationRepo.findTopByOrderByQtnNoDesc();

        if (lastQtn == null || lastQtn.getQtnNo() == null) {
            return "QTN-0001";
        }

        try {
            String lastNo = lastQtn.getQtnNo();
            String prefix = "QTN-";
            if (lastNo.startsWith(prefix)) {
                String numPart = lastNo.substring(prefix.length());
                int nextNum = Integer.parseInt(numPart) + 1;
                return prefix + String.format("%04d", nextNum);
            }
        } catch (Exception e) {
            // fallback if format is unexpected
        }
        return "QTN-" + System.currentTimeMillis();
    }

    // -------------------------------------------------
    // GET BY ID
    // -------------------------------------------------
    @Transactional(readOnly = true)
    public Quotation getQuotationById(Long id) {
        Quotation quotation = quotationRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Quotation not found with id: " + id));
        initialize(quotation);
        return quotation;
    }

    // -------------------------------------------------
    // CREATE / UPDATE
    // -------------------------------------------------
    public Quotation createOrUpdateQuotation(Quotation quotation) {

        if (quotation.getId() != null) {
            quotationRepo.findById(quotation.getId()).ifPresent(existing -> {
                if (existing.getStatus() == QuotationStatus.CONVERTED) {
                    quotation.setStatus(QuotationStatus.CONVERTED);
                }
            });
        }

        if (quotation.getId() == null &&
                (quotation.getQtnNo() == null || quotation.getQtnNo().isBlank())) {
            quotation.setQtnNo("QTN-" + System.currentTimeMillis());
        }

        if (quotation.getItems() != null) {
            quotation.getItems().forEach(item -> {
                item.setQuotation(quotation);
                if (quotation.getId() == null)
                    item.setId(null);
            });
        }

        if (quotation.getAttachments() != null) {
            quotation.getAttachments().forEach(att -> att.setQuotation(quotation));
        }

        if (quotation.getRevisions() != null) {
            quotation.getRevisions().forEach(rev -> rev.setQuotation(quotation));
        }

        Quotation saved = quotationRepo.save(quotation);
        initialize(saved);
        return saved;
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

        if (status == QuotationStatus.APPROVED) {
            validateStockBeforeApproval(quotation);
            if (quotation.getValidTill() == null) {
                quotation.setValidTill(LocalDate.now().plusDays(7));
            }
        }

        quotation.setStatus(status);
        Quotation saved = quotationRepo.save(quotation);
        initialize(saved);
        return saved;
    }

    // -------------------------------------------------
    // 🔒 STOCK VALIDATION (USED BY APPROVAL)
    // -------------------------------------------------
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
            // Extra safety to avoid expiring converted ones, though query checks 'APPROVED'
            // status
            if (qtn.getStatus() == QuotationStatus.APPROVED) {
                qtn.setStatus(QuotationStatus.EXPIRED);
                quotationRepo.save(qtn);
                log.info("Quotation {} expired automatically (Valid Till: {})", qtn.getQtnNo(), qtn.getValidTill());
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

        pricingRepo.findByProductId(product.getId())
                .ifPresent(p -> dto.setPrice(p.getRetailPrice()));

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
    private void initialize(Quotation quotation) {
        quotation.getItems().size();
        quotation.getAttachments().size();
        quotation.getRevisions().size();
    }
}
