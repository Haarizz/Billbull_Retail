package com.billbull.backend.settings.branch;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Locale;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.repository.Query;

import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.user.UserRepository;

/**
 * Branch behaviour of global search.
 *
 * <p>The approved rule has two halves. A user who cannot reach every branch is confined
 * to the branches they can reach — that is BRANCH_ADMIN among others, because
 * {@code JwtUtil.ALL_BRANCH_ROLES} is ADMIN and SUPER_ADMIN only, so BRANCH_ADMIN's token
 * carries {@code isAllBranches = false}. Everyone else searches across branches, with the
 * branch on each row.
 *
 * <p>The half that is easy to get wrong is the Branch Selector. It narrows list pages for
 * everyone, admins included ({@code currentListScope}), and it must NOT narrow search:
 * someone looking up a record they know exists should not be told it does not, because a
 * selector elsewhere in the UI happens to point at another branch. That is what most of
 * these tests are about.
 */
@ExtendWith(MockitoExtension.class)
class GlobalSearchBranchScopeTest {

    @Mock private UserRepository userRepository;
    @Mock private BranchRepository branchRepository;

    private BranchAccessService service() {
        return new BranchAccessService(userRepository, branchRepository);
    }

    @AfterEach
    void clearContext() {
        BranchContextHolder.clear();
    }

    private void asUser(Long activeBranchId, Set<Long> allowed, boolean isAllBranches) {
        BranchContextHolder.set(
                new BranchContextHolder.BranchContext(activeBranchId, allowed, isAllBranches));
    }

    // -- Who is restricted ----------------------------------------------------

    @Test
    void aUserWhoCannotReachEveryBranchIsConfinedToTheirOwn() {
        // BRANCH_ADMIN's shape: isAllBranches = false, a concrete allowed set.
        asUser(3L, Set.of(3L), false);

        BranchAccessService.ListScope scope = service().currentSearchScope();

        assertThat(scope.allBranches()).isFalse();
        assertThat(scope.branchIds()).containsExactly(3L);
    }

    @Test
    void aMultiBranchRestrictedUserKeepsEveryBranchTheyWereGranted() {
        asUser(3L, Set.of(3L, 8L, 12L), false);

        BranchAccessService.ListScope scope = service().currentSearchScope();

        assertThat(scope.allBranches()).isFalse();
        assertThat(scope.branchIds()).containsExactlyInAnyOrder(3L, 8L, 12L);
    }

    @Test
    void anAllBranchUserIsNotScopedAtAll() {
        asUser(3L, Set.of(), true);

        assertThat(service().currentSearchScope().allBranches()).isTrue();
    }

    // -- The Branch Selector must not narrow search ---------------------------

    @Test
    void theBranchSelectorDoesNotNarrowSearchForAnAllBranchUser() {
        // An admin who has narrowed the selector to branch 9. Their list pages show only
        // branch 9; their search must still find records anywhere.
        asUser(9L, Set.of(), true);

        BranchAccessService svc = service();

        assertThat(svc.currentListScope().allBranches()).isFalse();
        assertThat(svc.currentListScope().branchIds()).containsExactly(9L);
        // Search, by contrast, stays unscoped.
        assertThat(svc.currentSearchScope().allBranches()).isTrue();
    }

    @Test
    void aRestrictedUserSearchesAcrossAllTheirBranchesNotJustTheSelectedOne() {
        // Allowed 3 and 8, selector on 3. The list narrows to 3; search keeps both.
        asUser(3L, Set.of(3L, 8L), false);

        BranchAccessService svc = service();

        assertThat(svc.currentListScope().branchIds()).containsExactly(3L);
        assertThat(svc.currentSearchScope().branchIds()).containsExactlyInAnyOrder(3L, 8L);
    }

    @Test
    void aRestrictedUserNeverLeaksIntoABranchTheyWereNotGranted() {
        asUser(3L, Set.of(3L), false);

        BranchAccessService.ListScope scope = service().currentSearchScope();

        assertThat(scope.allBranches()).isFalse();
        assertThat(scope.branchIds()).doesNotContain(8L, 12L);
    }

    @Test
    void aUserWithNoBranchAtAllGetsASentinelRatherThanAnEmptyInClause() {
        asUser(null, Set.of(), false);

        BranchAccessService.ListScope scope = service().currentSearchScope();

        // An empty IN () is invalid SQL; the sentinel matches nothing instead.
        assertThat(scope.allBranches()).isFalse();
        assertThat(scope.branchIds()).containsExactly(-1L);
    }

    @Test
    void scopingNeverMutatesTheActiveBranch() {
        asUser(3L, Set.of(3L, 8L), false);

        service().currentSearchScope();

        // Reading the scope is a read. Search must never switch the user's branch.
        assertThat(BranchContextHolder.get().activeBranchId()).isEqualTo(3L);
    }

    // -- The predicate is in the query, not in the caller ---------------------

