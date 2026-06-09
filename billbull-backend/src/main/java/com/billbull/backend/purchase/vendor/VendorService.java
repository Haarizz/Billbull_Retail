package com.billbull.backend.purchase.vendor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.settings.branch.BranchRepository;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class VendorService {

    private final VendorRepository repo;
    private final com.billbull.backend.purchase.lpo.LpoRepository lpoRepo;
    private final com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo;
    private final com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo;
    private final BranchRepository branchRepo;

    public VendorService(VendorRepository repo,
            com.billbull.backend.purchase.lpo.LpoRepository lpoRepo,
            com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo,
            com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo,
            BranchRepository branchRepo) {
        this.repo = repo;
        this.lpoRepo = lpoRepo;
        this.invRepo = invRepo;
        this.payRepo = payRepo;
        this.branchRepo = branchRepo;
    }

    // -------------------------
    // CREATE
    // -------------------------
    public Vendor create(VendorRequest req, boolean isDraft) {
        Vendor v = new Vendor();
        map(req, v);
        mapBranchAllocations(req, v);
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
        mapBranchAllocations(req, v);
        return repo.save(v);
    }

    // -------------------------
    // LIST
    // -------------------------
    public List<VendorListResponse> list() {
        return list(null);
    }

    public List<VendorListResponse> list(String branchName) {
        // Batch the two balance aggregates into one grouped query each (keyed by
        // vendor name) instead of running them per-vendor — turns N×2 queries into
        // 2 total, which is the difference between ~12s and instant at 300 vendors.
        // Invoice outstanding: grandTotal of POSTED, unpaid/partial invoices per vendor name.
        java.util.Map<String, BigDecimal> invoiceOutstandingByName = toAmountMap(invRepo.sumOutstandingByVendorName());
        // On-account payments (not linked to any invoice — settle opening balance).
        java.util.Map<String, BigDecimal> onAccountByName = toAmountMap(payRepo.sumOnAccountPaidGroupedByVendorName());

        List<VendorListResponse> result = repo.findByIsActiveTrue()
                .stream()
                .map(v -> {
                    BigDecimal openingBal  = v.getOpeningBalance() != null ? v.getOpeningBalance() : BigDecimal.ZERO;

                    // Opening balance still owed after netting off on-account payments.
                    BigDecimal onAccountPaid = onAccountByName.getOrDefault(v.getName(), BigDecimal.ZERO);
                    BigDecimal openingOutstanding = openingBal.subtract(onAccountPaid).max(BigDecimal.ZERO);

                    // Payable = unpaid/partial invoice outstanding + remaining opening balance.
                    BigDecimal invOutstanding = invoiceOutstandingByName.getOrDefault(v.getName(), BigDecimal.ZERO);
                    BigDecimal payableBalance = invOutstanding.add(openingOutstanding);

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
                    r.setOpeningBalanceOutstanding(openingOutstanding);
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
                    // BBQA52-023: branch allocation fields
                    v.getBranchAllocations().size(); // force lazy init
                    String defaultBranchName = v.getBranchAllocations().stream()
                            .filter(VendorBranchAllocation::isDefault)
                            .findFirst()
                            .map(a -> a.getBranch().getName())
                            .orElse(v.getBranch() != null ? v.getBranch().getName() : null);
                    List<String> allocBranches = v.getBranchAllocations().stream()
                            .map(a -> a.getBranch().getName())
                            .collect(Collectors.toList());
                    r.setBranch(defaultBranchName);
                    r.setAllocatedBranches(allocBranches);
                    return r;
                })
                .collect(Collectors.toList());

        // BBQA52-024: filter by branch if requested; unallocated vendors visible everywhere
        if (branchName != null && !branchName.isBlank()) {
            final String branch = branchName.trim();
            return result.stream()
                    .filter(r -> {
                        List<String> alloc = r.getAllocatedBranches();
                        if (alloc == null || alloc.isEmpty()) return true;
                        return alloc.stream().anyMatch(b -> branch.equalsIgnoreCase(b));
                    })
                    .collect(Collectors.toList());
        }
        return result;
    }

    /** Collapse grouped {@code [vendorName, sum]} rows into a name→amount map. */
    private java.util.Map<String, BigDecimal> toAmountMap(List<Object[]> rows) {
        java.util.Map<String, BigDecimal> map = new java.util.HashMap<>();
        if (rows == null) return map;
        for (Object[] row : rows) {
            if (row[0] == null) continue;
            BigDecimal amount = row[1] != null ? new BigDecimal(row[1].toString()) : BigDecimal.ZERO;
            map.merge((String) row[0], amount, BigDecimal::add);
        }
        return map;
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

    private void mapBranchAllocations(VendorRequest req, Vendor v) {
        if (req.getBranch() == null && req.getAllocatedBranches() == null) return;
        v.getBranchAllocations().size(); // force-init before clear
        v.getBranchAllocations().clear();
        Set<String> names = new LinkedHashSet<>();
        if (req.getBranch() != null && !req.getBranch().isBlank()) names.add(req.getBranch());
        if (req.getAllocatedBranches() != null) names.addAll(req.getAllocatedBranches());
        final String defaultName = req.getBranch();
        for (String name : names) {
            branchRepo.findByNameIgnoreCase(name).ifPresent(b -> {
                VendorBranchAllocation alloc = new VendorBranchAllocation();
                alloc.setVendor(v);
                alloc.setBranch(b);
                alloc.setDefault(name.equals(defaultName));
                v.getBranchAllocations().add(alloc);
                if (name.equals(defaultName)) {
                    v.setBranch(b);
                }
            });
        }
    }

    private String generateCode() {
        return "VEN-" + System.currentTimeMillis();
    }
}
