package com.billbull.backend.pos.salesorder;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import com.billbull.backend.settings.branch.BranchAccessService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

/** POS → Orders: what the till offers, and when it may take an order up. */
@ExtendWith(MockitoExtension.class)
class PosSalesOrderServiceTest {

    @Mock private SalesOrderService salesOrderService;
    @Mock private SalesOrderRepository salesOrderRepository;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private SalesInvoiceService invoiceService;
    @Mock private BranchAccessService branchAccessService;
    @InjectMocks private PosSalesOrderService service;

    @Test
    void theSalesTabListsConfirmedOrdersThatHaveNoLiveInvoiceWithTheirOpenAdvance() {
        SalesOrder open = order("SO-1", SalesOrderStatus.PARTIALLY_PAID, "C-1");
        open.setAdvanceAmount(new BigDecimal("100.00"));
        SalesOrder taken = order("SO-2", SalesOrderStatus.CONFIRMED, "C-2");
        when(salesOrderService.getByStatuses(PosSalesOrderService.CONFIRMED_OPEN)).thenReturn(List.of(open, taken));
        when(invoiceRepository.findLinkedSalesOrdersWithLiveInvoice(any())).thenReturn(List.of("SO-2"));
        when(invoiceService.openSalesOrderAdvance("SO-1")).thenReturn(new BigDecimal("100.00"));

        List<PosSalesOrderResponse> rows = service.listOpen("SALES");

        assertEquals(1, rows.size());
        assertEquals("SO-1", rows.get(0).getOrder().getSoNumber());
        assertEquals(new BigDecimal("100.00"), rows.get(0).getOpenAdvance());
    }

    @Test
    void theSavedTabListsDrafts() {
        when(salesOrderService.getByStatuses(java.util.EnumSet.of(SalesOrderStatus.DRAFT))).thenReturn(List.of());
        assertEquals(List.of(), service.listOpen("SAVED"));
    }

    @Test
    void anOrderForTheSameCustomerWithNoLiveInvoiceCanBeTakenUp() {
        stubOrder(order("SO-1", SalesOrderStatus.CONFIRMED, "C-1"));
        assertDoesNotThrow(() -> service.assertCanTakeUp("SO-1", "c-1"));
    }

    @Test
    void anOrderAlreadyTakenUpIsRefused() {
        stubOrder(order("SO-1", SalesOrderStatus.CONFIRMED, "C-1"));
        when(invoiceRepository.findLinkedSalesOrdersWithLiveInvoice(List.of("SO-1"))).thenReturn(List.of("SO-1"));
        assertThrows(ResponseStatusException.class, () -> service.assertCanTakeUp("SO-1", "C-1"));
    }

    @Test
    void anInvoicedOrderIsRefused() {
        stubOrder(order("SO-1", SalesOrderStatus.INVOICED, "C-1"));
        assertThrows(ResponseStatusException.class, () -> service.assertCanTakeUp("SO-1", "C-1"));
    }

    @Test
    void aSaleToAnotherCustomerIsRefused() {
        stubOrder(order("SO-1", SalesOrderStatus.CONFIRMED, "C-1"));
        assertThrows(ResponseStatusException.class, () -> service.assertCanTakeUp("SO-1", "WALK-IN"));
    }

    @Test
    void aWalkInDraftCanBeTakenUpByAnyCustomer() {
        stubOrder(order("SO-1", SalesOrderStatus.DRAFT, null));
        assertDoesNotThrow(() -> service.assertCanTakeUp("SO-1", "C-9"));
    }

    private void stubOrder(SalesOrder so) {
        when(salesOrderRepository.findBySoNumber(so.getSoNumber())).thenReturn(Optional.of(so));
        lenient().when(invoiceRepository.findLinkedSalesOrdersWithLiveInvoice(List.of(so.getSoNumber())))
                .thenReturn(List.of());
    }

    private static SalesOrder order(String soNumber, SalesOrderStatus status, String customerCode) {
        SalesOrder so = new SalesOrder();
        so.setSoNumber(soNumber);
        so.setStatus(status);
        so.setCustomerCode(customerCode);
        so.setCustomerName("Customer " + customerCode);
        return so;
    }
}
