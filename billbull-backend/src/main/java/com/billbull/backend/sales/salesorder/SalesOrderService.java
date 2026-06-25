package com.billbull.backend.sales.salesorder;

import org.hibernate.Hibernate;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.batch.BatchSelectionRequest;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.batch.BatchAllocationStatus;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.delivery.DeliveryBatchSelectionResponse;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class SalesOrderService {

    private final SalesOrderRepository orderRepo;
    private final com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;
    private final com.billbull.backend.inventory.warehouse.WarehouseStockService warehouseStockService;
    private final com.billbull.backend.inventory.product.ProductRepository productRepo;
    private final com.billbull.backend.inventory.product.ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository productMediaRepository;
    private final com.billbull.backend.inventory.product.ProductPackingRepository packingRepo;
    private final BranchAccessService branchAccessService;
    private final StockMovementRepository stockMovementRepo;
    private final BinRepository binRepo;
    private final BatchSelectionService batchSelectionService;
    private final com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;
    private final SalesDocumentNumberingService numberingService;
    private final com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService;
    private final com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository receiptVoucherRepository;

    public SalesOrderService(
            SalesOrderRepository orderRepo,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.inventory.warehouse.WarehouseStockService warehouseStockService,
            com.billbull.backend.inventory.product.ProductRepository productRepo,
            com.billbull.backend.inventory.product.ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository productMediaRepository,
            com.billbull.backend.inventory.product.ProductPackingRepository packingRepo,
            BranchAccessService branchAccessService,
            StockMovementRepository stockMovementRepo,
            BinRepository binRepo,
            BatchSelectionService batchSelectionService,
            com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService,
            SalesDocumentNumberingService numberingService,
            com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService receiptVoucherService,
            com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository receiptVoucherRepository) {
        this.orderRepo = orderRepo;
        this.quotationRepo = quotationRepo;
        this.warehouseStockService = warehouseStockService;
        this.productRepo = productRepo;
        this.barcodeRepo = barcodeRepo;
        this.productMediaRepository = productMediaRepository;
        this.packingRepo = packingRepo;
        this.branchAccessService = branchAccessService;
        this.stockMovementRepo = stockMovementRepo;
        this.binRepo = binRepo;
        this.batchSelectionService = batchSelectionService;
        this.salesSettingsService = salesSettingsService;
        this.numberingService = numberingService;
        this.receiptVoucherService = receiptVoucherService;
        this.receiptVoucherRepository = receiptVoucherRepository;
    }

    private com.billbull.backend.sales.settings.SalesItemPricePolicy activePricePolicy() {
        com.billbull.backend.sales.settings.SalesSettings settings = salesSettingsService.getSettings();
        return settings != null && settings.getSalesItemPricePolicy() != null
                ? settings.getSalesItemPricePolicy()
                : com.billbull.backend.sales.settings.SalesItemPricePolicy.RETAIL;
    }

    @Transactional
    public String generateSalesOrderNumber() {
        return numberingService.preview(SalesDocumentType.SALES_ORDER);
    }

    // ----------------------------
    // CREATE / UPDATE
    // ----------------------------
    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    @Transactional(rollbackFor = Exception.class)
    public SalesOrder save(SalesOrder order) {
        SalesOrder existingOrder = order.getId() != null ? orderRepo.findById(order.getId()).orElse(null) : null;

        // Branch guard + stamp/lock (PDF §3.4 transaction immutability).
        if (existingOrder != null) {
            Long existingBranchId = existingOrder.getBranch() != null ? existingOrder.getBranch().getId() : null;
            branchAccessService.assertTransactionBranchAccessible(existingBranchId, "Sales Order");
            order.setBranch(existingOrder.getBranch());
        } else {
            order.setBranch(branchAccessService.getRequiredCurrentUserBranch());
        }

        Branch currentBranch = branchAccessService.getRequiredCurrentUserBranch();
        Warehouse reservationWarehouse = resolveReservationWarehouse(order, currentBranch);
        order.setWarehouse(reservationWarehouse);

        order.setLinkedQuotation(normalizeOptional(order.getLinkedQuotation()));
        order.setLinkedProforma(normalizeOptional(order.getLinkedProforma()));

        if (order.getLinkedQuotation() != null && order.getLinkedProforma() != null) {
            throw new IllegalStateException(
                    "Sales Order can be linked to either a quotation or a PI / Proforma, not both.");
        }

        if (existingOrder == null) {
            order.setSoNumber(numberingService.resolveNumberForCreate(
                    SalesDocumentType.SALES_ORDER,
                    order.getSoNumber()));
        } else if (existingOrder.getStatus() == SalesOrderStatus.DRAFT) {
            order.setSoNumber(numberingService.resolveNumberForUpdate(
                    SalesDocumentType.SALES_ORDER,
                    existingOrder.getSoNumber(),
                    order.getSoNumber()));
        } else {
            order.setSoNumber(existingOrder.getSoNumber());
        }

        BigDecimal subTotal = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;
        SalesOrderStatus requestedStatus = order.getStatus();
        boolean confirmingOrder = requestedStatus != SalesOrderStatus.DRAFT;
        boolean stockCheckRequired = salesSettingsService.getSettings().isStockCheckRequired();
        Map<Long, List<DeliveryBatchSelectionResponse>> existingBatchSelections =
                order.getId() != null
                        ? batchSelectionService.getSelections(BatchSelectionService.DOC_TYPE_SALES_ORDER, order.getId())
                        : Map.of();

        if (order.getItems() != null) {
            for (SalesOrderItem item : order.getItems()) {
                item.setSalesOrder(order);
                hydrateOrderItemDisplayData(item);

                if (order.getWarehouse() != null && item.getItemCode() != null && item.getQuantity() != null) {
                    com.billbull.backend.inventory.product.Product product = productRepo
                            .findByCodeAndIsActiveTrue(item.getItemCode())
                            .orElse(null);

                    // QA-001: service products carry no inventory — bypass the
                    // stock validation, batch reservation, and bin assignment
                    // entirely, but still let the line contribute to subTotal/tax
                    // below.
                    if (product != null && !product.isService()) {
                        java.math.BigDecimal available = warehouseStockService.getAvailableStock(
                                order.getWarehouse().getId(),
                                product.getId());

                        // Convert requested quantity to base units so the comparison is against
                        // the StockMovement ledger (which always stores base units).
                        int baseRequired = calculateLineBaseQty(
                                product.getId(),
                                item.getUnit(),
                                item.getQuantity(),
                                item.getFocUnit(),
                                item.getFoc());
                        assignBatchBinIfNeeded(order, item, product, baseRequired);
                        if (product.isBatch() && item.getId() != null) {
                            available = available.add(BigDecimal.valueOf(sumActiveBatchSelections(
                                    existingBatchSelections.getOrDefault(item.getId(), List.of()))));
                        }
                        if (stockCheckRequired && available.compareTo(java.math.BigDecimal.valueOf(baseRequired)) < 0) {
                            throw new IllegalStateException(
                                    "Insufficient available stock for item " + item.getItemCode() +
                                            ". Available: " + available + ", Required (base units): " + baseRequired);
                        }
                        if (confirmingOrder && product.isBatch()) {
                            ensureSalesOrderBatchSelectionExact(order, item, baseRequired);
                        }
                    }
                }

                BigDecimal lineTotal = nz(item.getLineTotal());
                BigDecimal taxAmount = nz(item.getTaxAmount());
                BigDecimal footerDisc = nz(item.getFooterDiscount());

                subTotal = subTotal.add(lineTotal).subtract(taxAmount).add(footerDisc);
                tax = tax.add(taxAmount);
            }
        }

        subTotal = subTotal.setScale(2, RoundingMode.HALF_UP);

        // billDiscount is a PERCENTAGE rate; billDiscountAmount is money.
        double billDiscPct = order.getBillDiscount() != null ? order.getBillDiscount() : 0;
        BigDecimal billDiscAmt = nz(order.getBillDiscountAmount());
        if (billDiscAmt.signum() == 0 && billDiscPct > 0) {
            billDiscAmt = subTotal.multiply(BigDecimal.valueOf(billDiscPct))
                    .divide(BigDecimal.valueOf(100))
                    .setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal tax2 = tax.setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = subTotal.subtract(billDiscAmt).add(tax2).setScale(2, RoundingMode.HALF_UP);
        BigDecimal advance = nz(order.getAdvanceAmount());

        order.setSubTotal(subTotal);
        order.setTaxTotal(tax2);
        order.setOrderTotal(total);
        order.setBalanceDue(total.subtract(advance));

        // ✅ STATUS LOGIC: Maintain reservation until delivery
        // Load current DB status to avoid overwriting finalized states on update
        SalesOrderStatus currentStatus = existingOrder != null ? existingOrder.getStatus() : null;

        if (order.getId() == null) {
            order.setStatus(requestedStatus == SalesOrderStatus.DRAFT
                    ? SalesOrderStatus.DRAFT
                    : SalesOrderStatus.CONFIRMED);
        } else if (currentStatus == SalesOrderStatus.INVOICED
                || currentStatus == SalesOrderStatus.DELIVERED
                || currentStatus == SalesOrderStatus.PARTIALLY_DELIVERED) {
            order.setStatus(currentStatus); // Never downgrade finalized statuses
        } else if (requestedStatus == SalesOrderStatus.DRAFT) {
            order.setStatus(SalesOrderStatus.DRAFT);
        } else if (requestedStatus == SalesOrderStatus.CONFIRMED && advance.signum() <= 0) {
            order.setStatus(SalesOrderStatus.CONFIRMED);
        } else if (advance.signum() > 0 && advance.compareTo(total) < 0) {
            order.setStatus(SalesOrderStatus.PARTIALLY_PAID);
        } else if (advance.compareTo(total) >= 0 && total.signum() > 0) {
            order.setStatus(SalesOrderStatus.FULLY_PAID);
        } else {
            order.setStatus(SalesOrderStatus.CONFIRMED);
        }

        // Release any RESERVED batch allocations whose source line no longer exists in
        // the incoming item list. This covers the case where item IDs changed (e.g. due to
        // a re-link to a quotation that cleared soItemId) causing orphanRemoval to recreate
        // items with new IDs, leaving the old allocations stranded.
        if (order.getId() != null && order.getItems() != null) {
            java.util.Set<Long> survivingItemIds = order.getItems().stream()
                    .map(SalesOrderItem::getId)
                    .filter(id -> id != null)
                    .collect(java.util.stream.Collectors.toSet());
            if (!survivingItemIds.isEmpty()) {
                batchSelectionService.releaseStaleOrderLines(order.getId(), survivingItemIds);
            }
        }

        SalesOrder saved = orderRepo.save(order);

        // QA-032: Auto-create a Receipt Voucher for each payment instalment on this SO.
        // Previously-recorded RVs are summed to find the already-receipted total; a new RV
        // is created only for the delta (newAdvance − alreadyReceipited). This supports
        // split / top-up payments without duplicating existing receipts.
        // Wrapped in try/catch so posting-engine failures don't roll back the SO save.
        if (saved.getStatus() != SalesOrderStatus.DRAFT
                && saved.getAdvanceAmount() != null
                && saved.getAdvanceAmount().signum() > 0) {
            try {
                List<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> existing =
                        receiptVoucherRepository.findBySalesOrderIdOrderByDateDesc(saved.getId());
                BigDecimal alreadyReceipted = existing.stream()
                        .map(rv -> rv.getAmount() != null ? rv.getAmount() : BigDecimal.ZERO)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal delta = saved.getAdvanceAmount().subtract(alreadyReceipted)
                        .setScale(2, RoundingMode.HALF_UP);
                if (delta.compareTo(new BigDecimal("0.001")) > 0) {
                    createAdvanceReceiptForOrder(saved, delta);
                    // Re-read the true receipted total (includes the RV just created in its own txn)
                    // and write it back so advanceAmount always equals the sum of posted RVs.
                    BigDecimal trueReceipted = receiptVoucherRepository
                            .findBySalesOrderIdOrderByDateDesc(saved.getId()).stream()
                            .map(rv -> rv.getAmount() != null ? rv.getAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal capped = trueReceipted.min(nz(saved.getOrderTotal()))
                            .setScale(2, RoundingMode.HALF_UP);
                    saved.setAdvanceAmount(capped);
                    saved.setBalanceDue(nz(saved.getOrderTotal()).subtract(capped)
                            .setScale(2, RoundingMode.HALF_UP));
                    orderRepo.save(saved);
                }
            } catch (Exception ex) {
                // Log and continue — receipt-voucher GL failure must not roll back the payment save.
                org.slf4j.LoggerFactory.getLogger(getClass())
                        .error("Failed to auto-create advance receipt for SO {}: {}", saved.getSoNumber(), ex.getMessage());
            }
        }

        // ✅ MARK LINKED QUOTATION AS CONVERTED and stamp current revision number
        // on the order so we can reconstruct exactly which version was agreed to,
        // even if the quotation gets revised again later.
        if (saved.getLinkedQuotation() != null && !saved.getLinkedQuotation().isBlank()) {
            quotationRepo.findByQtnNo(saved.getLinkedQuotation()).ifPresent(qtn -> {
                if (saved.getLinkedQuotationRevision() == null) {
                    saved.setLinkedQuotationRevision(qtn.getRevisions() != null ? qtn.getRevisions().size() : 0);
                    orderRepo.save(saved);
                }
            });
            quotationRepo.updateStatusByQtnNo(
                    saved.getLinkedQuotation(),
                    com.billbull.backend.sales.quotation.QuotationStatus.CONVERTED);
        }

        // Force the lazy warehouse proxy to load while the transaction is still open,
        // so Jackson can serialize it after the session closes (open-in-view=false).
        Hibernate.initialize(saved.getWarehouse());

        // Populate transient batch-selection data so the frontend receives the
        // current reservations immediately after save (without a separate GET).
        // Without this, batchSelections is always [] in the save response, causing
        // the modal to show a stale FEFO preview instead of the actual reserved batch.
        hydrateOrderItemDisplayData(saved);

        return saved;
    }

    private Warehouse resolveReservationWarehouse(SalesOrder order, Branch currentBranch) {
        if (order == null) {
            throw new IllegalStateException("Sales Order payload is missing.");
        }

        if (order.getId() != null) {
            Warehouse existingWarehouse = orderRepo.findById(order.getId())
                    .map(SalesOrder::getWarehouse)
                    .orElse(null);
            if (existingWarehouse != null) {
                return existingWarehouse;
            }
        }

        Warehouse branchDefaultWarehouse = currentBranch.getDefaultWarehouse();
        if (branchDefaultWarehouse == null) {
            throw new IllegalStateException(
                    "No default warehouse is configured for branch " + currentBranch.getName()
                            + ". Set a default warehouse before confirming sales orders.");
        }

        return branchDefaultWarehouse;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    // ----------------------------
    // GET BY ID
    // ----------------------------
    @Transactional(readOnly = true)
    public SalesOrder getById(Long id) {
        SalesOrder order = orderRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Order not found: " + id));

        Hibernate.initialize(order.getItems());
        Hibernate.initialize(order.getWarehouse());
        hydrateOrderItemDisplayData(order);
        return order;
    }

    // ----------------------------
    // STATS
    // ----------------------------
    @Transactional(readOnly = true)
    public Map<String, Object> getStats() {
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.YearMonth month = java.time.YearMonth.now();
        java.time.LocalDate monthStart = month.atDay(1);
        java.time.LocalDate monthEnd = month.atEndOfMonth();
        List<SalesOrder> scopedOrders = branchAccessService.filterExactBranchScopedByBranch(
                orderRepo.findAll(),
                SalesOrder::getBranch);

        long todayOrders = scopedOrders.stream()
                .filter(order -> order.getOrderDate() != null && order.getOrderDate().isEqual(today))
                .count();
        long thisMonthOrders = scopedOrders.stream()
                .filter(order -> order.getOrderDate() != null
                        && !order.getOrderDate().isBefore(monthStart)
                        && !order.getOrderDate().isAfter(monthEnd))
                .count();
        double thisMonthValue = scopedOrders.stream()
                .filter(order -> order.getOrderDate() != null
                        && !order.getOrderDate().isBefore(monthStart)
                        && !order.getOrderDate().isAfter(monthEnd))
                .filter(order -> order.getStatus() != SalesOrderStatus.DRAFT)
                .map(SalesOrder::getOrderTotal)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        long confirmedOrders = scopedOrders.stream()
                .filter(order -> order.getOrderDate() != null
                        && !order.getOrderDate().isBefore(monthStart)
                        && !order.getOrderDate().isAfter(monthEnd))
                .filter(order -> order.getStatus() == SalesOrderStatus.CONFIRMED)
                .count();
        double outstandingBalance = scopedOrders.stream()
                .filter(order -> order.getStatus() == SalesOrderStatus.CONFIRMED
                        || order.getStatus() == SalesOrderStatus.PARTIALLY_PAID
                        || order.getStatus() == SalesOrderStatus.FULLY_PAID)
                .map(order -> {
                    BigDecimal total = order.getOrderTotal() != null ? order.getOrderTotal() : BigDecimal.ZERO;
                    BigDecimal advance = order.getAdvanceAmount() != null ? order.getAdvanceAmount() : BigDecimal.ZERO;
                    return total.subtract(advance);
                })
                .mapToDouble(BigDecimal::doubleValue)
                .sum();

        Map<String, Object> stats = new HashMap<>();
        stats.put("todayOrders", todayOrders);
        stats.put("thisMonthOrders", thisMonthOrders);
        stats.put("thisMonthValue", thisMonthValue);
        stats.put("confirmedOrders", confirmedOrders);
        stats.put("outstandingBalance", outstandingBalance);
        return stats;
    }

    // ----------------------------
    // GET ALL (🔥 FIXED)
    // ----------------------------
    @Transactional(readOnly = true)
    public List<SalesOrder> getAll() {

        List<SalesOrder> orders = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(orderRepo.findAll(), SalesOrder::getBranch));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                orders,
                SalesOrder::getOrderDate,
                SalesOrder::getSoNumber,
                SalesOrder::getId);

        // ✅ FORCE LAZY INITIALIZATION
        orders.forEach(order -> {
            Hibernate.initialize(order.getItems());
            Hibernate.initialize(order.getWarehouse());
            hydrateOrderItemDisplayData(order);
        });

        return orders;
    }

    @Transactional(readOnly = true)
    public List<SalesOrder> getAllByDateRange(java.time.LocalDate from, java.time.LocalDate to) {
        List<SalesOrder> orders = new ArrayList<>(
                branchAccessService.filterBranchScopedByBranch(orderRepo.findByOrderDateBetween(from, to), SalesOrder::getBranch));
        DocumentOrderingUtil.sortByDocumentDateAndNumberDesc(
                orders,
                SalesOrder::getOrderDate,
                SalesOrder::getSoNumber,
                SalesOrder::getId);
        orders.forEach(order -> {
            Hibernate.initialize(order.getItems());
            Hibernate.initialize(order.getWarehouse());
            hydrateOrderItemDisplayData(order);
        });
        return orders;
    }

    @Transactional
    public SalesOrder saveBatchSelection(Long orderId, Long itemId, BatchSelectionRequest request) {
        SalesOrder order = getEditableBatchOrder(orderId);
        SalesOrderItem item = findItem(order, itemId);
        com.billbull.backend.inventory.product.Product product = productRepo
                .findByCodeAndIsActiveTrue(item.getItemCode())
                .orElseThrow(() -> new IllegalStateException("Product not found: " + item.getItemCode()));
        int requiredQty = calculateLineBaseQty(
                product.getId(),
                item.getUnit(),
                item.getQuantity(),
                item.getFocUnit(),
                item.getFoc());
        batchSelectionService.saveSalesOrderLineSelection(order, item, request, requiredQty);
        orderRepo.save(order);
        hydrateOrderItemDisplayData(order);
        return order;
    }

    @Transactional
    public SalesOrder deleteBatchSelection(Long orderId, Long itemId) {
        SalesOrder order = getEditableBatchOrder(orderId);
        SalesOrderItem item = findItem(order, itemId);
        batchSelectionService.releaseSourceLine(
                BatchSelectionService.DOC_TYPE_SALES_ORDER,
                order.getId(),
                item.getId());
        hydrateOrderItemDisplayData(order);
        return order;
    }

    @Transactional
    public void updateStatus(String soNumber, SalesOrderStatus status) {
        orderRepo.findBySoNumber(soNumber).ifPresent(order -> {
            order.setStatus(status);
            orderRepo.save(order);
        });
    }

    @Transactional(readOnly = true)
    public java.util.Optional<Long> findIdBySoNumber(String soNumber) {
        return orderRepo.findBySoNumber(soNumber).map(SalesOrder::getId);
    }

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    @Transactional
    public void updateStatusById(Long id, SalesOrderStatus status) {
        orderRepo.findById(id).ifPresent(order -> {
            order.setStatus(status);
            orderRepo.save(order);
        });
    }

    @Transactional
    public void updateDeliveredQuantities(String soNumber,
            List<com.billbull.backend.sales.delivery.DeliveryNoteItem> deliveredItems) {
        orderRepo.findBySoNumber(soNumber).ifPresent(order -> {
            boolean anyDelivered = false;
            boolean allDelivered = true;

            for (SalesOrderItem soItem : order.getItems()) {
                // Find matching DN item by explicitly linked salesOrderItemId
                // Or fallback to itemCode (for legacy/older DNs if needed)
                com.billbull.backend.sales.delivery.DeliveryNoteItem matchingDnItem = deliveredItems.stream()
                        .filter(dnItem -> {
                            if (dnItem.getSalesOrderItemId() != null) {
                                return dnItem.getSalesOrderItemId().equals(soItem.getId());
                            }
                            return dnItem.getItemCode().equals(soItem.getItemCode());
                        })
                        .findFirst()
                        .orElse(null);

                if (matchingDnItem != null && matchingDnItem.getCurrentQty() != null) {
                    int currentDelivered = soItem.getDeliveredQuantity() != null ? soItem.getDeliveredQuantity() : 0;
                    soItem.setDeliveredQuantity(currentDelivered + matchingDnItem.getCurrentQty());
                }

                int delivered = soItem.getDeliveredQuantity() != null ? soItem.getDeliveredQuantity() : 0;
                int ordered = soItem.getQuantity() != null ? soItem.getQuantity() : 0;

                if (delivered > 0) {
                    anyDelivered = true;
                }
                if (delivered < ordered) {
                    allDelivered = false;
                }
            }

            if (!anyDelivered) {
                order.setStatus(SalesOrderStatus.CONFIRMED);
            } else if (anyDelivered && !allDelivered) {
                order.setStatus(SalesOrderStatus.PARTIALLY_DELIVERED);
            } else if (allDelivered) {
                order.setStatus(SalesOrderStatus.DELIVERED);
            }

            orderRepo.save(order);
        });
    }

    private void hydrateOrderItemDisplayData(SalesOrder order) {
        if (order == null || order.getItems() == null) {
            return;
        }

        order.getItems().forEach(this::hydrateOrderItemDisplayData);
        applyBatchSelectionSummary(order);

        List<String> codesNeedingImage = order.getItems().stream()
                .filter(i -> (i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null && !i.getItemCode().isBlank())
                .map(SalesOrderItem::getItemCode)
                .distinct()
                .toList();

        if (!codesNeedingImage.isEmpty()) {
            Map<String, String> imageMap = new HashMap<>();
            productMediaRepository.findPrimaryByProductCodesIn(codesNeedingImage)
                    .forEach(m -> imageMap.put(m.getProduct().getCode(), m.getImageUrl()));
            order.getItems().forEach(i -> {
                if ((i.getImage() == null || i.getImage().isBlank()) && i.getItemCode() != null) {
                    String url = imageMap.get(i.getItemCode());
                    if (url != null) i.setImage(url);
                }
            });
        }
    }

    private void hydrateOrderItemDisplayData(SalesOrderItem item) {
        if (item == null || item.getItemCode() == null || item.getItemCode().isBlank()) {
            return;
        }

        com.billbull.backend.inventory.product.Product product = productRepo
                .findByCodeAndIsActiveTrue(item.getItemCode())
                .orElse(null);

        if (product == null) {
            return;
        }

        // QA-001: ship productType so the frontend can short-circuit stock checks
        // and side-panel rendering for SERVICE items. Service products are never
        // batch-controlled regardless of any stale flag on the master.
        item.setProductType(product.getProductType() != null ? product.getProductType().name() : null);
        item.setBatchControlled(!product.isService() && product.isBatch());
        item.setFefoEnabled(product.isFefoEnabled());
        item.setMinExpiryDaysForSale(product.getMinExpiryDaysForSale() != null
                ? product.getMinExpiryDaysForSale()
                : 0);
        item.setBaseRequiredQuantity(calculateLineBaseQty(
                product.getId(),
                item.getUnit(),
                item.getQuantity(),
                item.getFocUnit(),
                item.getFoc()));
        item.setBinCode(resolveBinCode(item.getBinId()));

        if (item.getBarcode() == null || item.getBarcode().isBlank()) {
            String barcode = barcodeRepo.findByProductId(product.getId()).stream()
                    .map(com.billbull.backend.inventory.product.ProductBarcode::getBarcode)
                    .filter(code -> code != null && !code.isBlank())
                    .findFirst()
                    .orElse(null);

            if (barcode != null) {
                item.setBarcode(barcode);
            }
        }

        if (item.getBrandName() == null && product.getBrand() != null) {
            item.setBrandName(product.getBrand().getName());
        }
        if (item.getDetailedDesc() == null && product.getDetailedDesc() != null) {
            item.setDetailedDesc(product.getDetailedDesc());
        }
        // QA-029: hydrate remaining identity fields for print templates.
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

        // Hydrate price: packing-level price first, then the product's master
        // price selected by the configured Sales Item Price Policy
        // (RETAIL / MAX_SALE / MIN_SALE) — see SalesSettings.
        if (item.getPrice() == null) {
            java.math.BigDecimal packingPrice = lookupPackingValue(product.getId(), item.getUnit(), true);
            if (packingPrice != null) {
                item.setPrice(packingPrice);
            } else if (product.getPricing() != null) {
                java.math.BigDecimal resolved = com.billbull.backend.sales.settings.SalesPriceResolver
                        .resolve(product.getPricing(), activePricePolicy());
                if (resolved != null) {
                    item.setPrice(resolved);
                }
            }
        }

        // Hydrate cost: packing-level cost first, then product cost
        if (item.getCost() == null) {
            java.math.BigDecimal packingCost = lookupPackingValue(product.getId(), item.getUnit(), false);
            if (packingCost != null) {
                item.setCost(packingCost);
            } else if (product.getPricing() != null && product.getPricing().getCost() != null) {
                item.setCost(product.getPricing().getCost());
            }
        }
    }

    private void applyBatchSelectionSummary(SalesOrder order) {
        if (order == null || order.getId() == null || order.getItems() == null) {
            return;
        }
        Map<Long, List<DeliveryBatchSelectionResponse>> selectionsByLine =
                batchSelectionService.getSelections(BatchSelectionService.DOC_TYPE_SALES_ORDER, order.getId());
        for (SalesOrderItem item : order.getItems()) {
            if (item.getId() == null) {
                continue;
            }
            List<DeliveryBatchSelectionResponse> selections =
                    selectionsByLine.getOrDefault(item.getId(), List.of());
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

    private SalesOrder getEditableBatchOrder(Long orderId) {
        SalesOrder order = getById(orderId);
        if (order.getStatus() == SalesOrderStatus.INVOICED
                || order.getStatus() == SalesOrderStatus.DISPATCHED
                || order.getStatus() == SalesOrderStatus.DELIVERED
                || order.getStatus() == SalesOrderStatus.PARTIALLY_DELIVERED) {
            throw new IllegalStateException("Batch selection can only be changed before delivery/invoicing starts.");
        }
        return order;
    }

    private SalesOrderItem findItem(SalesOrder order, Long itemId) {
        return order.getItems().stream()
                .filter(item -> item.getId() != null && item.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Sales Order item not found: " + itemId));
    }

    private void assignBatchBinIfNeeded(
            SalesOrder order,
            SalesOrderItem item,
            com.billbull.backend.inventory.product.Product product,
            int requiredQty) {
        if (order == null || item == null || product == null || !product.isBatch() || item.getBinId() != null) {
            return;
        }
        Long warehouseId = order.getWarehouse() != null ? order.getWarehouse().getId() : null;
        Long binId = findPreferredBinId(warehouseId, product.getId(), requiredQty);
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

    private void ensureSalesOrderBatchSelectionExact(SalesOrder order, SalesOrderItem item, int requiredQty) {
        if (order.getId() == null || item.getId() == null) {
            throw new IllegalStateException(
                    "Save the Sales Order as Draft before confirming batch-controlled item " + item.getItemCode());
        }
        int selectedQty = batchSelectionService
                .getSelections(BatchSelectionService.DOC_TYPE_SALES_ORDER, order.getId())
                .getOrDefault(item.getId(), List.of())
                .stream()
                .filter(selection -> selection.status == BatchAllocationStatus.RESERVED)
                .mapToInt(selection -> selection.quantity != null ? selection.quantity : 0)
                .sum();
        if (selectedQty != requiredQty) {
            throw new IllegalStateException(
                    "Batch selection must exactly match Sales Order quantity for " + item.getItemCode()
                            + ". Selected: " + selectedQty + " | Required: " + requiredQty);
        }
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

    private int calculateLineBaseQty(Long productId, String unitName, Integer qty, String focUnit, Integer foc) {
        int baseQty = resolvePackingBaseQty(productId, unitName, qty != null ? qty : 0);
        String effectiveFocUnit = focUnit != null && !focUnit.isBlank() ? focUnit : unitName;
        int baseFoc = resolvePackingBaseQty(productId, effectiveFocUnit, foc != null ? foc : 0);
        return baseQty + baseFoc;
    }

    private String resolveBinCode(Long binId) {
        if (binId == null) {
            return null;
        }
        return binRepo.findById(binId)
                .map(Bin::getCode)
                .orElse(null);
    }

    private java.math.BigDecimal lookupPackingValue(Long productId, String unitName, boolean isPrice) {
        if (unitName == null || unitName.isBlank()) return null;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> isPrice ? p.getPrice() : p.getCost())
                .orElse(null);
    }

    private int resolvePackingBaseQty(Long productId, String unitName, int qty) {
        if (qty <= 0 || unitName == null || unitName.isBlank()) return qty;
        return packingRepo.findByProductId(productId).stream()
                .filter(p -> p.getUnit() != null && unitName.equalsIgnoreCase(p.getUnit().getName()))
                .findFirst()
                .map(p -> p.getConversion() != null
                        ? p.getConversion().multiply(java.math.BigDecimal.valueOf(qty))
                                .setScale(0, RoundingMode.HALF_UP).intValue()
                        : qty)
                .orElse(qty);
    }

    /**
     * QA-032: Generate the auto-Receipt Voucher that pairs with a Sales Order
     * advance payment. The voucher is what the user prints from the SO and is
     * what the downstream Sales Invoice credits when the SO is invoiced.
     */
    /** QA-032: Receipt Vouchers linked to a Sales Order (advance receipts). */
    @Transactional(readOnly = true)
    public List<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> getReceiptVouchersForOrder(Long orderId) {
        List<com.billbull.backend.financials.receiptvoucher.ReceiptVoucher> vouchers =
                new ArrayList<>(receiptVoucherRepository.findBySalesOrderIdOrderByDateDesc(orderId));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                vouchers,
                com.billbull.backend.financials.receiptvoucher.ReceiptVoucher::getDate,
                com.billbull.backend.financials.receiptvoucher.ReceiptVoucher::getVoucherId,
                com.billbull.backend.financials.receiptvoucher.ReceiptVoucher::getId);
        return vouchers;
    }

    /** Null-safe money view: treats {@code null} as zero. */
    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    private void createAdvanceReceiptForOrder(SalesOrder order, BigDecimal amount) {
        com.billbull.backend.financials.receiptvoucher.ReceiptVoucher rv =
                new com.billbull.backend.financials.receiptvoucher.ReceiptVoucher();
        rv.setDate(order.getOrderDate() != null
                ? order.getOrderDate()
                : java.time.LocalDate.now());
        rv.setPaymentMode(
                order.getPaymentMethod() != null && !order.getPaymentMethod().isBlank()
                        ? order.getPaymentMethod()
                        : "Cash");
        rv.setReference(order.getPaymentReference() != null && !order.getPaymentReference().isBlank()
                ? order.getPaymentReference()
                : "Advance against SO: " + order.getSoNumber());
        rv.setAmount(nz(amount).setScale(2, RoundingMode.HALF_UP));
        rv.setMemberName(order.getCustomerName() != null
                ? order.getCustomerName()
                : "Walk-in Customer");
        rv.setStatus("Completed");
        rv.setPurpose(com.billbull.backend.financials.receiptvoucher.ReceiptPurpose.ADVANCE_RECEIVED);
        rv.setSalesOrderId(order.getId());
        rv.setCustomerCode(order.getCustomerCode());

        receiptVoucherService.createReceiptInNewTransaction(rv, null);
    }
}
