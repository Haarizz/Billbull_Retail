package com.billbull.backend.purchase.invoice;

import com.billbull.backend.purchase.vendor.VendorValidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Optional;

import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.common.ownership.OwnershipAccessService;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class PurchaseInvoiceServiceValidationTest {

    @Mock
    private VendorValidationService vendorValidationService;

    @Mock
    private BranchAccessService branchAccessService;

    @Mock
    private OwnershipAccessService ownershipAccessService;

    @Mock
    private PurchaseInvoiceRepository purchaseInvoiceRepository;

    @InjectMocks
    private PurchaseInvoiceService purchaseInvoiceService;

    @Test
    void createDraft_BlockedVendor_ThrowsExceptionAndNoSideEffects() {
        PurchaseInvoiceRequest req = new PurchaseInvoiceRequest();
        req.setVendorId(1L);

        doThrow(new IllegalArgumentException("This vendor is blocked and cannot be used for purchase transactions."))
            .when(vendorValidationService).validateVendorEligibleForPurchasing(1L);

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> purchaseInvoiceService.createDraft(req));

        assertEquals("This vendor is blocked and cannot be used for purchase transactions.", exception.getMessage());
        verify(purchaseInvoiceRepository, never()).save(any());
    }

    @Test
    void submitForApproval_BlockedVendor_ThrowsExceptionAndNoSideEffects() {
        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setId(10L);
        invoice.setVendorId(2L);

        when(purchaseInvoiceRepository.findById(10L)).thenReturn(Optional.of(invoice));
        
        doThrow(new IllegalArgumentException("This vendor is blocked and cannot be used for purchase transactions."))
            .when(vendorValidationService).validateVendorEligibleForPurchasing(2L);

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> purchaseInvoiceService.submitForApproval(10L, "admin"));

        assertEquals("This vendor is blocked and cannot be used for purchase transactions.", exception.getMessage());
        verify(purchaseInvoiceRepository, never()).save(argThat(i -> i.getStatus() == InvoiceStatus.PENDING_APPROVAL));
    }
}
