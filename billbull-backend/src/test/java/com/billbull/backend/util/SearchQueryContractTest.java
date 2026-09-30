package com.billbull.backend.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.purchase.vendor.VendorRepository;

/**
 * Asserts the JPQL contract of the three typeahead searches introduced for the
 * global search modal.
 *
 * <p>These are Mockito-style unit tests with no database, so the matching itself
 * cannot be executed here. What can be pinned down — and what regressions would
 * actually be silent — is the shape of the query: that matching is
 * case-insensitive, that it covers the intended identification columns, that it
 * has a deterministic sort, and that sensitive columns were never wired into a
 * search predicate.
 */
class SearchQueryContractTest {

    private static String queryOf(Class<?> repository, String method) {
        for (Method m : repository.getDeclaredMethods()) {
            if (!m.getName().equals(method)) continue;
            Query query = m.getAnnotation(Query.class);
            if (query != null) return query.value().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        }
        throw new AssertionError("No @Query found on " + repository.getSimpleName() + "#" + method);
    }

    // ── Vendor ───────────────────────────────────────────────────────────────

    @Test
    void vendorSearchIsCaseInsensitiveOverItsIdentificationColumns() {
        String jpql = queryOf(VendorRepository.class, "searchVendors");

        assertThat(jpql).contains("lower(v.name) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(v.code) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(v.email) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(v.contact) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("v.mobile like");
        assertThat(jpql).contains("v.primaryphone like");
    }

    @Test
    void vendorSearchIsLimitedToActiveVendorsAndSortsDeterministically() {
        String jpql = queryOf(VendorRepository.class, "searchVendors");

        assertThat(jpql).contains("v.isactive = true");
        assertThat(jpql).contains("order by v.name asc, v.code asc");
    }

    @Test
    void vendorSearchNeitherMatchesNorReturnsBankDetails() {
        String jpql = queryOf(VendorRepository.class, "searchVendors");

        assertThat(jpql).doesNotContain("iban");
        assertThat(jpql).doesNotContain("swiftcode");
        assertThat(jpql).doesNotContain("accountnumber");
        assertThat(jpql).doesNotContain("bankname");
        assertThat(jpql).doesNotContain("creditlimit");
    }

    // ── Ledger ───────────────────────────────────────────────────────────────

    @Test
    void accountSearchIsCaseInsensitiveOverCodeAndName() {
        String jpql = queryOf(AccountRepository.class, "searchAccounts");

        assertThat(jpql).contains("lower(a.code) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(a.name) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("order by a.code asc");
    }

    @Test
    void accountSearchDoesNotComputeBalances() {
        String jpql = queryOf(AccountRepository.class, "searchAccounts");

        assertThat(jpql).doesNotContain("balanceamount");
        assertThat(jpql).doesNotContain("sum(");
    }

    // ── Employee ─────────────────────────────────────────────────────────────

    @Test
    void employeeSearchIsCaseInsensitiveOverItsIdentificationColumns() {
        String jpql = queryOf(EmployeeRepository.class, "searchEmployees");

        assertThat(jpql).contains("lower(e.employeecode) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(e.firstname) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(e.lastname) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(e.role) like lower(concat('%', :q, '%'))");
        assertThat(jpql).contains("lower(e.department) like lower(concat('%', :q, '%'))");
    }

    @Test
    void employeeSearchMatchesAFullNameTypedInOneGo() {
        assertThat(queryOf(EmployeeRepository.class, "searchEmployees"))
                .contains("lower(concat(e.firstname, ' ', e.lastname)) like lower(concat('%', :q, '%'))");
    }

    @Test
    void employeeSearchSortsDeterministically() {
        assertThat(queryOf(EmployeeRepository.class, "searchEmployees"))
                .contains("order by e.firstname asc, e.lastname asc, e.employeecode asc");
    }

    /**
     * Contact details and documents must not be searchable: the endpoint would
     * otherwise double as a probe for an employee's private data ("does anyone
     * here have this phone number?").
     */
    @Test
    void employeeSearchNeitherMatchesNorReturnsContactOrDocumentData() {
        String jpql = queryOf(EmployeeRepository.class, "searchEmployees");

        assertThat(jpql).doesNotContain("e.phone");
        assertThat(jpql).doesNotContain("e.email");
        assertThat(jpql).doesNotContain("passport");
        assertThat(jpql).doesNotContain("emiratesid");
        assertThat(jpql).doesNotContain("visa");
        assertThat(jpql).doesNotContain("salary");
        assertThat(jpql).doesNotContain("pospin");
    }

    // ── Shared size contract ─────────────────────────────────────────────────

    @Test
    void searchLimitClampsIntoItsDocumentedRange() {
        assertThat(SearchLimit.clamp(0)).isEqualTo(SearchLimit.DEFAULT_SIZE);
        assertThat(SearchLimit.clamp(-1)).isEqualTo(SearchLimit.DEFAULT_SIZE);
        assertThat(SearchLimit.clamp(3)).isEqualTo(3);
        assertThat(SearchLimit.clamp(SearchLimit.MAX_SIZE)).isEqualTo(SearchLimit.MAX_SIZE);
        assertThat(SearchLimit.clamp(Integer.MAX_VALUE)).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void searchLimitAlwaysBuildsAFirstPageRequest() {
        assertThat(SearchLimit.page(7).getPageNumber()).isZero();
        assertThat(SearchLimit.page(7).getPageSize()).isEqualTo(7);
        assertThat(SearchLimit.page(1_000).getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    // ── Empty-query preview ──────────────────────────────────────────

    /**
     * The preview queries back the modal's empty-query suggestion list. They are the
     * riskiest thing added to search, because a preview is by definition a query with
     * nothing to match on: what keeps it from being a table read is the {@code Pageable}
     * every one of them takes, and what keeps it from leaking is that each reuses its
     * search's own projection and branch predicate. That is what these pin down.
     */
    private static java.lang.reflect.Method methodOf(Class<?> repository, String name) {
        for (Method m : repository.getDeclaredMethods()) {
            if (m.getName().equals(name)) return m;
        }
        throw new AssertionError("No " + name + " on " + repository.getSimpleName());
    }

    @Test
    void everyPreviewQueryTakesAPageableSoItCanNeverReadAWholeTable() {
        Object[][] previews = {
            { VendorRepository.class, "previewVendors" },
            { EmployeeRepository.class, "previewEmployees" },
            { AccountRepository.class, "previewAccounts" },
            { com.billbull.backend.sales.customerledger.CustomerRepository.class, "previewCustomers" },
        };

        for (Object[] preview : previews) {
            Method method = methodOf((Class<?>) preview[0], (String) preview[1]);
            assertThat(method.getParameterTypes())
                    .as("%s must be row-capped in the database", preview[1])
                    .contains(org.springframework.data.domain.Pageable.class);
        }
    }

    @Test
    void everyPreviewQueryOrdersDeterministically() {
        assertThat(queryOf(VendorRepository.class, "previewVendors"))
                .contains("order by v.name asc, v.code asc");
        assertThat(queryOf(EmployeeRepository.class, "previewEmployees"))
                .contains("order by e.firstname asc, e.lastname asc, e.employeecode asc");
        assertThat(queryOf(AccountRepository.class, "previewAccounts"))
                .contains("order by a.code asc");
        assertThat(queryOf(com.billbull.backend.sales.customerledger.CustomerRepository.class, "previewCustomers"))
                .contains("order by c.name asc, c.id asc");
    }

    @Test
    void everyBranchScopedPreviewKeepsItsSearchBranchPredicate() {
        // The account preview is deliberately absent: the chart of accounts is a
        // company-wide master and its search is not branch-scoped either.
        assertThat(queryOf(VendorRepository.class, "previewVendors"))
                .contains(":allbranches = true");
        assertThat(queryOf(EmployeeRepository.class, "previewEmployees"))
                .contains(":allbranches = true");
        assertThat(queryOf(com.billbull.backend.sales.customerledger.CustomerRepository.class, "previewCustomers"))
                .contains(":allbranches = true");
    }

    @Test
    void thePreviewQueriesMatchNothingRatherThanMatchingAnEmptyString() {
        // A LIKE '%%' chain would quietly drop every row whose name happens to be null,
        // so the previews drop the match clause instead of feeding it an empty term.
        for (String jpql : new String[] {
                queryOf(VendorRepository.class, "previewVendors"),
                queryOf(EmployeeRepository.class, "previewEmployees"),
                queryOf(AccountRepository.class, "previewAccounts"),
                queryOf(com.billbull.backend.sales.customerledger.CustomerRepository.class, "previewCustomers") }) {
            assertThat(jpql).doesNotContain(":q");
            assertThat(jpql).doesNotContain(":search");
        }
    }

    @Test
    void thePreviewProjectionsAreTheSameLightweightRowsTheSearchReturns() {
        assertThat(queryOf(VendorRepository.class, "previewVendors"))
                .contains("new com.billbull.backend.purchase.vendor.vendorsearchresponse");
        assertThat(queryOf(EmployeeRepository.class, "previewEmployees"))
                .contains("new com.billbull.backend.hr.employees.employeesearchresponse");
        assertThat(queryOf(AccountRepository.class, "previewAccounts"))
                .contains("new com.billbull.backend.financials.chartofaccounts.accountsearchresponse");
    }

    @Test
    void theVendorPreviewLeaksNoBankDetailsAndStaysActiveOnly() {
        String jpql = queryOf(VendorRepository.class, "previewVendors");

        assertThat(jpql).contains("v.isactive = true");
        assertThat(jpql).doesNotContain("bank");
        assertThat(jpql).doesNotContain("iban");
    }

    @Test
    void theEmployeePreviewCarriesNoPayrollColumn() {
        String jpql = queryOf(EmployeeRepository.class, "previewEmployees");

        for (String column : new String[] { "salary", "basic", "allowance", "bank", "passport", "visa" }) {
            assertThat(jpql).doesNotContain(column);
        }
    }

}
