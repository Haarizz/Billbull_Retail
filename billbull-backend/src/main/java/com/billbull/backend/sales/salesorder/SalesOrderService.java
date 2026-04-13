package com.billbull.backend.sales.salesorder;

import org.hibernate.Hibernate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SalesOrderService {

    private final SalesOrderRepository orderRepo;
    private final com.billbull.backend.sales.quotation.QuotationRepository quotationRepo;
    private final com.billbull.backend.inventory.warehouse.WarehouseStockService warehouseStockService;
    private final com.billbull.backend.inventory.product.ProductRepository productRepo;

    public SalesOrderService(
            SalesOrderRepository orderRepo,
            com.billbull.backend.sales.quotation.QuotationRepository quotationRepo,
            com.billbull.backend.inventory.warehouse.WarehouseStockService warehouseStockService,
            com.billbull.backend.inventory.product.ProductRepository productRepo) {
        this.orderRepo = orderRepo;
        this.quotationRepo = quotationRepo;
        this.warehouseStockService = warehouseStockService;
        this.productRepo = productRepo;
    }

    // ----------------------------
    // CREATE / UPDATE
    // ----------------------------
    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.SERIALIZABLE,
                   rollbackFor = Exception.class)
    public SalesOrder save(SalesOrder order) {

        double subTotal = 0;
        double tax = 0;

        if (order.getItems() != null) {
            for (SalesOrderItem item : order.getItems()) {
                item.setSalesOrder(order);

                // 🏗️ HARD VALIDATION: Sales Orders are Hard Reservations
                // Check if the business has enough available stock (which deducts previous SOs)
                // before confirming this SO
                if (order.getWarehouse() != null && item.getItemCode() != null && item.getQuantity() != null) {
                    com.billbull.backend.inventory.product.Product product = productRepo
                            .findByCodeAndIsActiveTrue(item.getItemCode())
                            .orElse(null);

                    if (product != null) {
                        java.math.BigDecimal available = warehouseStockService.getAvailableStock(
                                order.getWarehouse().getId(),
                                product.getId());

                        if (available.compareTo(java.math.BigDecimal.valueOf(item.getQuantity())) < 0) {
                            throw new IllegalStateException(
                                    "Insufficient available stock for item " + item.getItemCode() +
                                            ". Available: " + available + ", Required: " + item.getQuantity());
                        }
                    }
                }

                double lineTotal = item.getLineTotal() != null ? item.getLineTotal() : 0;
                double taxAmount = item.getTaxAmount() != null ? item.getTaxAmount() : 0;

                subTotal += (lineTotal - taxAmount);
                tax += taxAmount;
            }
        }

        double total = subTotal + tax;
        double advance = order.getAdvanceAmount() != null ? order.getAdvanceAmount() : 0;

        order.setSubTotal(subTotal);
        order.setTaxTotal(tax);
        order.setOrderTotal(total);
        order.setBalanceDue(total - advance);

        // ✅ STATUS LOGIC: Maintain reservation until delivery
        if (order.getStatus() == null || order.getId() == null) {
            order.setStatus(SalesOrderStatus.CONFIRMED);
        } else if (order.getStatus() == SalesOrderStatus.INVOICED) {
            // Keep INVOICED if already set (by delivery logic)
        } else if (advance > 0 && advance < total) {
            order.setStatus(SalesOrderStatus.PARTIALLY_PAID);
        } else if (advance >= total && order.getStatus() != SalesOrderStatus.INVOICED) {
            // Fully paid but not yet delivered? Keep as PARTIALLY_PAID or CONFIRMED
            // in many ERPs, fully paid before delivery is still a confirmed order.
            // We'll keep it as PARTIALLY_PAID (misnomer but reserves) or just CONFIRMED.
            order.setStatus(SalesOrderStatus.PARTIALLY_PAID);
        }

        SalesOrder saved = orderRepo.save(order);

        // ✅ MARK LINKED QUOTATION AS CONVERTED
        if (saved.getLinkedQuotation() != null && !saved.getLinkedQuotation().isBlank()) {
            quotationRepo.updateStatusByQtnNo(
                    saved.getLinkedQuotation(),
                    com.billbull.backend.sales.quotation.QuotationStatus.CONVERTED);
        }

        return saved;
    }

    // ----------------------------
    // GET BY ID
    // ----------------------------
    @Transactional(readOnly = true)
    public SalesOrder getById(Long id) {
        SalesOrder order = orderRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Order not found: " + id));

        Hibernate.initialize(order.getItems());
        return order;
    }

    // ----------------------------
    // GET ALL (🔥 FIXED)
    // ----------------------------
    @Transactional(readOnly = true)
    public List<SalesOrder> getAll() {

        List<SalesOrder> orders = orderRepo.findAll();

        // ✅ FORCE LAZY INITIALIZATION
        orders.forEach(order -> Hibernate.initialize(order.getItems()));

        return orders;
    }

    @Transactional
    public void updateStatus(String soNumber, SalesOrderStatus status) {
        orderRepo.findBySoNumber(soNumber).ifPresent(order -> {
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
}
