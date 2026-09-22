package com.billbull.backend.sales.invoice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

/**
 * Executes the employee-performance aggregates against the real database.
 *
 * <p>A mocked repository test cannot cover these: the JPQL is only translated and parsed when the
 * query actually runs, and the three things that matter here — the status predicate, the
 * {@code (:branchId IS NULL OR ...)} branch filter, and grouping by a nullable column — are all
 * properties of the generated SQL, not of Java.
 *
 * <p>Named {@code ...Test} rather than {@code ...IT} deliberately: this build configures no
 * failsafe plugin, so an {@code *IT} class is never executed by any phase. Like
 * {@code BillbullBackendApplicationTests} it needs a reachable datasource, and is
 * {@code @Transactional} so its fixtures roll back.
 */
@SpringBootTest
@Transactional
class SalesInvoiceRepositorySalespersonQueryTest {

    @Autowired private SalesInvoiceRepository repository;
    @Autowired private EntityManager entityManager;

    private static final LocalDate FROM = LocalDate.of(2026, 9, 1);
    private static final LocalDate TO = LocalDate.of(2026, 9, 30);

    /** Two real branches per test: sales_invoices.branch_id carries a Hibernate-generated FK to
     *  branches(id), so hard-coded ids only work on a database that happens to have them. */
    private Long b1;
    private Long b2;

    @org.junit.jupiter.api.BeforeEach
    void createBranches() {
        b1 = branch("T-SP Branch One");
        b2 = branch("T-SP Branch Two");
    }

    private Long branch(String name) {
        com.billbull.backend.settings.branch.Branch b = new com.billbull.backend.settings.branch.Branch();
        b.setName(name);
        entityManager.persist(b);
        return b.getId();
    }

    private SalesInvoice invoice(String number, LocalDate date, SalesInvoiceStatus status,
                                 Long salespersonId, Long branchId, String total) {
        SalesInvoice inv = new SalesInvoice();
        inv.setInvoiceNumber(number);
        inv.setInvoiceDate(date);
        inv.setStatus(status);
        inv.setSalespersonEmployeeId(salespersonId);
        inv.setBranchId(branchId);
        inv.setInvoiceTotal(new BigDecimal(total));
        inv.setSubTotal(new BigDecimal(total));
        inv.setTaxTotal(BigDecimal.ZERO);
        entityManager.persist(inv);
        return inv;
    }

    /**
     * A real persisted employee. Required, not optional: Hibernate ddl-auto=update adds a
     * FOREIGN KEY (salesperson_employee_id) REFERENCES employees(id) for the read-only
     * {@code SalesInvoice.salespersonEmployee} view, so an invented id is rejected on flush.
     */
    private long employee(String code) {
        com.billbull.backend.hr.employees.Employee e = new com.billbull.backend.hr.employees.Employee();
        e.setEmployeeCode(code);
        e.setFirstName("Test");
        e.setLastName(code);
        e.setPhone("000");
        e.setEmail(code.toLowerCase() + "@example.test");
        e.setStatus("Active");
        entityManager.persist(e);
        return e.getId();
    }

    /** SUM for one employee out of the grouped result, or null when absent. */
    private static BigDecimal salesOf(List<Object[]> rows, long employeeId) {
        return rows.stream()
                .filter(r -> employeeId == ((Number) r[0]).longValue())
                .map(r -> (BigDecimal) r[1])
                .findFirst().orElse(null);
    }

    private static Long billsOf(List<Object[]> rows, long employeeId) {
        return rows.stream()
                .filter(r -> employeeId == ((Number) r[0]).longValue())
                .map(r -> ((Number) r[2]).longValue())
                .findFirst().orElse(null);
    }

