package com.billbull.backend.purchase.vendor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class VendorValidationServiceTest {

    @Mock
    private VendorRepository vendorRepository;

    @InjectMocks
    private VendorValidationService vendorValidationService;

    private Vendor vendor;

    @BeforeEach
    void setUp() {
        vendor = new Vendor();
        vendor.setId(1L);
        vendor.setName("Test Vendor");
    }

    @Test
    void validateVendorEligibleForPurchasing_ActiveVendor_Success() {
        vendor.setStatus("ACTIVE");
        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor));

        assertDoesNotThrow(() -> vendorValidationService.validateVendorEligibleForPurchasing(1L));
    }

    @Test
    void validateVendorEligibleForPurchasing_BlockedVendor_ThrowsException() {
        vendor.setStatus("BLOCKED");
        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor));

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> vendorValidationService.validateVendorEligibleForPurchasing(1L));
        assertEquals("This vendor is blocked and cannot be used for purchase transactions.", exception.getMessage());
    }

    @Test
    void validateVendorEligibleForPurchasing_InactiveVendor_ThrowsException() {
        vendor.setStatus("INACTIVE");
        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor));

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> vendorValidationService.validateVendorEligibleForPurchasing(1L));
        assertEquals("This vendor is blocked and cannot be used for purchase transactions.", exception.getMessage());
    }

    @Test
    void validateVendorEligibleForPurchasing_OnHoldVendor_ThrowsException() {
        vendor.setStatus("ON HOLD");
        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor));

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> vendorValidationService.validateVendorEligibleForPurchasing(1L));
        assertEquals("This vendor is blocked and cannot be used for purchase transactions.", exception.getMessage());
    }

    @Test
    void validateVendorEligibleForPurchasing_NullVendorId_ThrowsException() {
        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> vendorValidationService.validateVendorEligibleForPurchasing(null));
        assertEquals("Vendor ID is required for purchase transactions.", exception.getMessage());
    }

    @Test
    void validateVendorEligibleForPurchasing_InvalidVendorId_ThrowsException() {
        when(vendorRepository.findById(99L)).thenReturn(Optional.empty());

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, 
            () -> vendorValidationService.validateVendorEligibleForPurchasing(99L));
        assertEquals("Vendor not found with ID: 99", exception.getMessage());
    }
}
