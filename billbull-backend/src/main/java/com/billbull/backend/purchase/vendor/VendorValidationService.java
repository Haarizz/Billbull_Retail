package com.billbull.backend.purchase.vendor;


import org.springframework.stereotype.Service;

import java.util.Set;

@Service
public class VendorValidationService {

    private final VendorRepository vendorRepository;

    // Defines which statuses are not allowed for new purchase transactions
    private static final Set<String> BLOCKED_STATUSES = Set.of(
            "Blocked", 
            "Inactive", 
            "On Hold"
    );

    public VendorValidationService(VendorRepository vendorRepository) {
        this.vendorRepository = vendorRepository;
    }

    /**
     * Validates whether a vendor can be used in purchase transactions.
     * @param vendorId the ID of the vendor to validate
     * @throws ValidationException if the vendor is invalid, missing, or blocked
     */
    public void validateVendorEligibleForPurchasing(Long vendorId) {
        if (vendorId == null) {
            throw new IllegalArgumentException("Vendor ID is required for purchase transactions.");
        }

        Vendor vendor = vendorRepository.findById(vendorId)
                .orElseThrow(() -> new IllegalArgumentException("Vendor not found with ID: " + vendorId));

        if (vendor.getStatus() != null) {
            // Compare ignoring case just to be safe
            for (String blockedStatus : BLOCKED_STATUSES) {
                if (blockedStatus.equalsIgnoreCase(vendor.getStatus().trim())) {
                    throw new IllegalArgumentException("This vendor is blocked and cannot be used for purchase transactions.");
                }
            }
        }
    }
}
