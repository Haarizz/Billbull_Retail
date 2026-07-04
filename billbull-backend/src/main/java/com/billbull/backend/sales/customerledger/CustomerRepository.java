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
