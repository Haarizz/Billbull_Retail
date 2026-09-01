package com.billbull.backend.config;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryMovementType;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Seeds the cash-movement categories for the drawer movements that customer advances and
 * layaway settlement produce.
 *
 * <p>Companion to {@link SalesReturnCashCategorySeeder}, which seeds the same kind of row for
 * Sales Return cash refunds. Kept separate because the two arrive with different features and
 * resolve different accounts; the pattern — resolve by account <em>code</em>, refuse rather
 * than mis-post, repair only the GL mapping on restart — is deliberately identical.
 *
 * <h3>Why all three point at Customer Advances (2060)</h3>
 * Each of these movements settles a customer liability rather than an expense or a sale:
 * <ul>
 *   <li>{@code LAYAWAY_DEPOSIT} — cash in, recognising the liability</li>
 *   <li>{@code LAYAWAY_REFUND} — cash out, discharging it on cancellation</li>
 *   <li>{@code ADVANCE_REFUND} — cash out, discharging an unused customer advance</li>
 * </ul>
 * A plain uncategorised movement would post to Petty Cash or General Expense, which would
 * overstate expenses and leave the advance liability on the books forever — the same failure
 * {@link SalesReturnCashCategorySeeder} exists to prevent for returns.
 *
 * <h3>These categories are for record-keeping, not for posting</h3>
 * Unlike the Sales Return category, the movements created under these three are booked with
 * {@code postGlJournal = false}: the owning operation's own journal
 * ({@code createJournalFromAdvanceRefund}, {@code createJournalFromLayawayDeposit},
 * {@code reverseLayawayDepositJournal}) already posts the complete entry including the Cash
 * leg, so a second journal would double it. The GL mapping is still set, because
 * {@code addCashMovement} denormalizes it onto the movement as
 * {@code postedAccountCode}/{@code postedAccountName} — the record of which account the drawer
 * movement belongs to, and what a later void would have to mirror.
 *
 * <p>Runs after {@link SystemAccountSeeder} (Order 1) because it resolves accounts by code.
 * Idempotent: re-running only repairs a missing GL mapping, and never overwrites a name,
 * description, or activation state an administrator has since changed.
 */
@Component
@Order(3)
public class PosDrawerCashCategorySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PosDrawerCashCategorySeeder.class);

    /** Cash paid out of the drawer to refund an unused customer advance. */
    public static final String ADVANCE_REFUND_CODE = "ADVANCE_REFUND";
    /** Cash taken into the drawer as a layaway deposit or instalment. */
    public static final String LAYAWAY_DEPOSIT_CODE = "LAYAWAY_DEPOSIT";
    /** Cash paid out of the drawer when a layaway is cancelled. */
    public static final String LAYAWAY_REFUND_CODE = "LAYAWAY_REFUND";

    private final PosCashMovementCategoryRepository categoryRepository;
    private final AccountRepository accountRepository;

    public PosDrawerCashCategorySeeder(PosCashMovementCategoryRepository categoryRepository,
                                       AccountRepository accountRepository) {
        this.categoryRepository = categoryRepository;
        this.accountRepository = accountRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        Account customerAdvance = accountRepository.findByCode(PostingEngineService.ACC_CUSTOMER_ADVANCE);
        if (customerAdvance == null) {
            // Same stance as the Sales Return seeder: leaving the categories unseeded makes the
            // affected flows fail loudly, which is better than booking customer liabilities to
            // General Expense.
            log.error("[PosDrawerCash] Customer Advances account '{}' not found — drawer cash-movement "
                            + "categories were NOT seeded. POS advance refunds and layaway cash settlement "
                            + "will be rejected until the chart of accounts is seeded.",
                    PostingEngineService.ACC_CUSTOMER_ADVANCE);
            return;
        }

        upsert(ADVANCE_REFUND_CODE, "Customer Advance Refund",
                "Cash paid out of the POS drawer to refund an unused customer advance. "
                        + "Created automatically when an advance is refunded in cash.",
                PosCashMovementCategoryMovementType.DROP_OUT, 110, customerAdvance);

        upsert(LAYAWAY_DEPOSIT_CODE, "Layaway Deposit",
                "Cash taken into the POS drawer as a layaway deposit or instalment. "
                        + "Created automatically when a layaway is settled in cash.",
                PosCashMovementCategoryMovementType.DROP_IN, 120, customerAdvance);

        upsert(LAYAWAY_REFUND_CODE, "Layaway Refund",
                "Cash paid out of the POS drawer when a layaway is cancelled and its deposit "
                        + "returned. Created automatically when a layaway is cancelled with a cash refund.",
                PosCashMovementCategoryMovementType.DROP_OUT, 130, customerAdvance);
    }

    private void upsert(String code, String name, String description,
                        PosCashMovementCategoryMovementType movementType, int displayOrder,
                        Account glAccount) {
        PosCashMovementCategory category = categoryRepository.findAll().stream()
                .filter(c -> code.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElse(null);

        if (category == null) {
            category = new PosCashMovementCategory();
            category.setCode(code);
            category.setName(name);
            category.setDescription(description);
            // Direction is fixed rather than BOTH so addCashMovement's compatibility check
            // refuses, say, a layaway refund booked as a drop-in.
            category.setMovementType(movementType);
            category.setGlAccountId(glAccount.getId());
            category.setDisplayOrder(displayOrder);
            // The layaway/advance reference is already captured on the movement, so a mandatory
            // free-text note here would only duplicate it.
            category.setNotesRequired(false);
            category.setApprovalRequired(false);
            categoryRepository.save(category);
            log.info("[PosDrawerCash] Seeded cash-movement category '{}' -> GL account {} ({}).",
                    code, glAccount.getCode(), glAccount.getName());
            return;
        }

        // Repair only the GL mapping. Name/description/active state are administrator-owned
        // once the row exists and are never reset by a restart.
        if (category.getGlAccountId() == null || category.getGlAccountId().isBlank()) {
            category.setGlAccountId(glAccount.getId());
            categoryRepository.save(category);
            log.info("[PosDrawerCash] Repaired missing GL mapping on cash-movement category '{}' -> {}.",
                    code, glAccount.getCode());
        }
    }
}
