package com.billbull.backend.pos.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductAggregateResponse;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductService;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.voucher.CreditVoucher;
import com.billbull.backend.sales.voucher.CreditVoucherRepository;
import com.billbull.backend.sales.voucher.CreditVoucherStatus;

@ExtendWith(MockitoExtension.class)
class PosSearchServiceTest {

    @Mock private ProductService productService;
    @Mock private ProductRepository productRepository;
    @Mock private BatchMasterRepository batchMasterRepository;
    @Mock private SerialMasterRepository serialMasterRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private CreditVoucherRepository creditVoucherRepository;

    private PosSearchService service;

    @BeforeEach
    void setUp() {
        service = new PosSearchService(productService, productRepository, batchMasterRepository,
                serialMasterRepository, customerRepository, creditVoucherRepository);
    }

    @Test
    void blankQueryResolvesToNone() {
        PosResolveResponse res = service.resolve("   ");
        assertEquals(PosResolveResponse.Type.NONE, res.getType());
        verify(productService, never()).searchProductsByBarcode(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void exactBarcodeWinsAndCarriesNoPinnedBatch() {
        ProductAggregateResponse product = new ProductAggregateResponse();
        when(productService.searchProductsByBarcode("6009876543210")).thenReturn(List.of(product));

        PosResolveResponse res = service.resolve("6009876543210");

        assertEquals(PosResolveResponse.Type.PRODUCT, res.getType());
        assertSame(product, res.getProduct());
        assertNull(res.getPinnedBatchNumber());
        // Phase 9: branch-scoped POS availability overlay is applied to the resolved product.
        verify(productService).applyBranchScopedPosStock(product);
        // Barcode hit short-circuits before batch/code/customer lookups.
        verify(batchMasterRepository, never()).findFirstByBatchNumberIgnoreCase(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void exactBatchNumberPinsTheScannedUnit() {
        when(productService.searchProductsByBarcode("ST-180626-L01-ABC-3")).thenReturn(List.of());
        BatchMaster batch = new BatchMaster();
        batch.setBatchNumber("ST-180626-L01-ABC-3");
        batch.setProductId(42L);
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("ST-180626-L01-ABC-3"))
                .thenReturn(Optional.of(batch));
        ProductAggregateResponse product = new ProductAggregateResponse();
        when(productService.getById(42L)).thenReturn(product);

        PosResolveResponse res = service.resolve("ST-180626-L01-ABC-3");

        assertEquals(PosResolveResponse.Type.PRODUCT, res.getType());
        assertSame(product, res.getProduct());
        assertEquals("ST-180626-L01-ABC-3", res.getPinnedBatchNumber());
    }

    @Test
    void reservedBatchIsBlockedNotPinned() {
        // One batch == one physical unit. A RESERVED unit (held for a layaway /
        // another open sale) has no available quantity, so POS must refuse to add
        // it rather than overselling stock the warehouse already shows as reserved.
        when(productService.searchProductsByBarcode("OS-120626-L01-10672-3")).thenReturn(List.of());
        BatchMaster batch = new BatchMaster();
        batch.setBatchNumber("OS-120626-L01-10672-3");
        batch.setProductId(42L);
        batch.setStatus(com.billbull.backend.inventory.batch.BatchStatus.RESERVED);
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("OS-120626-L01-10672-3"))
                .thenReturn(Optional.of(batch));

        PosResolveResponse res = service.resolve("OS-120626-L01-10672-3");

        assertEquals(PosResolveResponse.Type.BLOCKED, res.getType());
        org.junit.jupiter.api.Assertions.assertTrue(res.getMessage().toLowerCase().contains("reserved"));
        assertNull(res.getProduct());
        // Blocked before any product lookup — never resolves the product aggregate.
        verify(productService, never()).getById(org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void consumedBatchIsBlockedNotPinned() {
        when(productService.searchProductsByBarcode("OS-120626-L01-10672-9")).thenReturn(List.of());
        BatchMaster batch = new BatchMaster();
        batch.setBatchNumber("OS-120626-L01-10672-9");
        batch.setProductId(42L);
        batch.setStatus(com.billbull.backend.inventory.batch.BatchStatus.CONSUMED);
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("OS-120626-L01-10672-9"))
                .thenReturn(Optional.of(batch));

        PosResolveResponse res = service.resolve("OS-120626-L01-10672-9");

        assertEquals(PosResolveResponse.Type.BLOCKED, res.getType());
        org.junit.jupiter.api.Assertions.assertTrue(res.getMessage().toLowerCase().contains("sold")
                || res.getMessage().toLowerCase().contains("consumed"));
    }

    @Test
    void exactProductCodeResolvesWhenNotBarcodeOrBatch() {
        when(productService.searchProductsByBarcode("ITEM-1")).thenReturn(List.of());
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("ITEM-1")).thenReturn(Optional.empty());
        Product entity = new Product();
        entity.setId(7L);
        // Phase 6: exact code/SKU resolution goes through the branch-first service resolver.
        when(productService.resolveActiveByCodeOrSku("ITEM-1")).thenReturn(Optional.of(entity));
        ProductAggregateResponse product = new ProductAggregateResponse();
        when(productService.getById(7L)).thenReturn(product);

        PosResolveResponse res = service.resolve("ITEM-1");

        assertEquals(PosResolveResponse.Type.PRODUCT, res.getType());
        assertSame(product, res.getProduct());
        assertNull(res.getPinnedBatchNumber());
    }

    @Test
    void exactCustomerResolvesWhenNoProductMatch() {
        when(productService.searchProductsByBarcode("050111222")).thenReturn(List.of());
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("050111222")).thenReturn(Optional.empty());
        when(productService.resolveActiveByCodeOrSku("050111222")).thenReturn(Optional.empty());
        Customer customer = new Customer();
        customer.setCode("CUST-9");
        customer.setName("Jane Doe");
        customer.setMobile("050111222");
        when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                "050111222", "050111222", "050111222", "050111222")).thenReturn(Optional.of(customer));