    @Test
    void allThreeAggregatesExecuteWithAndWithoutABranchFilter() {
        assertThatCode(() -> repository.sumSalesBySalesperson(FROM, TO, null)).doesNotThrowAnyException();
        assertThatCode(() -> repository.sumSalesBySalesperson(FROM, TO, 1L)).doesNotThrowAnyException();
        assertThatCode(() -> repository.sumUnassignedSalesBetween(FROM, TO, null)).doesNotThrowAnyException();
        assertThatCode(() -> repository.sumUnassignedSalesBetween(FROM, TO, 1L)).doesNotThrowAnyException();
        assertThatCode(() -> repository.sumSalesForSalesperson(1L, FROM, TO, null)).doesNotThrowAnyException();
        assertThatCode(() -> repository.sumSalesForSalesperson(1L, FROM, TO, 1L)).doesNotThrowAnyException();
    }

    @Test
    void groupsBySalespersonAndExcludesDraftAndCancelled() {
        long alice = employee("T-SP-ALICE");
        long bob = employee("T-SP-BOB");
        invoice("T-SP-1", LocalDate.of(2026, 9, 10), SalesInvoiceStatus.PAID, alice, b1, "1000.00");
        invoice("T-SP-2", LocalDate.of(2026, 9, 11), SalesInvoiceStatus.CONFIRMED, alice, b1, "500.00");
        invoice("T-SP-3", LocalDate.of(2026, 9, 12), SalesInvoiceStatus.DRAFT, alice, b1, "9999.00");
        invoice("T-SP-4", LocalDate.of(2026, 9, 13), SalesInvoiceStatus.CANCELLED, alice, b1, "8888.00");
        invoice("T-SP-5", LocalDate.of(2026, 9, 14), SalesInvoiceStatus.PARTIALLY_PAID, bob, b1, "700.00");
        entityManager.flush();

        List<Object[]> rows = repository.sumSalesBySalesperson(FROM, TO, null);

        // PAID + CONFIRMED only. A credit (partially paid) sale counts; DRAFT and CANCELLED do not.
        assertThat(salesOf(rows, alice)).isEqualByComparingTo("1500.00");
        assertThat(billsOf(rows, alice)).isEqualTo(2L);
        assertThat(salesOf(rows, bob)).isEqualByComparingTo("700.00");
    }

