package com.billbull.backend.pos.salesorder;

import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Sales Orders as the POS sees them (POS → Orders).
 *
 * <p>Two tabs, split by where the order came from:
 * <ul>
 *   <li><b>Saved Orders</b> — DRAFT orders, which is what the till's own "Save as Order" creates;</li>
 *   <li><b>Sales Orders</b> — orders confirmed in Customers &amp; Sales → Sales Orders
 *       (CONFIRMED / PARTIALLY_PAID / FULLY_PAID), i.e. agreed with the customer and holding stock.</li>
 * </ul>
 * Either kind can be taken up at the till: opened into the cart with its customer, lines and —
 * for a Delivery order — its shipping address, then checked out (Pickup / Courier) or sent out
 * for delivery (Delivery). An order that already has a live invoice — posted, or a PI Flow
 * Pro-forma Invoice still out for delivery — has been taken up and is no longer offered.
 */
@Service
public class PosSalesOrderService {

    /** Orders confirmed in Customers & Sales and not yet invoiced or delivered. */
    static final Set<SalesOrderStatus> CONFIRMED_OPEN = EnumSet.of(
            SalesOrderStatus.CONFIRMED, SalesOrderStatus.PARTIALLY_PAID, SalesOrderStatus.FULLY_PAID);

    /** Everything the till may take up: the confirmed orders plus the till's own saved drafts. */
    static final Set<SalesOrderStatus> TAKE_UP_STATUSES = EnumSet.of(
            SalesOrderStatus.DRAFT, SalesOrderStatus.CONFIRMED,
            SalesOrderStatus.PARTIALLY_PAID, SalesOrderStatus.FULLY_PAID);

    private final SalesOrderService salesOrderService;
    private final SalesOrderRepository salesOrderRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final SalesInvoiceService invoiceService;
    private final BranchAccessService branchAccessService;

    public PosSalesOrderService(SalesOrderService salesOrderService,
                                SalesOrderRepository salesOrderRepository,
                                SalesInvoiceRepository invoiceRepository,
                                SalesInvoiceService invoiceService,
                                BranchAccessService branchAccessService) {
        this.salesOrderService = salesOrderService;
        this.salesOrderRepository = salesOrderRepository;
        this.invoiceRepository = invoiceRepository;
        this.invoiceService = invoiceService;
        this.branchAccessService = branchAccessService;
    }

    /**
     * Orders the till can take up, for the given tab: {@code SALES} (confirmed in Customers &amp;
     * Sales) or {@code SAVED} (drafts). Each carries the advance still open on it.
     */
    @Transactional(readOnly = true)
    public List<PosSalesOrderResponse> listOpen(String source) {
        Set<SalesOrderStatus> statuses = "SAVED".equalsIgnoreCase(source)
                ? EnumSet.of(SalesOrderStatus.DRAFT)
                : CONFIRMED_OPEN;
        List<SalesOrder> orders = salesOrderService.getByStatuses(statuses);
        if (orders.isEmpty()) return List.of();

        Set<String> taken = new HashSet<>(invoiceRepository.findLinkedSalesOrdersWithLiveInvoice(
                orders.stream().map(SalesOrder::getSoNumber).toList()));
        return orders.stream()
                .filter(o -> !taken.contains(o.getSoNumber()))
                .map(o -> new PosSalesOrderResponse(o, openAdvance(o)))
                .toList();
    }

    /**
     * Validates that a checkout may take up the given order, before anything is written. Refuses
     * an order of another branch, one that is already invoiced/delivered, one that already has a
     * live invoice (taken up at another till, or still out for delivery as a PI), and a sale to a
     * different customer than the order's — the order, and any advance on it, are that customer's.
     */
    @Transactional(readOnly = true)
    public SalesOrder assertCanTakeUp(String soNumber, String customerCode) {
        SalesOrder so = salesOrderRepository.findBySoNumber(soNumber)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Sales Order " + soNumber + " was not found."));
        branchAccessService.assertTransactionBranchAccessible(
                so.getBranch() != null ? so.getBranch().getId() : null, "Sales Order");
        if (!TAKE_UP_STATUSES.contains(so.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sales Order " + soNumber + " is " + so.getStatus().name().toLowerCase().replace('_', ' ')
                            + " and can no longer be taken up at the POS.");
        }
        if (!invoiceRepository.findLinkedSalesOrdersWithLiveInvoice(List.of(soNumber)).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sales Order " + soNumber + " has already been invoiced or sent out for delivery.");
        }
        String orderCustomer = so.getCustomerCode();
        if (orderCustomer != null && !orderCustomer.isBlank()
                && (customerCode == null || !orderCustomer.trim().equalsIgnoreCase(customerCode.trim()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Sales Order " + soNumber + " belongs to " + so.getCustomerName() + " (" + orderCustomer
                            + "). Keep that customer on the sale to take the order up.");
        }
        return so;
    }

    private BigDecimal openAdvance(SalesOrder so) {
        if (so.getAdvanceAmount() == null || so.getAdvanceAmount().signum() <= 0) return BigDecimal.ZERO;
        return invoiceService.openSalesOrderAdvance(so.getSoNumber());
    }
}
