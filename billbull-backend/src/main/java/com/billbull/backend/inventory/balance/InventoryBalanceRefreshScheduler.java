package com.billbull.backend.inventory.balance;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Defers {@link InventoryBalanceService#refresh} until the stock movement that triggered it has
 * actually committed.
 *
 * <p>{@code refresh} runs {@code REQUIRES_NEW}, deliberately, so a failure in the balance table
 * never rolls back a posted stock movement. The consequence was a visibility bug: called inline
 * from {@code StockMovementService}, it opened a <em>second</em> transaction while the caller's
 * was still uncommitted, and re-derived the balance from a ledger that did not yet contain the
 * row just saved. A sales-return approval therefore wrote its inbound movement and then
 * overwrote {@code inventory_balances} with the on-hand quantity from <em>before</em> the return —
 * the ledger was right and the pre-aggregated table was stale until the next movement happened to
 * touch the same (product, warehouse) pair.
 *
 * <p>Registering an {@code afterCommit} callback fixes the ordering without weakening either
 * property: the movement is committed and visible before the balance is read, and the refresh
 * still runs outside the business transaction so it cannot roll one back.
 *
 * <h3>Why failures are logged and not rethrown</h3>
 * {@code afterCommit} runs when the business transaction has already succeeded. Throwing there
 * propagates to the caller, which would report a committed, correct approval as failed — the
 * opposite of the honesty this is for. A failure is logged at ERROR with the exact pair, which
 * {@code rebuildAll()} can repair, and the stock ledger — the source of truth — is unaffected
 * either way.
 *
 * <p>Pairs are de-duplicated per transaction, so an approval touching one product across five
 * batch lots refreshes that balance once rather than five times.
 */
@Service
@Slf4j
public class InventoryBalanceRefreshScheduler {

    private static final String RESOURCE_KEY = InventoryBalanceRefreshScheduler.class.getName() + ".pending";

    private final InventoryBalanceService balanceService;

    public InventoryBalanceRefreshScheduler(InventoryBalanceService balanceService) {
        this.balanceService = balanceService;
    }

    /** One (product, warehouse) pair awaiting a balance refresh. */
    private record Pair(Long productId, Long warehouseId) {}

    /**
     * Queues a refresh for after the current transaction commits, or performs it immediately when
     * there is no transaction to wait for (a direct call outside any transactional boundary, and
     * most unit tests).
     */
    public void scheduleRefresh(Long productId, Long warehouseId) {
        if (productId == null || warehouseId == null) return;

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            refreshNow(productId, warehouseId);
            return;
        }

        @SuppressWarnings("unchecked")
        Set<Pair> pending = (Set<Pair>) TransactionSynchronizationManager.getResource(RESOURCE_KEY);
        if (pending == null) {
            pending = new LinkedHashSet<>();
            TransactionSynchronizationManager.bindResource(RESOURCE_KEY, pending);
            final Set<Pair> queued = pending;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    queued.forEach(p -> refreshNow(p.productId(), p.warehouseId()));
                }

                @Override
                public void afterCompletion(int status) {
                    if (TransactionSynchronizationManager.hasResource(RESOURCE_KEY)) {
                        TransactionSynchronizationManager.unbindResource(RESOURCE_KEY);
                    }
                }
            });
        }
        pending.add(new Pair(productId, warehouseId));
    }

    private void refreshNow(Long productId, Long warehouseId) {
        try {
            balanceService.refresh(productId, warehouseId);
        } catch (Exception e) {
            log.error("[InventoryBalance] Failed to refresh balance for product={} warehouse={}:"
                            + " {}. The stock ledger is unaffected; rebuild the balance table to repair it.",
                    productId, warehouseId, e.getMessage(), e);
        }
    }
}