    @Test
    void branchFilterNarrowsTheResultAndNullMeansAllBranches() {
        long emp = employee("T-SP-BRANCH");
        invoice("T-SP-B1", LocalDate.of(2026, 9, 10), SalesInvoiceStatus.PAID, emp, b1, "100.00");
        invoice("T-SP-B2", LocalDate.of(2026, 9, 11), SalesInvoiceStatus.PAID, emp, b2, "250.00");
        entityManager.flush();

        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, null), emp))
                .isEqualByComparingTo("350.00");
        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, b1), emp))
                .isEqualByComparingTo("100.00");
        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, b2), emp))
                .isEqualByComparingTo("250.00");
    }

    @Test
    void theDateRangeIsInclusiveAtBothEndsAndExcludesAdjacentMonths() {
        long emp = employee("T-SP-DATES");
        invoice("T-SP-D1", LocalDate.of(2026, 8, 31), SalesInvoiceStatus.PAID, emp, b1, "10.00");
        invoice("T-SP-D2", LocalDate.of(2026, 9, 1), SalesInvoiceStatus.PAID, emp, b1, "20.00");
        invoice("T-SP-D3", LocalDate.of(2026, 9, 30), SalesInvoiceStatus.PAID, emp, b1, "40.00");
        invoice("T-SP-D4", LocalDate.of(2026, 10, 1), SalesInvoiceStatus.PAID, emp, b1, "80.00");
        entityManager.flush();

        // Both boundary days in, neither neighbouring day.
        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, null), emp))
                .isEqualByComparingTo("60.00");
    }

    @Test
    void unattributedInvoicesAreExcludedFromTheGroupingAndCountedSeparately() {
        long emp = employee("T-SP-UNASSIGNED");
        // Measured as a delta: a real tenant database already holds unattributed historical
        // invoices (every pre-feature row is NULL), so an absolute total would depend on them.
        Object[] before = repository.sumUnassignedSalesBetween(FROM, TO, b1).get(0);
        BigDecimal unassignedBefore = (BigDecimal) before[0];
        long unassignedBillsBefore = ((Number) before[1]).longValue();
        invoice("T-SP-U1", LocalDate.of(2026, 9, 10), SalesInvoiceStatus.PAID, emp, b1, "100.00");
        invoice("T-SP-U2", LocalDate.of(2026, 9, 10), SalesInvoiceStatus.PAID, null, b1, "33.00");
        invoice("T-SP-U3", LocalDate.of(2026, 9, 11), SalesInvoiceStatus.DRAFT, null, b1, "999.00");
        entityManager.flush();

        List<Object[]> grouped = repository.sumSalesBySalesperson(FROM, TO, b1);
        assertThat(grouped).allSatisfy(r -> assertThat(r[0]).isNotNull());

        Object[] unassigned = repository.sumUnassignedSalesBetween(FROM, TO, b1).get(0);
        // Exactly the unattributed PAID invoice was added — not the unattributed DRAFT one, and
        // not the attributed one.
        assertThat(((BigDecimal) unassigned[0]).subtract(unassignedBefore))
                .isEqualByComparingTo("33.00");
        assertThat(((Number) unassigned[1]).longValue() - unassignedBillsBefore).isEqualTo(1L);
    }

    @Test
    void bucketsByBusinessDateNotCreatedAtAcrossAnOvernightSession() {
        // An overnight session: the sale is rung at 01:00 on Oct 1 (createdAt) but belongs to the
        // Sep 30 trading day (invoiceDate). It must count in SEPTEMBER. The mirror case — trading
        // date Oct 1, created late on Sep 30 — must NOT.
        long emp = employee("T-SP-OVERNIGHT");
        SalesInvoice overnight = invoice("T-SP-N1", LocalDate.of(2026, 9, 30), SalesInvoiceStatus.PAID, emp, b1, "70.00");
        SalesInvoice early = invoice("T-SP-N2", LocalDate.of(2026, 10, 1), SalesInvoiceStatus.PAID, emp, b1, "5.00");
        entityManager.flush();
        // createdAt is @CreationTimestamp/updatable=false, so skew it underneath Hibernate.
        entityManager.createNativeQuery(
                "UPDATE sales_invoices SET created_at = TIMESTAMP '2026-10-01 01:00:00' WHERE id = :id")
                .setParameter("id", overnight.getId()).executeUpdate();
        entityManager.createNativeQuery(
                "UPDATE sales_invoices SET created_at = TIMESTAMP '2026-09-30 23:30:00' WHERE id = :id")
                .setParameter("id", early.getId()).executeUpdate();
        entityManager.clear();

        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, null), emp))
                .isEqualByComparingTo("70.00");
        assertThat(salesOf(repository.sumSalesBySalesperson(
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), null), emp))
                .isEqualByComparingTo("5.00");
    }

    @Test
    void singleEmployeeAggregateMatchesItsRowInTheGroupedResult() {
        long emp = employee("T-SP-SINGLE");
        invoice("T-SP-S1", LocalDate.of(2026, 9, 10), SalesInvoiceStatus.PAID, emp, b1, "120.00");
        invoice("T-SP-S2", LocalDate.of(2026, 9, 12), SalesInvoiceStatus.PAID, emp, b1, "80.00");
        entityManager.flush();

        Object[] single = repository.sumSalesForSalesperson(emp, FROM, TO, null).get(0);

        assertThat((BigDecimal) single[0]).isEqualByComparingTo("200.00");
        assertThat(((Number) single[1]).longValue()).isEqualTo(2L);
        assertThat(salesOf(repository.sumSalesBySalesperson(FROM, TO, null), emp))
                .isEqualByComparingTo("200.00");
    }

    @Test
    void anEmployeeWithNoSalesAggregatesToZeroRatherThanAnEmptyResult() {
        Object[] single = repository.sumSalesForSalesperson(999999L, FROM, TO, null).get(0);

        assertThat((BigDecimal) single[0]).isEqualByComparingTo("0");
        assertThat(((Number) single[1]).longValue()).isZero();
    }
}
