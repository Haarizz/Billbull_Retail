package com.billbull.backend.pos.settings;

import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PosSettingsService {

    private final PosSettingsRepository repo;
    private final BranchAccessService branchAccessService;

    public PosSettingsService(PosSettingsRepository repo, BranchAccessService branchAccessService) {
        this.repo = repo;
        this.branchAccessService = branchAccessService;
    }

    @Transactional(readOnly = true)
    public PosSettings getForCurrentBranch() {
        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId == null) return defaultSettings();
        return repo.findByBranchId(branchId).orElseGet(() -> {
            PosSettings s = defaultSettings();
            s.setBranchId(branchId);
            return s;
        });
    }

    @Transactional(readOnly = true)
    public PosSettings getForBranch(Long branchId) {
        return repo.findByBranchId(branchId).orElseGet(() -> {
            PosSettings s = defaultSettings();
            s.setBranchId(branchId);
            return s;
        });
    }

    @Transactional
    public PosSettings save(PosSettings settings) {
        if (settings.getBranchId() == null) {
            Long branchId = branchAccessService.getCurrentUserBranchId();
            settings.setBranchId(branchId);
        }
        // Upsert by branchId
        return repo.findByBranchId(settings.getBranchId())
                .map(existing -> {
                    existing.setMaxTerminalsPerBranch(settings.getMaxTerminalsPerBranch());
                    existing.setRequireSupervisorForVoid(settings.getRequireSupervisorForVoid());
                    existing.setSupervisorApprovalMode(settings.getSupervisorApprovalMode());
                    if (settings.getSupervisorPin() != null && !settings.getSupervisorPin().isBlank()) {
                        existing.setSupervisorPin(settings.getSupervisorPin());
                    }
                    existing.setVoidMode(settings.getVoidMode());
                    existing.setCartViewMode(settings.getCartViewMode());
                    existing.setCartShowBarcode(settings.getCartShowBarcode());
                    existing.setCartShowProductCode(settings.getCartShowProductCode());
                    existing.setCartShowBatchNumber(settings.getCartShowBatchNumber());
                    existing.setCartShowSerialNumber(settings.getCartShowSerialNumber());
                    existing.setCartShowExpiryDate(settings.getCartShowExpiryDate());
                    existing.setPriceCheckShowStock(settings.getPriceCheckShowStock());
                    existing.setZReportAccess(settings.getZReportAccess());
                    existing.setCashDrawerTriggers(settings.getCashDrawerTriggers());
                    existing.setReceiptShareEnabled(settings.getReceiptShareEnabled());
                    existing.setReceiptShareWhatsapp(settings.getReceiptShareWhatsapp());
                    existing.setReceiptShareSms(settings.getReceiptShareSms());
                    existing.setReceiptShareEmail(settings.getReceiptShareEmail());
                    existing.setDefaultLayout(settings.getDefaultLayout());
                    existing.setWalkInCustomerCode(settings.getWalkInCustomerCode());
                    existing.setAutoPrintReceipt(settings.getAutoPrintReceipt());
                    existing.setTaxInclusive(settings.getTaxInclusive());
                    existing.setDefaultTaxRate(settings.getDefaultTaxRate());
                    return repo.save(existing);
                })
                .orElseGet(() -> repo.save(settings));
    }

    private PosSettings defaultSettings() {
        return new PosSettings();
    }
}