        PosResolveResponse res = service.resolve("050111222");

        assertEquals(PosResolveResponse.Type.CUSTOMER, res.getType());
        assertEquals("CUST-9", res.getCustomer().getCode());
        assertEquals("Jane Doe", res.getCustomer().getName());
        assertEquals("050111222", res.getCustomer().getMobile());
    }

    @Test
    void noMatchResolvesToNone() {
        lenient().when(productService.searchProductsByBarcode("ghost")).thenReturn(List.of());
        lenient().when(batchMasterRepository.findFirstByBatchNumberIgnoreCase("ghost")).thenReturn(Optional.empty());
        lenient().when(productService.resolveActiveByCodeOrSku("ghost")).thenReturn(Optional.empty());
        lenient().when(customerRepository.findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                "ghost", "ghost", "ghost", "ghost")).thenReturn(Optional.empty());

        PosResolveResponse res = service.resolve("ghost");

        assertEquals(PosResolveResponse.Type.NONE, res.getType());
    }

    // ── Credit Voucher resolution ────────────────────────────────────────────
    //
    // A voucher is a payment instrument. Resolving one must produce a VOUCHER hit, never a
    // product and never a bare "no match" — the till has to be able to say what it found.

    @Test
    void voucherCodeResolvesToVoucherRatherThanNoMatch() {
        stubNoProductMatch("EG56-RKDM-XV3K");
        when(creditVoucherRepository.findByCodeOrBarcode("EG56-RKDM-XV3K"))
                .thenReturn(Optional.of(voucher(new java.math.BigDecimal("100.00"), CreditVoucherStatus.ACTIVE)));

        PosResolveResponse res = service.resolve("EG56-RKDM-XV3K");

        assertEquals(PosResolveResponse.Type.VOUCHER, res.getType());
        assertEquals("CV-2026-000007", res.getVoucher().voucherNumber);
        assertEquals(0, new java.math.BigDecimal("100.00").compareTo(res.getVoucher().remainingAmount));
        org.junit.jupiter.api.Assertions.assertTrue(res.getVoucher().redeemable);
        // A voucher hit must not also look up a customer — it already resolved.
        verify(customerRepository, never())
                .findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void scannedBarcodePayloadResolvesTheSameVoucherAsTheTypedCode() {
        // The printed barcode carries the code without its separators; both must land on the
        // same voucher, or scanning and typing would disagree.
        stubNoProductMatch("EG56RKDMXV3K");
        when(creditVoucherRepository.findByCodeOrBarcode("EG56RKDMXV3K"))
                .thenReturn(Optional.of(voucher(new java.math.BigDecimal("40.00"), CreditVoucherStatus.PARTIALLY_REDEEMED)));

        PosResolveResponse res = service.resolve("EG56RKDMXV3K");

        assertEquals(PosResolveResponse.Type.VOUCHER, res.getType());
        assertEquals("CV-2026-000007", res.getVoucher().voucherNumber);
    }

    @Test
    void cancelledVoucherStillResolvesAsAVoucherCarryingItsReason() {
        // Returning NONE here would make the till say "no product found" about a voucher the
        // customer is holding. The cashier needs the real reason.
        stubNoProductMatch("EG56-RKDM-XV3K");
        CreditVoucher cancelled = voucher(new java.math.BigDecimal("100.00"), CreditVoucherStatus.CANCELLED);
        when(creditVoucherRepository.findByCodeOrBarcode("EG56-RKDM-XV3K")).thenReturn(Optional.of(cancelled));

        PosResolveResponse res = service.resolve("EG56-RKDM-XV3K");

        assertEquals(PosResolveResponse.Type.VOUCHER, res.getType());
        org.junit.jupiter.api.Assertions.assertFalse(res.getVoucher().redeemable);
        org.junit.jupiter.api.Assertions.assertNotNull(res.getVoucher().notRedeemableReason);
    }

    @Test
    void productBarcodeIsNeverShadowedByTheVoucherLookup() {
        ProductAggregateResponse product = new ProductAggregateResponse();
        when(productService.searchProductsByBarcode("6009876543210")).thenReturn(List.of(product));

        PosResolveResponse res = service.resolve("6009876543210");

        assertEquals(PosResolveResponse.Type.PRODUCT, res.getType());
        verify(creditVoucherRepository, never())
                .findByCodeOrBarcode(org.mockito.ArgumentMatchers.anyString());
    }

    /** Every product path misses, so resolution reaches the voucher lookup. */
    private void stubNoProductMatch(String q) {
        when(productService.searchProductsByBarcode(q)).thenReturn(List.of());
        when(batchMasterRepository.findFirstByBatchNumberIgnoreCase(q)).thenReturn(Optional.empty());
        when(serialMasterRepository.findFirstBySerialNumberIgnoreCase(q)).thenReturn(Optional.empty());
        when(productService.resolveActiveByCodeOrSku(q)).thenReturn(Optional.empty());
    }

    private CreditVoucher voucher(java.math.BigDecimal remaining, CreditVoucherStatus status) {
        CreditVoucher v = new CreditVoucher();
        v.setVoucherNumber("CV-2026-000007");
        v.setVoucherCode("EG56-RKDM-XV3K");
        v.setBarcodeValue("EG56RKDMXV3K");
        v.setOriginalAmount(new java.math.BigDecimal("100.00"));
        v.setUsedAmount(new java.math.BigDecimal("100.00").subtract(remaining));
        v.setRemainingAmount(remaining);
        v.setIssueDate(java.time.LocalDate.now().minusDays(1));
        v.setExpiryDate(java.time.LocalDate.now().plusYears(1));
        v.setStatus(status);
        return v;
    }
}
