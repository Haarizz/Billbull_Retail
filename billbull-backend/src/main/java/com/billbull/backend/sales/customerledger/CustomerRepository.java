package com.billbull.backend.sales.customerledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
    List<Customer> findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(String name, String code);
    boolean existsByCode(String code);
    java.util.Optional<Customer> findByCode(String code);

    /**
     * Exact (case-insensitive) name lookup — used as a last-resort fallback when an
     * invoice's customerCode is blank but its customerName isn't, so the printed
     * receipt's CUSTOMER block can still resolve TRN/phone/email/address instead of
     * silently omitting them (see InvoiceCustomerContactService). Returns every exact
     * match; the caller only uses the result when exactly one customer shares that
     * name, to avoid attaching the wrong customer's details when names collide.
     */
    List<Customer> findByNameIgnoreCase(String name);

    /**
     * Global-search customer typeahead, branch-scoped in the database.
     *
     * <p>{@code allBranches = true} applies no branch predicate. Otherwise a customer is
     * in scope when its {@code branchEntity} is in {@code branchIds}, when any of its
     * branch allocations is, or when it has no branch attribution at all — matching
     * {@code getAllCustomers(branchName)}, where unallocated customers are visible
     * everywhere. The allocation clause matters for the same reason it does for vendors:
     * the FK is only the default branch. The scope comes from
     * {@code BranchAccessService.currentSearchScope()}; this query never tests a role.
     *
     * <p>The match clause is parenthesised so the branch predicate ANDs with the whole
     * OR chain rather than binding to its last term.
     */
    @org.springframework.data.jpa.repository.Query("SELECT c FROM Customer c WHERE (" +
        "LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "LOWER(c.code) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "c.mobile LIKE CONCAT('%', :q, '%') OR " +
        "LOWER(c.email) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "c.trn LIKE CONCAT('%', :q, '%')) AND (" +
        ":allBranches = TRUE OR c.branchEntity IS NULL OR c.branchEntity.id IN :branchIds OR " +
        "EXISTS (SELECT 1 FROM CustomerBranchAllocation a " +
        "        WHERE a.customer = c AND a.branch.id IN :branchIds))")
    List<Customer> searchAllFields(@org.springframework.data.repository.query.Param("q") String q,
        @org.springframework.data.repository.query.Param("allBranches") boolean allBranches,
        @org.springframework.data.repository.query.Param("branchIds") java.util.Collection<Long> branchIds);

    /**
     * The customers behind a set of codes, for the global search modal's activity-ranked
     * preview.
     *
     * <p>The ranking that produced the codes runs unscoped over the sales-invoice table,
     * so this is where the same branch predicate the search uses is reapplied: a ranked
     * customer the caller may not see simply does not come back. No ordering is promised
     * — the caller holds the rank and re-imposes it.
     */
    @org.springframework.data.jpa.repository.Query("SELECT c FROM Customer c WHERE c.code IN :codes AND (" +
        ":allBranches = TRUE OR c.branchEntity IS NULL OR c.branchEntity.id IN :branchIds OR " +
        "EXISTS (SELECT 1 FROM CustomerBranchAllocation a " +
        "        WHERE a.customer = c AND a.branch.id IN :branchIds))")
    List<Customer> findByCodesInScope(
        @org.springframework.data.repository.query.Param("codes") java.util.Collection<String> codes,
        @org.springframework.data.repository.query.Param("allBranches") boolean allBranches,
        @org.springframework.data.repository.query.Param("branchIds") java.util.Collection<Long> branchIds);

    /**
     * The first few customers, for the global search modal's empty-query preview.
     *
     * <p>The same branch predicate as {@link #searchAllFields}, with the match clause
     * dropped rather than matched against an empty string, plus a deterministic order and
     * — unlike the search, which caps rows in Java — a database-applied {@code Pageable}
     * cap. Without that cap an empty query here would be a full customer-table read.
     */
    @org.springframework.data.jpa.repository.Query("SELECT c FROM Customer c WHERE (" +
        ":allBranches = TRUE OR c.branchEntity IS NULL OR c.branchEntity.id IN :branchIds OR " +
        "EXISTS (SELECT 1 FROM CustomerBranchAllocation a " +
        "        WHERE a.customer = c AND a.branch.id IN :branchIds)) " +
        "ORDER BY c.name ASC, c.id ASC")
    List<Customer> previewCustomers(
        @org.springframework.data.repository.query.Param("allBranches") boolean allBranches,
        @org.springframework.data.repository.query.Param("branchIds") java.util.Collection<Long> branchIds,
        org.springframework.data.domain.Pageable pageable);

    /**
     * Lightweight typeahead projection (code, name, mobile) for the Sales Reports
     * "Customer / Item" filter. Returns columns rather than entities so a keystroke
     * never hydrates full Customer rows (encrypted columns, address collections).
     */
    @org.springframework.data.jpa.repository.Query("SELECT c.code, c.name, c.mobile FROM Customer c " +
        "WHERE (" +
        "LOWER(c.code) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "c.mobile LIKE CONCAT('%', :q, '%')) " +
        "ORDER BY c.name ASC")
    List<Object[]> findReportFilterSuggestions(@org.springframework.data.repository.query.Param("q") String q,
                                               org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT c FROM Customer c WHERE " +
        "(:name <> '' AND LOWER(c.name) = LOWER(:name)) OR " +
        "(:mobile <> '' AND c.mobile = :mobile) OR " +
        "(:email <> '' AND LOWER(c.email) = LOWER(:email)) OR " +
        "(:trn <> '' AND c.trn = :trn)")
    List<Customer> findPotentialDuplicates(@org.springframework.data.repository.query.Param("name") String name,
                                           @org.springframework.data.repository.query.Param("mobile") String mobile,
                                           @org.springframework.data.repository.query.Param("email") String email,
                                           @org.springframework.data.repository.query.Param("trn") String trn);


    /**
     * Exact (case-insensitive) lookup used by the POS unified search resolver.
     * The same query value is matched against code, mobile, phone and email so a
     * single scanned/typed identifier resolves to a customer (membership/loyalty
     * number maps to {@code code} — there is no dedicated loyalty column).
     */
    java.util.Optional<Customer> findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
            String code, String mobile, String phone, String email);

    @org.springframework.data.jpa.repository.Query("SELECT c.code FROM Customer c WHERE c.code LIKE CONCAT(:prefix, '%')")
    List<String> findCodesByPrefix(@org.springframework.data.repository.query.Param("prefix") String prefix);

    boolean existsByMobile(String mobile);
    boolean existsByMobileAndIdNot(String mobile, Long id);

    /**
     * Bulk-load every customer with its {@code savedAddresses} batch-initialised
     * (see {@code @BatchSize(50)} on {@link Customer#getSavedAddresses()}), eliminating the
     * per-customer lazy-init N+1 in {@link CustomerService#getAllCustomers} (ARCHFIX §4.2).
     * Deliberately NOT a {@code DISTINCT ... LEFT JOIN FETCH}: {@link Customer#avatar} is a
     * {@code @Lob} column, and combining DISTINCT + a collection JOIN FETCH with a LOB column
     * in the same result set causes Hibernate/Postgres to throw "Unable to access lob stream"
     * for any customer whose avatar is populated. Plain findAll() + @BatchSize keeps the same
     * query-count profile without touching the LOB stream mid dedup.
     */
    default List<Customer> findAllWithSavedAddresses() {
        List<Customer> customers = findAll();
        customers.forEach(c -> c.getSavedAddresses().size());
        return customers;
    }

    /**
     * Bulk-load every customer with its {@code branchAllocations} (and each allocation's branch)
     * batch-initialised — used only when filtering by branch (ARCHFIX §4.2). See
     * {@link #findAllWithSavedAddresses()} for why this avoids DISTINCT + JOIN FETCH.
     */
    default List<Customer> findAllWithBranchAllocations() {
        List<Customer> customers = findAll();
        customers.forEach(c -> {
            c.getBranchAllocations().forEach(a -> {
                if (a.getBranch() != null) {
                    a.getBranch().getName();
                }
            });
        });
        return customers;
    }
}
