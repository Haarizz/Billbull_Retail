package com.billbull.backend.purchase.vendor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@Transactional
public class VendorService {

    private final VendorRepository repo;
    private final com.billbull.backend.purchase.lpo.LpoRepository lpoRepo;
    private final com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo;
    private final com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo;

    public VendorService(VendorRepository repo,
            com.billbull.backend.purchase.lpo.LpoRepository lpoRepo,
            com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo,
            com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo) {
        this.repo = repo;
        this.lpoRepo = lpoRepo;
        this.invRepo = invRepo;
        this.payRepo = payRepo;
    }

    // -------------------------
    // CREATE
    // -------------------------
    public Vendor create(VendorRequest req, boolean isDraft) {
        Vendor v = new Vendor();
        map(req, v);

        v.setCode(generateCode());
        v.setStatus(isDraft ? "Draft" : "Active");

        return repo.save(v);
    }

    // -------------------------
    // UPDATE
    // -------------------------
    public Vendor update(Long id, VendorRequest req) {
        Vendor v = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Vendor not found"));

        map(req, v);
        return repo.save(v);
    }

    // -------------------------
    // LIST
    // -------------------------
    public List<VendorListResponse> list() {
        return repo.findByIsActiveTrue()
                .stream()
                .map(v -> {
                    // Compute payable balance live:
                    // openingBalance + totalInvoiced − totalPaid
                    BigDecimal openingBal  = v.getOpeningBalance() != null ? v.getOpeningBalance() : BigDecimal.ZERO;
                    BigDecimal totalInvoiced = invRepo.sumInvoicedByVendorName(v.getName());
                    if (totalInvoiced == null) totalInvoiced = BigDecimal.ZERO;
                    BigDecimal totalPaid = payRepo.sumPaymentsByVendorName(v.getName());
                    if (totalPaid == null) totalPaid = BigDecimal.ZERO;
                    BigDecimal payableBalance = openingBal.add(totalInvoiced).subtract(totalPaid);

                    VendorListResponse r = new VendorListResponse(
                            v.getId(),
                            v.getCode(),
                            v.getName(),
                            v.getEmail(),
                            v.getCategory(),
                            v.getContact(),
                            v.getLeadTime(),
                            v.getRating(),
                            payableBalance,
                            v.getOpeningBalance(),
                            v.getStatus(),
                            v.getIsPreferred());
                    r.setVendorGroup(v.getVendorGroup());
                    r.setVendorType(v.getVendorType());
                    r.setCountry(v.getCountry());
                    r.setPrefComm(v.getPrefComm());
                    r.setPriority(v.getPriority());
                    r.setCurrency(v.getCurrency());
                    r.setPayTerms(v.getPayTerms());
                    r.setBalType(v.getBalType());
                    r.setPayPref(v.getPayPref());
                    r.setOpeningBalanceDate(v.getOpeningBalanceDate());
                    r.setOpeningBalanceNotes(v.getOpeningBalanceNotes());
                    r.setNickname(v.getNickname());
                    r.setTaxId(v.getTaxId());
                    r.setWebsite(v.getWebsite());
                    r.setAddress(v.getAddress());
                    r.setPrimaryPhone(v.getPrimaryPhone());
                    r.setSecondaryPhone(v.getSecondaryPhone());
                    r.setMobile(v.getMobile());
                    r.setWhatsapp(v.getWhatsapp());
                    r.setSecondaryEmail(v.getSecondaryEmail());
                    r.setCommNotes(v.getCommNotes());
                    r.setCreditLimit(v.getCreditLimit());
                    r.setCreditDays(v.getCreditDays());
                    r.setAutoBlockPo(v.getAutoBlockPo());
                    r.setRequireFinanceApproval(v.getRequireFinanceApproval());
                    r.setBankName(v.getBankName());
                    r.setBankBranch(v.getBankBranch());
                    r.setAccountNumber(v.getAccountNumber());
                    r.setIban(v.getIban());
                    r.setSwiftCode(v.getSwiftCode());
                    r.setBeneficiaryName(v.getBeneficiaryName());
                    return r;
                })
                .toList();
    }

    // -------------------------
    // DELETE (SOFT)
    // -------------------------
    public void delete(Long id) {
        Vendor v = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Vendor not found"));

        // Check LPO usage
        if (lpoRepo.existsByVendorCode(v.getCode())) {
            throw new IllegalStateException("Cannot delete vendor. Used in LPOs. Consider deactivating instead.");
        }

        // Check Invoice usage (by Name as per entity definition)
        if (invRepo.existsByVendorName(v.getName())) {
            throw new IllegalStateException(
                    "Cannot delete vendor. Used in Purchase Invoices. Consider deactivating instead.");
        }

        v.setActive(false);
        repo.save(v);
    }

    // -------------------------
    // MAPPERS
    // -------------------------
    private void map(VendorRequest r, Vendor v) {
        v.setName(r.getName());
        v.setStatus(r.getStatus());
        v.setVendorGroup(r.getVendorGroup());
        v.setVendorType(r.getVendorType());
        v.setCategory(r.getCategory());
        v.setCountry(r.getCountry());
        v.setIsPreferred(r.getIsPreferred());

        v.setEmail(r.getEmail());
        v.setContact(r.getContact());

        v.setPrefComm(r.getPrefComm());
        v.setPriority(r.getPriority());

        v.setCurrency(r.getCurrency());
        v.setPayTerms(r.getPayTerms());
        v.setBalType(r.getBalType());
        v.setPayPref(r.getPayPref());

        v.setOpeningBalance(r.getOpeningBalance());
        v.setOpeningBalanceDate(r.getOpeningBalanceDate());
        v.setOpeningBalanceNotes(r.getOpeningBalanceNotes());
        v.setNickname(r.getNickname());
        v.setTaxId(r.getTaxId());
        v.setWebsite(r.getWebsite());
        v.setAddress(r.getAddress());
        v.setPrimaryPhone(r.getPrimaryPhone());
        v.setSecondaryPhone(r.getSecondaryPhone());
        v.setMobile(r.getMobile());
        v.setWhatsapp(r.getWhatsapp());
        v.setSecondaryEmail(r.getSecondaryEmail());
        v.setCommNotes(r.getCommNotes());
        v.setCreditLimit(r.getCreditLimit());
        v.setCreditDays(r.getCreditDays());
        v.setAutoBlockPo(r.getAutoBlockPo());
        v.setRequireFinanceApproval(r.getRequireFinanceApproval());
        v.setBankName(r.getBankName());
        v.setBankBranch(r.getBankBranch());
        v.setAccountNumber(r.getAccountNumber());
        v.setIban(r.getIban());
        v.setSwiftCode(r.getSwiftCode());
        v.setBeneficiaryName(r.getBeneficiaryName());
    }

    private String generateCode() {
        return "VEN-" + System.currentTimeMillis();
    }
}