    private static String queryOf(Class<?> repository, String method) {
        for (Method m : repository.getDeclaredMethods()) {
            if (!m.getName().equals(method)) continue;
            Query query = m.getAnnotation(Query.class);
            if (query != null) return query.value().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        }
        throw new AssertionError("No @Query found on " + repository.getSimpleName() + "#" + method);
    }

    @Test
    void vendorSearchFiltersByBranchInTheDatabase() {
        String jpql = queryOf(VendorRepository.class, "searchVendors");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("b.id in :branchids");
        // A vendor's branch FK is only its default, so an allocation to the caller's
        // branch has to count too.
        assertThat(jpql).contains("vendorbranchallocation");
        // Legacy rows with no branch stay visible rather than vanishing from search.
        assertThat(jpql).contains("b.id is null");
    }

    @Test
    void employeeSearchFiltersByBranchInTheDatabase() {
        String jpql = queryOf(EmployeeRepository.class, "searchEmployees");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("e.branchentity.id in :branchids");
        assertThat(jpql).contains("e.branchentity is null");
    }

    @Test
    void customerSearchFiltersByBranchInTheDatabase() {
        String jpql = queryOf(CustomerRepository.class, "searchAllFields");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("c.branchentity.id in :branchids");
        assertThat(jpql).contains("customerbranchallocation");
        assertThat(jpql).contains("c.branchentity is null");
    }

    // -- Detail-panel reads -------------------------------------------------
    //
    // The details panel is not exempt from the branch rule. The party summaries stay
    // company-wide on purpose (they mirror the customer/vendor list totals, which are
    // company-wide too), but the three reads below return branch-attributed *documents*
    // and voucher lines, and every other read of those entities is branch-scoped. Without
    // a predicate here the panel would be the one place a restricted caller reads another
    // branch's invoices, purchase orders and postings.

    @Test
    void recentInvoicesForTheCustomerPanelAreBranchScopedInTheDatabase() {
        String jpql = queryOf(SalesInvoiceRepository.class, "findRecentByCustomerCodeScoped");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("s.branchid in :branchids");
        assertThat(jpql).contains("s.branchid is null");
        // Still the same document population the POS History query returns.
        assertThat(jpql).contains("draft");
        assertThat(jpql).contains("cancelled");
    }

    @Test
    void recentLposForTheVendorPanelAreBranchScopedInTheDatabase() {
        String jpql = queryOf(LpoRepository.class, "findRecentByVendorId");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("l.branchid in :branchids");
        assertThat(jpql).contains("l.branchid is null");
        assertThat(jpql).contains("l.vendorid = :vendorid");
    }

    @Test
    void recentLedgerEntriesForTheLedgerPanelAreBranchScopedInTheDatabase() {
        String jpql = queryOf(LedgerEntryRepository.class, "findRecentByAccountCodeScoped");

        assertThat(jpql).contains(":allbranches = true");
        assertThat(jpql).contains("le.branch.id in :branchids");
        assertThat(jpql).contains("le.branch is null");
    }

    /**
     * The branch predicate must AND with the whole match clause. If the match terms were
     * left as a bare OR chain, the branch predicate would bind to the last term only and
     * scope nothing — a silent leak that no unit test without a database would otherwise
     * catch.
     */
    @Test
    void theBranchPredicateAndsWithTheWholeMatchClauseNotItsLastTerm() {
        for (String jpql : new String[] {
                queryOf(VendorRepository.class, "searchVendors"),
                queryOf(EmployeeRepository.class, "searchEmployees"),
                queryOf(CustomerRepository.class, "searchAllFields") }) {
            int branchAt = jpql.indexOf(":allbranches");
            int lastOrBefore = jpql.lastIndexOf(" or ", branchAt);
            int closingParenBefore = jpql.lastIndexOf(")", branchAt);
            // The OR chain is closed by a ')' before the branch predicate begins.
            assertThat(closingParenBefore)
                    .as("match clause must be parenthesised before the branch predicate in: %s", jpql)
                    .isGreaterThan(lastOrBefore);
        }
    }

    /**
     * No role name may appear in a search predicate. Which users are restricted is decided
     * by the JWT's {@code isAllBranches} claim, and hard-coding a role here would drift the
     * moment the role set changes.
     *
     * <p>(The employee query does match on {@code e.role} — that is the employee's
     * designation, a searchable identification field, not an access-control role. Hence the
     * specific role-name literals below rather than a blanket "role" check.)
     */
    @Test
    void noSearchQueryTestsForARoleName() {
        for (String jpql : new String[] {
                queryOf(VendorRepository.class, "searchVendors"),
                queryOf(EmployeeRepository.class, "searchEmployees"),
                queryOf(CustomerRepository.class, "searchAllFields") }) {
            assertThat(jpql).doesNotContain("branch_admin");
            assertThat(jpql).doesNotContain("super_admin");
            assertThat(jpql).doesNotContain("hasrole");
            assertThat(jpql).doesNotContain("authorit");
        }
    }
}
