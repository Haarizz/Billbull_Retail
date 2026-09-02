package com.billbull.backend.financials.receiptvoucher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

@ExtendWith(MockitoExtension.class)
class ReceiptVoucherServiceTest {

    @Mock
    private ReceiptVoucherRepository repository;

    @Mock
    private PostingEngineService postingEngineService;

    @Mock
    private FinancialAuditService auditService;

    @Mock
    private SalesInvoiceRepository salesInvoiceRepository;

    @Mock
    private OpeningInvoiceRepository openingInvoiceRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private BranchAccessService branchAccessService;

    @Mock
    private com.billbull.backend.sales.advance.AdvanceApplicationRepository advanceApplicationRepository;

    @Mock
    private jakarta.persistence.EntityManager entityManager;

    @Mock
    private com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;

    private ReceiptVoucherService service;

    @BeforeEach
    void setUp() {
        service = new ReceiptVoucherService(
                repository,
                postingEngineService,
                auditService,
                salesInvoiceRepository,
                openingInvoiceRepository,
                customerRepository,
                branchAccessService,
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        org.mockito.Mockito.mock(com.billbull.backend.security.RolePermissionRepository.class), false),
                advanceApplicationRepository,
                entityManager,
                effectiveCorrectionViewService,
                "target/test-receipts");
        org.mockito.Mockito.lenient().when(effectiveCorrectionViewService.resolveOverlay(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any()))
                .thenAnswer(i -> i.getArgument(2));

