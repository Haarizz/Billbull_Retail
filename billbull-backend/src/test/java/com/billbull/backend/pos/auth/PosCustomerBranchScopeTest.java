package com.billbull.backend.pos.auth;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.pos.search.PosBatchCheckResponse;
import com.billbull.backend.pos.search.PosCreditBalanceResponse;
import com.billbull.backend.pos.search.PosLookupService;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.sales.advance.AdvanceApplicationService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.Spy;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Branch scope on reads keyed by a customer code or invoice number the caller typed: the POS
 * credit balance, batch check and customer history, and a customer's outstanding balance.
 *
 * <p>Customer visibility is the customer-search rule ({@code CustomerRepository.codesInScope},
 * the same predicate as the global customer typeahead). Invoice rows follow the invoice's own
 * branch. The real {@link BranchAccessService} decides both, over a real {@link BranchContextHolder}.
 * The cashier works in branch 1; branch 2 is out of reach.
 */
class PosCustomerBranchScopeTest {

    private static final long OWN = 1L;
    private static final long OTHER = 2L;

    private final UserRepository userRepository = mock(UserRepository.class);
    @Spy private BranchAccessService branchAccessService =
            new BranchAccessService(userRepository, mock(BranchRepository.class));

    @Mock private CustomerRepository customerRepository;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private OpeningInvoiceRepository openingInvoiceRepository;
    @Mock private AdvanceApplicationService advanceApplicationService;
    @Mock private BatchMasterRepository batchMasterRepository;
    @Mock private StockMovementRepository stockMovementRepository;
    @InjectMocks private SalesInvoiceService invoiceService;

    private PosLookupService lookup;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        lookup = new PosLookupService(customerRepository, invoiceRepository, advanceApplicationService,
                batchMasterRepository, stockMovementRepository, openingInvoiceRepository, branchAccessService);
        // The real scope helper over a stubbed scoped query: "C-OWN" is attached to branch 1,
        // "C-OTHER" only to branch 2.
        when(customerRepository.codesInScope(anyCollection(), any())).thenCallRealMethod();
        when(customerRepository.findByCodesInScope(anyCollection(), anyBoolean(), anyCollection()))
                .thenAnswer(inv -> {
                    java.util.Collection<String> codes = inv.getArgument(0);
                    java.util.Collection<Long> branchIds = inv.getArgument(2);
                    return codes.stream()
                            .filter(code -> branchIds.contains(code.equals("C-OWN") ? OWN : OTHER))
                            .map(PosCustomerBranchScopeTest::customer)
                            .toList();
                });
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("cashier", "pw", "ROLE_SALES"));
        BranchContextHolder.set(new BranchContextHolder.BranchContext(OWN, Set.of(OWN), false));
    }

    @AfterEach
    void tearDown() throws Exception {
        SecurityContextHolder.clearContext();
        BranchContextHolder.clear();
        mocks.close();
    }

    @Test
    void creditBalanceOfAnotherBranchsCustomerReadsAsNotFound() {
        when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                any(), any(), any(), any())).thenReturn(Optional.of(customer("C-OTHER")));

        PosCreditBalanceResponse result = lookup.creditBalance("C-OTHER");

        assertFalse(result.isFound());
        // Nothing about the customer's money was read.
        verify(invoiceRepository, never()).findOutstandingBalanceByCustomerCode(any());
        verifyNoInteractions(advanceApplicationService, openingInvoiceRepository);
    }

    @Test
    void creditBalanceOfOwnBranchsCustomerIsReturned() {
        when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                any(), any(), any(), any())).thenReturn(Optional.of(customer("C-OWN")));

        PosCreditBalanceResponse result = lookup.creditBalance("C-OWN");

        assertTrue(result.isFound());
        assertEquals("C-OWN", result.getCustomer().getCode());
    }

    @Test
    void creditBalanceNameSearchSkipsCustomersOutOfScope() {
        when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                any(), any(), any(), any())).thenReturn(Optional.empty());
        when(customerRepository.findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(any(), any()))
                .thenReturn(List.of(customer("C-OTHER"), customer("C-OWN")));

        assertEquals("C-OWN", lookup.creditBalance("Ahmed").getCustomer().getCode());
    }

    @Test
    void customerHistoryQueriesOnlyReachableBranches() {
        lookup.customerHistory("C-OWN");

        verify(invoiceRepository).findRecentByCustomerCodeScoped(
                eq("C-OWN"), eq(false), eq(Set.of(OWN)), any(Pageable.class));
        verify(invoiceRepository, never()).findRecentByCustomerCode(any(), any());
    }

    @Test
    void batchCheckLeavesOutAnotherBranchsSales() {
        SalesInvoice own = invoice("INV-1", OWN);
        SalesInvoice foreign = invoice("INV-2", OTHER);
        when(invoiceRepository.findByInvoiceNumberPrefixWithItems("INV")).thenReturn(List.of(own, foreign));

        PosBatchCheckResponse result = lookup.batchCheck("", "INV", "", "");

        assertEquals(List.of("INV-1"),
                result.getResults().stream().map(PosBatchCheckResponse.BatchSoldItem::getInvoiceNumber).toList());
    }

    @Test
    void outstandingOfAnotherBranchsCustomerReadsAsNothingOwing() {
        Map<String, Object> result = invoiceService.getCustomerOutstanding("C-OTHER");

        assertEquals(0.0, result.get("outstanding"));
        assertNull(result.get("lastPurchaseDate"));
        verify(invoiceRepository, never()).findOutstandingBalanceByCustomerCode(any());
        verifyNoInteractions(openingInvoiceRepository);
    }

    @Test
    void outstandingOfOwnBranchsCustomerIsComputed() {
        when(invoiceRepository.findOutstandingBalanceByCustomerCode("C-OWN")).thenReturn(125.5);
        when(openingInvoiceRepository.findByCustomer_Code("C-OWN")).thenReturn(List.of());

        assertEquals(125.5, invoiceService.getCustomerOutstanding("C-OWN").get("outstanding"));
    }

    @Test
    void administratorSeesEveryCustomersOutstanding() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(null, Set.of(), true));
        when(invoiceRepository.findOutstandingBalanceByCustomerCode("C-OTHER")).thenReturn(40.0);
        when(openingInvoiceRepository.findByCustomer_Code("C-OTHER")).thenReturn(List.of());

        assertEquals(40.0, invoiceService.getCustomerOutstanding("C-OTHER").get("outstanding"));
        verify(customerRepository, never()).findByCodesInScope(any(), anyBoolean(), any());
    }

    private static Customer customer(String code) {
        Customer c = new Customer();
        c.setCode(code);
        return c;
    }

    private static SalesInvoice invoice(String number, long branch) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setBranchId(branch);
        com.billbull.backend.sales.invoice.SalesInvoiceItem item = new com.billbull.backend.sales.invoice.SalesInvoiceItem();
        item.setItemCode("ITEM-1");
        List<com.billbull.backend.sales.invoice.SalesInvoiceItem> items = new ArrayList<>();
        items.add(item);
        inv.setItems(items);
        return inv;
    }
}
