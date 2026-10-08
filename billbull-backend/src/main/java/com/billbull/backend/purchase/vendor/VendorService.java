package com.billbull.backend.purchase.vendor;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
    private final com.billbull.backend.settings.branch.BranchAccessService branchAccessService;

    @PersistenceContext
    private EntityManager em;

    public VendorService(VendorRepository repo,
            com.billbull.backend.purchase.lpo.LpoRepository lpoRepo,
            com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo,
            com.billbull.backend.purchase.payment.PaymentVoucherRepository payRepo,
            BranchRepository branchRepo,
            com.billbull.backend.settings.branch.BranchAccessService branchAccessService) {
        this.repo = repo;
        this.lpoRepo = lpoRepo;
        this.invRepo = invRepo;
        this.payRepo = payRepo;
        this.branchRepo = branchRepo;
        this.branchAccessService = branchAccessService;
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
    // SEARCH (typeahead / global search)
    // -------------------------

    /**
     * Server-side vendor typeahead. Blank queries return nothing rather than the
     * whole table — same guard as {@code CustomerService.search}.
     *
     * <p>Branch-scoped in the database, not in the caller. A user who cannot reach
     * every branch sees only vendors attached to a branch they can reach, plus vendors
     * with no branch attribution at all. Users who can reach every branch keep seeing
     * every vendor, with the branch on each row — the Branch Selector does not narrow
     * search (see {@code BranchAccessService.currentSearchScope()}).
     */
    @Transactional(readOnly = true)
    public List<VendorSearchResponse> search(String q, int size) {
        if (q == null || q.isBlank()) return List.of();
        com.billbull.backend.settings.branch.BranchAccessService.ListScope scope =
                branchAccessService.currentSearchScope();
        return repo.searchVendors(q.trim(), scope.allBranches(), scope.branchIds(),
                com.billbull.backend.util.SearchLimit.page(size));
    }

    /**
     * The first few vendors, for the global search modal's empty-query preview.
     *
     * <p>The rows are the vendors <em>most purchased from</em> — posted purchase invoices,
     * those in the last {@link com.billbull.backend.util.PreviewActivity#WINDOW_DAYS} days
     * first, then all-time volume — followed by vendors with recent LPOs, not the first
     * few alphabetically. Name order tops the list up when activity does not fill it, so
     * a new tenant still shows something rather than nothing.
     *
     * <p>Branch-scoped exactly as {@link #search} is — the ranking itself runs unscoped
     * over the invoice and LPO tables and is re-read through the scoped query, so a ranked vendor the
     * caller may not see is dropped rather than revealed — and bounded in the database
     * throughout.
     */
    public List<VendorSearchResponse> preview(int size) {
        int limit = com.billbull.backend.util.SearchLimit.clamp(size);
        com.billbull.backend.settings.branch.BranchAccessService.ListScope scope =
                branchAccessService.currentSearchScope();

        // Posted purchase invoices decide the head of the list — they are what was
        // actually bought. Recent LPOs come next, for vendors only ordered from so far.
        java.util.LinkedHashSet<Long> rankedIds = new java.util.LinkedHashSet<>(
                invRepo.findMostPurchasedVendorIds(
                        com.billbull.backend.util.PreviewActivity.since().toLocalDate(),
                        com.billbull.backend.util.PreviewActivity.ranking(limit)));
        rankedIds.addAll(lpoRepo.findMostActiveVendorIds(
                com.billbull.backend.util.PreviewActivity.since(),
                com.billbull.backend.util.PreviewActivity.ranking(limit)));
        List<Long> ranked = new java.util.ArrayList<>(rankedIds);

        java.util.LinkedHashMap<Long, VendorSearchResponse> picked = new java.util.LinkedHashMap<>();
        if (!ranked.isEmpty()) {
            java.util.Map<Long, VendorSearchResponse> byId = repo
                    .findByIdsInScope(ranked, scope.allBranches(), scope.branchIds())
                    .stream()
                    .collect(java.util.stream.Collectors.toMap(VendorSearchResponse::getId, v -> v, (a, b) -> a));
            // The IN query returns whatever order the database likes, so the rank is
            // re-imposed here from the ordered id list rather than trusted from the rows.
            for (Long id : ranked) {
                VendorSearchResponse v = byId.get(id);
                if (v != null && picked.size() < limit) picked.put(id, v);
            }
        }

        if (picked.size() < limit) {
            for (VendorSearchResponse v : repo.previewVendors(scope.allBranches(), scope.branchIds(),
                    com.billbull.backend.util.SearchLimit.page(limit))) {
                if (picked.size() >= limit) break;
                picked.putIfAbsent(v.getId(), v);
            }
        }

        return new java.util.ArrayList<>(picked.values());
    }

    // -------------------------
    // LIST
    // -------------------------
    public List<VendorListResponse> list() {
        return list(null);
    }

    public List<VendorListResponse> list(String branchName) {
        // Batch the balance aggregates into grouped queries (keyed by vendor name).
        // grandTotal of POSTED, unpaid/partial invoices per vendor name.
        java.util.Map<String, BigDecimal> invoiceOutstandingByName = toAmountMap(invRepo.sumOutstandingByVendorName());
        // POSTED/CLEARED payments already applied to specific invoices — reduces the gross invoice total.
        java.util.Map<String, BigDecimal> invoiceLinkedPaidByName = toAmountMap(payRepo.sumInvoiceLinkedPaymentsGroupedByVendorName());
        // On-account payments (not linked to any invoice — settle opening balance).
        java.util.Map<String, BigDecimal> onAccountByName = toAmountMap(payRepo.sumOnAccountPaidGroupedByVendorName());

        List<VendorListResponse> result = repo.findByIsActiveTrue()
                .stream()
                .map(v -> {
                    BigDecimal openingBal  = v.getOpeningBalance() != null ? v.getOpeningBalance() : BigDecimal.ZERO;

                    // Opening balance still owed after netting off on-account payments.
                    BigDecimal onAccountPaid = onAccountByName.getOrDefault(v.getName(), BigDecimal.ZERO);
                    BigDecimal openingOutstanding = openingBal.subtract(onAccountPaid).max(BigDecimal.ZERO);

                    // Payable = (gross invoice total − payments already applied) + remaining opening balance.
                    BigDecimal invGross = invoiceOutstandingByName.getOrDefault(v.getName(), BigDecimal.ZERO);
                    BigDecimal invPaid  = invoiceLinkedPaidByName.getOrDefault(v.getName(), BigDecimal.ZERO);
                    BigDecimal invOutstanding = invGross.subtract(invPaid).max(BigDecimal.ZERO);
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

    // -------------------------
    // SUMMARY (global search details panel)
    // -------------------------

    /**
     * Payables snapshot for one vendor, using the same accounting as {@link #list(String)}
     * but resolved for a single row — none of the grouped all-vendor queries are touched.
     *
     * <p><b>Name-keying.</b> The vendor record is id-based, but this module's accounting is
     * keyed by {@code vendorName}: purchase invoices and payment vouchers store the name,
     * not a vendor id. So the id is resolved to the authoritative {@link Vendor} first and
     * that record's <em>current</em> name drives the accounting queries. Two consequences
     * are worth naming rather than hiding:
     *
     * <ul>
     *   <li>A vendor renamed after its invoices were raised will under-report here,
     *       exactly as it already does on the vendor list — this method reproduces the
     *       existing behaviour rather than diverging from it.
     *   <li>Two vendors sharing a name share these figures, for the same reason.
     * </ul>
     *
     * Migrating the accounting to {@code vendorId} would fix both, and is deliberately out
     * of scope here: it changes every existing vendor balance, not just this panel.
     */
    @Transactional(readOnly = true)
    public VendorSummaryResponse getSummary(Long id) {
        Vendor v = repo.findById(id).orElse(null);
        if (v == null) return null;

        String vendorName = v.getName();
        BigDecimal openingBal = v.getOpeningBalance() != null ? v.getOpeningBalance() : BigDecimal.ZERO;

        BigDecimal onAccountPaid = BigDecimal.ZERO;
        BigDecimal invGross = BigDecimal.ZERO;
        BigDecimal invPaid = BigDecimal.ZERO;
        BigDecimal totalPaid = BigDecimal.ZERO;
        long overdueCount = 0L;
        // Every accounting query below is name-keyed; a nameless vendor can be shown but
        // cannot be joined to any of them.
        if (vendorName != null && !vendorName.isBlank()) {
            onAccountPaid = nullToZero(payRepo.sumOnAccountPaidByVendorName(vendorName));
            invGross = nullToZero(invRepo.sumOutstandingForVendorName(vendorName));
            invPaid = nullToZero(payRepo.sumInvoiceLinkedPaymentsByVendorName(vendorName));
            totalPaid = nullToZero(payRepo.sumPaymentsByVendorName(vendorName));
            // "Today" is resolved here rather than in the query so the boundary is
            // explicit and testable, matching the customer side.
            overdueCount = invRepo.countOverdueForVendorName(vendorName, java.time.LocalDate.now());
        }

        BigDecimal openingOutstanding = openingBal.subtract(onAccountPaid).max(BigDecimal.ZERO);
        BigDecimal invOutstanding = invGross.subtract(invPaid).max(BigDecimal.ZERO);

        VendorSummaryResponse r = new VendorSummaryResponse();
        r.setId(v.getId());
        r.setVendorCode(v.getCode());
        r.setVendorName(vendorName);
        r.setStatus(v.getStatus());
        r.setCurrency(v.getCurrency());
        r.setOpeningBalance(v.getOpeningBalance());
        r.setOpeningBalanceOutstanding(openingOutstanding);
        r.setPayableBalance(invOutstanding.add(openingOutstanding));
        r.setTotalPaid(totalPaid);
        r.setOverdueInvoiceCount(overdueCount);

        // Same default-branch resolution as the list: the allocation flagged default,
        // falling back to the legacy single-branch FK.
        v.getBranchAllocations().size();
        r.setBranch(v.getBranchAllocations().stream()
                .filter(VendorBranchAllocation::isDefault)
                .findFirst()
                .map(alloc -> alloc.getBranch().getName())
                .orElse(v.getBranch() != null ? v.getBranch().getName() : null));
        return r;
    }

    private static BigDecimal nullToZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
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
        em.flush(); // push DELETEs to DB before INSERTs to avoid unique-constraint violation
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
