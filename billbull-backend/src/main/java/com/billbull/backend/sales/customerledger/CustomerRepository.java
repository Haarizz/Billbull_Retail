package com.billbull.backend.sales.customerledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
    List<Customer> findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(String name, String code);
    boolean existsByCode(String code);
    java.util.Optional<Customer> findByCode(String code);

    @org.springframework.data.jpa.repository.Query("SELECT c FROM Customer c WHERE " +
        "LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "LOWER(c.code) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "c.mobile LIKE CONCAT('%', :q, '%') OR " +
        "LOWER(c.email) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
        "c.trn LIKE CONCAT('%', :q, '%')")
    List<Customer> searchAllFields(@org.springframework.data.repository.query.Param("q") String q);

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
     * Bulk-load every customer with its {@code savedAddresses} eagerly fetched in a single
     * query, eliminating the per-customer lazy-init N+1 in {@link CustomerService#getAllCustomers}
     * (ARCHFIX §4.2). DISTINCT collapses the join's row duplication. Only ONE collection is
     * fetched here on purpose — fetching savedAddresses and branchAllocations together would
     * produce a Cartesian product; the branch path uses {@link #findAllWithBranchAllocations()}.
     */
    @org.springframework.data.jpa.repository.Query(
            "SELECT DISTINCT c FROM Customer c LEFT JOIN FETCH c.savedAddresses")
    List<Customer> findAllWithSavedAddresses();

    /**
     * Bulk-load every customer with its {@code branchAllocations} (and each allocation's branch)
     * eagerly fetched in a single query — used only when filtering by branch (ARCHFIX §4.2).
     */
    @org.springframework.data.jpa.repository.Query(
            "SELECT DISTINCT c FROM Customer c LEFT JOIN FETCH c.branchAllocations a LEFT JOIN FETCH a.branch")
    List<Customer> findAllWithBranchAllocations();
}