        org.mockito.Mockito.lenient().when(effectiveCorrectionViewService.resolveOverlays(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any()))
                .thenAnswer(i -> i.getArgument(1));
    }

    @Test
    void createReceiptAgainstOpeningInvoiceReducesOutstandingAndPostsToAr() {
        Customer customer = new Customer();
        customer.setCode("CUST-001");
        customer.setName("Acme Trading");

        OpeningInvoice openingInvoice = new OpeningInvoice();
        openingInvoice.setId(9L);
        openingInvoice.setCustomer(customer);
        openingInvoice.setNumber("12");
        openingInvoice.setAmount(new BigDecimal("150.00"));
        openingInvoice.setOutstanding(new BigDecimal("100.00"));

        ReceiptVoucher receipt = new ReceiptVoucher();
        receipt.setDate(LocalDate.of(2026, 5, 19));
        receipt.setMemberName("Acme Trading");
        receipt.setAmount(new BigDecimal("60.00"));
        receipt.setPaymentMode("Cash");
        receipt.setPurpose(ReceiptPurpose.AGAINST_INVOICE);
        receipt.setOpeningInvoiceId(9L);
        receipt.setStatus("Completed");

        AtomicReference<ReceiptVoucher> savedReceipt = new AtomicReference<>();

        when(openingInvoiceRepository.findById(9L)).thenReturn(Optional.of(openingInvoice));
        when(repository.findByOpeningInvoiceId(9L))
                .thenAnswer(invocation -> savedReceipt.get() == null ? List.of() : List.of(savedReceipt.get()));
        when(repository.save(any(ReceiptVoucher.class))).thenAnswer(invocation -> {
            ReceiptVoucher saved = invocation.getArgument(0);
            saved.setId(1L);
            savedReceipt.set(saved);
            return saved;
        });
        when(openingInvoiceRepository.save(any(OpeningInvoice.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(openingInvoiceRepository.findByCustomer_Code("CUST-001")).thenReturn(List.of(openingInvoice));
        when(customerRepository.save(any(Customer.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.createReceipt(receipt, null);

        assertEquals(new BigDecimal("100.00"), openingInvoice.getOpeningBalanceAmount());
        assertEquals(new BigDecimal("40.00"), openingInvoice.getOutstanding());
        assertEquals(new BigDecimal("40.00"), customer.getBalance());
        verify(postingEngineService).createJournalFromReceiptVoucher(savedReceipt.get());
    }

    @Test
    void createReceiptAgainstPartiallyMigratedOpeningInvoiceUsesCurrentOutstandingAsSeed() {
        Customer customer = new Customer();
        customer.setCode("CUST-001");
        customer.setName("Acme Trading");

        OpeningInvoice openingInvoice = new OpeningInvoice();
        openingInvoice.setId(9L);
        openingInvoice.setCustomer(customer);
        openingInvoice.setNumber("12");
        openingInvoice.setAmount(new BigDecimal("1000.00"));
        openingInvoice.setOpeningBalanceAmount(new BigDecimal("1000.00"));
        openingInvoice.setOutstanding(new BigDecimal("500.00"));

        ReceiptVoucher receipt = new ReceiptVoucher();
        receipt.setDate(LocalDate.of(2026, 5, 19));
        receipt.setMemberName("Acme Trading");
        receipt.setAmount(new BigDecimal("500.00"));
        receipt.setPaymentMode("Cash");
        receipt.setPurpose(ReceiptPurpose.AGAINST_INVOICE);
        receipt.setOpeningInvoiceId(9L);
        receipt.setStatus("Completed");

        AtomicReference<ReceiptVoucher> savedReceipt = new AtomicReference<>();

        when(openingInvoiceRepository.findById(9L)).thenReturn(Optional.of(openingInvoice));
        when(repository.findByOpeningInvoiceId(9L))
                .thenAnswer(invocation -> savedReceipt.get() == null ? List.of() : List.of(savedReceipt.get()));
        when(repository.save(any(ReceiptVoucher.class))).thenAnswer(invocation -> {
            ReceiptVoucher saved = invocation.getArgument(0);
            saved.setId(1L);
            savedReceipt.set(saved);
            return saved;
        });
        when(openingInvoiceRepository.save(any(OpeningInvoice.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(openingInvoiceRepository.findByCustomer_Code("CUST-001")).thenReturn(List.of(openingInvoice));
        when(customerRepository.save(any(Customer.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.createReceipt(receipt, null);

        assertEquals(new BigDecimal("500.00"), openingInvoice.getOpeningBalanceAmount());
        assertEquals(0, openingInvoice.getOutstanding().compareTo(BigDecimal.ZERO));
        assertEquals(0, customer.getBalance().compareTo(BigDecimal.ZERO));
    }

    /**
     * Regression: the generator used to read its high-water mark with a string MAX() while
     * padding to three digits. Past 999 the suffix widens to four digits and lexicographic
     * ordering ranks 'RV-2026-999' above 'RV-2026-1000', so MAX() froze at 999 and the
     * generator re-proposed an id that already existed — every receipt, and every POS
     * settlement behind it, then died on the voucher_id unique index.
     */
    @Test
    void generateNextVoucherIdCrossesTheThousandBoundary() {
        String prefix = "RV-" + java.time.Year.now() + "-";
        when(repository.findMaxVoucherSequenceByPrefix(prefix)).thenReturn(999);
        when(repository.existsByVoucherId(any())).thenReturn(false);

        assertEquals(prefix + "1000", service.generateNextVoucherId());
    }

    /** Well past the boundary: four-digit ids must keep incrementing, not wrap or stall. */
    @Test
    void generateNextVoucherIdContinuesAboveOneThousand() {
        String prefix = "RV-" + java.time.Year.now() + "-";
        when(repository.findMaxVoucherSequenceByPrefix(prefix)).thenReturn(1000);
        when(repository.existsByVoucherId(any())).thenReturn(false);

        assertEquals(prefix + "1001", service.generateNextVoucherId());
    }

    /** Below the boundary the historical three-digit zero-padding is preserved. */
    @Test
    void generateNextVoucherIdKeepsThreeDigitPaddingBelowOneThousand() {
        String prefix = "RV-" + java.time.Year.now() + "-";
        when(repository.findMaxVoucherSequenceByPrefix(prefix)).thenReturn(41);
        when(repository.existsByVoucherId(any())).thenReturn(false);

        assertEquals(prefix + "042", service.generateNextVoucherId());
    }

    /** First voucher of a fresh year: no rows for the prefix yet. */
    @Test
    void generateNextVoucherIdStartsAtOneWhenNoneExist() {
        String prefix = "RV-" + java.time.Year.now() + "-";
        when(repository.findMaxVoucherSequenceByPrefix(prefix)).thenReturn(null);
        when(repository.existsByVoucherId(any())).thenReturn(false);

        assertEquals(prefix + "001", service.generateNextVoucherId());
    }

    /** The retry loop steps over ids already taken rather than wedging on a collision. */
    @Test
    void generateNextVoucherIdSkipsIdsAlreadyTaken() {
        String prefix = "RV-" + java.time.Year.now() + "-";
        when(repository.findMaxVoucherSequenceByPrefix(prefix)).thenReturn(999);
        when(repository.existsByVoucherId(prefix + "1000")).thenReturn(true);
        when(repository.existsByVoucherId(prefix + "1001")).thenReturn(true);
        when(repository.existsByVoucherId(prefix + "1002")).thenReturn(false);

        assertEquals(prefix + "1002", service.generateNextVoucherId());
    }
}
