package com.billbull.backend.purchase.advance;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
@Slf4j
public class VendorAdvanceService {

    private final VendorAdvanceRepository repo;
    private final PostingEngineService postingEngine;

    public VendorAdvanceService(VendorAdvanceRepository repo, PostingEngineService postingEngine) {
        this.repo          = repo;
        this.postingEngine = postingEngine;
    }

    public List<VendorAdvance> getByVendor(Long vendorId) {
        return repo.findByVendorId(vendorId);
    }

    public List<VendorAdvance> getOpenByVendor(Long vendorId) {
        return repo.findByVendorIdAndStatus(vendorId, "OPEN");
    }

    /**
     * Records payment of a vendor advance.
     * Posts: Dr Vendor Advances Paid (1105) / Cr Bank (1102).
     */
    @Transactional
    public VendorAdvance pay(VendorAdvance advance) {
        if (advance.getPaidDate() == null) advance.setPaidDate(LocalDate.now());
        advance.setStatus("OPEN");
        VendorAdvance saved = repo.save(advance);
        postingEngine.createJournalFromVendorAdvancePay(saved);
        log.info("[VendorAdvance] Paid advance {} for vendor {}", saved.getId(), saved.getVendorName());
        return saved;
    }

    /**
     * Applies an open vendor advance against a purchase invoice.
     * Posts: Dr Accounts Payable (2101) / Cr Vendor Advances Paid (1105).
     */
    @Transactional
    public VendorAdvance applyToInvoice(Long advanceId, String piNumber, BigDecimal amount) {
        VendorAdvance adv = repo.findById(advanceId)
                .orElseThrow(() -> new RuntimeException("Vendor advance not found: " + advanceId));
        if (!"OPEN".equals(adv.getStatus())) {
            throw new IllegalStateException("Vendor advance " + advanceId + " is not OPEN.");
        }
        if (amount.compareTo(adv.getAmount()) > 0) {
            throw new IllegalArgumentException("Apply amount exceeds advance amount.");
        }
        adv.setStatus("APPLIED");
        VendorAdvance saved = repo.save(adv);
        postingEngine.createJournalFromVendorAdvanceApply(saved, piNumber, amount);
        log.info("[VendorAdvance] Applied advance {} to PI {}", advanceId, piNumber);
        return saved;
    }

    /**
     * Refunds an unused vendor advance.
     * Posts: Dr Bank (1102) / Cr Vendor Advances Paid (1105).
     */
    @Transactional
    public VendorAdvance refund(Long advanceId) {
        VendorAdvance adv = repo.findById(advanceId)
                .orElseThrow(() -> new RuntimeException("Vendor advance not found: " + advanceId));
        if (!"OPEN".equals(adv.getStatus())) {
            throw new IllegalStateException("Only OPEN advances can be refunded.");
        }
        adv.setStatus("REFUNDED");
        VendorAdvance saved = repo.save(adv);
        postingEngine.createJournalFromVendorAdvanceRefund(saved);
        log.info("[VendorAdvance] Refunded advance {}", advanceId);
        return saved;
    }
}
