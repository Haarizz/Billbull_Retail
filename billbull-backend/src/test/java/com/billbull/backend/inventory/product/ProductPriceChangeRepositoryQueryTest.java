package com.billbull.backend.inventory.product;

import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.annotation.Transactional;

/**
 * Executes the price-audit range queries against the real database.
 *
 * <p>Both were written as {@code (:from IS NULL OR c.createdAt >= :from)}. Hibernate renders that
 * as a bare {@code ? is null}, and since it binds java.time values without a concrete type OID,
 * PostgreSQL could not infer the placeholder's type and rejected the statement at parse time
 * ("could not determine data type of parameter $1") — so Inventory → Reports → Price Level /
 * Price Change Audit failed to load for every date range, including fully populated ones.
 *
 * <p>A mocked repository test cannot catch this: the SQL is only generated and parsed when the
 * query actually runs. Named {@code ...Test} rather than {@code ...IT} on purpose — this build
 * configures no failsafe plugin, so an {@code *IT} class is never executed by any phase. Like
 * {@code BillbullBackendApplicationTests}, it needs a reachable datasource.
 */
@SpringBootTest
@Transactional
class ProductPriceChangeRepositoryQueryTest {

    @Autowired
    private ProductPriceChangeRepository repository;

    private static final Pageable LIMIT = PageRequest.of(0, 50);

    @Test
    void bothEndsOfTheRangeExecuteWithDatesSupplied() {
        LocalDateTime from = LocalDateTime.of(2026, 8, 31, 0, 0);
        LocalDateTime to = LocalDateTime.of(2026, 9, 4, 23, 59, 59);

        assertThatCode(() -> repository.findInRange(from, to, LIMIT)).doesNotThrowAnyException();
        assertThatCode(() -> repository.findInRangeInBranchScope(from, to, List.of(1L), LIMIT))
                .doesNotThrowAnyException();
    }

    @Test
    void anOpenEndedRangeExecutes() {
        assertThatCode(() -> repository.findInRange(null, null, LIMIT)).doesNotThrowAnyException();
        assertThatCode(() -> repository.findInRange(LocalDateTime.of(2026, 1, 1, 0, 0), null, LIMIT))
                .doesNotThrowAnyException();
        assertThatCode(() -> repository.findInRange(null, LocalDateTime.of(2026, 1, 1, 0, 0), LIMIT))
                .doesNotThrowAnyException();
        assertThatCode(() -> repository.findInRangeInBranchScope(null, null, List.of(1L), LIMIT))
                .doesNotThrowAnyException();
    }
}
