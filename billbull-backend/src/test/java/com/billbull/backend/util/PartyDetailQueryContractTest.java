package com.billbull.backend.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;

import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

/**
 * Asserts the JPQL contract of the queries behind the Customer and Vendor details panels.
 *
 * <p>Same reasoning as {@link SearchQueryContractTest}: these are unit tests with no
 * database, so the matching cannot be executed. What can be pinned down is the shape of
 * each query — and the shape is exactly where a silent regression would hurt here:
 *
 * <ul>
 *   <li>a single-party sum that quietly loses its {@code WHERE} clause becomes a
 *       company-wide total rendered as one customer's balance;
 *   <li>a single-party sum whose predicate drifts from its grouped twin makes the details
 *       panel and the list disagree about the same record;
 *   <li>a "recent documents" query that loses its filter, its ordering or its
 *       {@link Pageable} becomes the whole-table read these endpoints exist to avoid.
 * </ul>
 */
class PartyDetailQueryContractTest {

    private static Method methodOf(Class<?> repository, String name) {
        for (Method m : repository.getDeclaredMethods()) {
            if (m.getName().equals(name)) return m;
        }
        throw new AssertionError("No method " + repository.getSimpleName() + "#" + name);
    }

    private static String queryOf(Class<?> repository, String method) {
        Query query = methodOf(repository, method).getAnnotation(Query.class);
        if (query == null) {
            throw new AssertionError("No @Query on " + repository.getSimpleName() + "#" + method);
        }
        return query.value().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static boolean takesPageable(Class<?> repository, String method) {
        for (Class<?> type : methodOf(repository, method).getParameterTypes()) {
            if (Pageable.class.isAssignableFrom(type)) return true;
        }
        return false;
    }

    // ── Customer sums ────────────────────────────────────────────────────────

    @Test
    void customerInvoiceTotalSumIsScopedToOneCustomerAndExcludesCancelled() {
        String jpql = queryOf(SalesInvoiceRepository.class, "sumInvoiceTotalForCustomerCode");

        assertThat(jpql).contains("s.customercode = :customercode");
        assertThat(jpql).contains("sum(s.invoicetotal)");
        assertThat(jpql).contains("cancelled");
        // Scoped to one customer: no grouped, all-customer shape.
        assertThat(jpql).doesNotContain("group by");
    }

    @Test
    void customerOutstandingSumIsScopedToOneCustomerAndUsesThePerInvoiceBalance() {
        String jpql = queryOf(SalesInvoiceRepository.class, "sumOutstandingBalanceForCustomerCode");

        assertThat(jpql).contains("s.customercode = :customercode");
        // The persisted per-invoice balance, not invoiceTotal minus receipts.
        assertThat(jpql).contains("sum(s.balance)");
        assertThat(jpql).doesNotContain("group by");
    }

    @Test
    void theSingleCustomerSumsKeepTheSameStatusPredicateAsTheirGroupedTwins() {
        // If these drift apart, the details panel and the customer list start reporting
        // different figures for the same customer.
        assertThat(statusPredicateOf(SalesInvoiceRepository.class, "sumInvoiceTotalForCustomerCode"))
                .isEqualTo(statusPredicateOf(SalesInvoiceRepository.class, "sumInvoiceTotalByCustomerCode"));
        assertThat(statusPredicateOf(SalesInvoiceRepository.class, "sumOutstandingBalanceForCustomerCode"))
                .isEqualTo(statusPredicateOf(SalesInvoiceRepository.class, "sumOutstandingBalanceByCustomerCode"));
    }

    /** The {@code s.status ...} clause of a query, with the customer-code predicate removed. */
    private static String statusPredicateOf(Class<?> repository, String method) {
        String jpql = queryOf(repository, method);
        int from = jpql.indexOf("s.status");
        assertThat(from).as("%s has a status predicate", method).isGreaterThanOrEqualTo(0);
        int to = jpql.indexOf("and s.customercode", from);
        if (to < 0) to = jpql.indexOf("group by", from);
        if (to < 0) to = jpql.length();
        return jpql.substring(from, to).trim();
    }

    @Test
    void openingBalanceOutstandingSumIsScopedToOneCustomer() {
        String jpql = queryOf(OpeningInvoiceRepository.class, "sumOutstandingForCustomer");

        assertThat(jpql).contains("oi.customer.code = :customercode");
        // COALESCE(outstanding, amount) handles rows where outstanding was never set.
        assertThat(jpql).contains("coalesce(oi.outstanding, oi.amount)");
        assertThat(jpql).doesNotContain("group by");
    }

    // ── Customer recent invoices ─────────────────────────────────────────────

    @Test
    void recentCustomerInvoicesStayFilteredBoundedAndNewestFirst() {
        // The panel calls the branch-scoped variant; the unscoped one stays as the POS
        // History tab's query. Both are asserted so neither can drift from the other on
        // the parts they must agree about.
        String jpql = queryOf(SalesInvoiceRepository.class, "findRecentByCustomerCodeScoped");
        String posHistory = queryOf(SalesInvoiceRepository.class, "findRecentByCustomerCode");

        for (String q : new String[] { jpql, posHistory }) {
            assertThat(q).contains("s.customercode = :customercode");
            assertThat(q).contains("order by s.id desc");
            assertThat(q).contains("draft");
            assertThat(q).contains("cancelled");
        }
        assertThat(takesPageable(SalesInvoiceRepository.class, "findRecentByCustomerCodeScoped")).isTrue();
        // ...and only the panel's variant carries the branch predicate.
        assertThat(jpql).contains(":allbranches");
        assertThat(posHistory).doesNotContain(":allbranches");
    }

    // ── Vendor sums ──────────────────────────────────────────────────────────

    @Test
    void vendorInvoiceOutstandingSumIsScopedToOneVendorAndKeepsThePostedUnpaidPredicate() {
        String jpql = queryOf(PurchaseInvoiceRepository.class, "sumOutstandingForVendorName");

        assertThat(jpql).contains("i.vendorname = :vendorname");
        assertThat(jpql).contains("i.status = com.billbull.backend.purchase.invoice.invoicestatus.posted");
        assertThat(jpql).contains("i.paymentstatus <> com.billbull.backend.purchase.invoice.paymentstatus.paid");
        assertThat(jpql).doesNotContain("group by");
    }

    @Test
    void vendorInvoiceLinkedPaymentSumIsScopedToOneVendorAndToLinkedVouchersOnly() {
        String jpql = queryOf(PaymentVoucherRepository.class, "sumInvoiceLinkedPaymentsByVendorName");

        assertThat(jpql).contains("p.vendorname = :vendorname");
        // Linked to an invoice — the on-account half is a different query.
        assertThat(jpql).contains("p.invoiceid is not null");
        assertThat(jpql).contains("posted");
        assertThat(jpql).contains("cleared");
        assertThat(jpql).doesNotContain("group by");
    }

    @Test
    void vendorOnAccountAndLifetimePaidSumsRemainDistinct() {
        String onAccount = queryOf(PaymentVoucherRepository.class, "sumOnAccountPaidByVendorName");
        String lifetime = queryOf(PaymentVoucherRepository.class, "sumPaymentsByVendorName");

        // On-account settles the opening balance and is restricted to unlinked vouchers.
        assertThat(onAccount).contains("p.invoiceid is null");
        // Lifetime Total Paid is every posted/cleared voucher, linked or not — which is
        // what makes it an unambiguous lifetime figure worth showing.
        assertThat(lifetime).doesNotContain("p.invoiceid");
        assertThat(lifetime).contains("p.vendorname = :vendorname");
        // Neither is date-bounded, so neither is a period figure dressed as a lifetime one.
        assertThat(lifetime).doesNotContain("paymentdate");
        assertThat(onAccount).doesNotContain("paymentdate");
    }

    // ── Vendor recent LPOs ───────────────────────────────────────────────────

    @Test
    void recentVendorLposAreFilteredByVendorIdOrderedNewestFirstAndBounded() {
        String jpql = queryOf(LpoRepository.class, "findRecentByVendorId");

        // Filtered in SQL by the vendor relationship, not by name and not in memory.
        assertThat(jpql).contains("l.vendorid = :vendorid");
        assertThat(jpql).contains("order by l.lpodate desc, l.id desc");
        assertThat(takesPageable(LpoRepository.class, "findRecentByVendorId")).isTrue();
    }
}
