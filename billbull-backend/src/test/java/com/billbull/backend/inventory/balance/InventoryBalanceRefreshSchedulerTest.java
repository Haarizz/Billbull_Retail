package com.billbull.backend.inventory.balance;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The balance refresh has to read a committed ledger.
 *
 * <p>{@code InventoryBalanceService.refresh} is {@code REQUIRES_NEW} on purpose, so a failure
 * updating the pre-aggregated table can never roll back a posted stock movement. Called inline
 * from {@code StockMovementService}, that same annotation was the bug: the new transaction could
 * not see the caller's uncommitted row, so it re-derived the balance from a ledger that did not
 * yet contain the movement and wrote back the on-hand quantity from <em>before</em> it. An
 * approved sales return raised stock in the ledger and left {@code inventory_balances} stale until
 * some later movement happened to touch the same pair.
 *
 * <p>These cases pin the ordering without giving up either property: nothing is read until the
 * commit has happened, and a failure after it is logged rather than thrown — throwing in
 * {@code afterCommit} would report a committed, correct approval as failed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class InventoryBalanceRefreshSchedulerTest {

    private static final Long PRODUCT = 300L;
    private static final Long WAREHOUSE = 7L;

    @Mock private InventoryBalanceService balanceService;

    private InventoryBalanceRefreshScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new InventoryBalanceRefreshScheduler(balanceService);
    }

    @AfterEach
    void tearDown() {
        // The scheduler's pending-pair set is a bound transaction resource. A test that stops
        // short of afterCompletion leaves it bound on this thread, where the next test would find
        // it and never register its own synchronization.
        new java.util.ArrayList<>(TransactionSynchronizationManager.getResourceMap().keySet())
                .forEach(TransactionSynchronizationManager::unbindResourceIfPossible);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void theRefreshIsDeferredUntilTheTransactionCommits() {
        TransactionSynchronizationManager.initSynchronization();

        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);

        verifyNoInteractions(balanceService);
        assertEquals(1, TransactionSynchronizationManager.getSynchronizations().size());

        commit();

        verify(balanceService).refresh(PRODUCT, WAREHOUSE);
    }

    @Test
    void repeatedPairsInOneTransactionRefreshOnce() {
        // A return spread across five lots of one product must not refresh the same balance five
        // times; the aggregate it derives is identical each time.
        TransactionSynchronizationManager.initSynchronization();

        for (int i = 0; i < 5; i++) {
            scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);
        }
        commit();

        verify(balanceService, times(1)).refresh(PRODUCT, WAREHOUSE);
    }

    @Test
    void distinctPairsAreEachRefreshed() {
        TransactionSynchronizationManager.initSynchronization();

        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);
        scheduler.scheduleRefresh(PRODUCT, 8L);
        scheduler.scheduleRefresh(301L, WAREHOUSE);
        commit();

        verify(balanceService).refresh(PRODUCT, WAREHOUSE);
        verify(balanceService).refresh(PRODUCT, 8L);
        verify(balanceService).refresh(301L, WAREHOUSE);
    }

    @Test
    void onlyOneSynchronizationIsRegisteredPerTransactionHoweverManyPairsItTouches() {
        TransactionSynchronizationManager.initSynchronization();

        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);
        scheduler.scheduleRefresh(301L, 8L);

        assertEquals(1, TransactionSynchronizationManager.getSynchronizations().size());
    }

    @Test
    void aRolledBackTransactionRefreshesNothing() {
        TransactionSynchronizationManager.initSynchronization();
        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(balanceService, never()).refresh(anyLong(), anyLong());
    }

    @Test
    void withNoTransactionToWaitForTheRefreshHappensImmediately() {
        // Direct calls outside any transactional boundary, and most unit tests.
        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);

        verify(balanceService).refresh(PRODUCT, WAREHOUSE);
    }

    @Test
    void aFailedRefreshIsLoggedAndNeverRethrownOverACommittedTransaction() {
        when(balanceService.refresh(PRODUCT, WAREHOUSE))
                .thenThrow(new IllegalStateException("balance row locked"));
        TransactionSynchronizationManager.initSynchronization();
        scheduler.scheduleRefresh(PRODUCT, WAREHOUSE);

        // The business transaction has already succeeded. Throwing here would surface a committed
        // approval to the caller as a failure.
        assertDoesNotThrow(this::commit);
    }

    @Test
    void aNullProductOrWarehouseIsIgnored() {
        scheduler.scheduleRefresh(null, WAREHOUSE);
        scheduler.scheduleRefresh(PRODUCT, null);

        verifyNoInteractions(balanceService);
    }

    /** Both halves of a real commit, in the order Spring runs them. */
    private void commit() {
        var synchronizations = TransactionSynchronizationManager.getSynchronizations();
        synchronizations.forEach(TransactionSynchronization::afterCommit);
        synchronizations.forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
    }
}
