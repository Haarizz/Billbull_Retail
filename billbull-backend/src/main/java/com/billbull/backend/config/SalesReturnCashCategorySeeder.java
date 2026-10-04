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
 * Seeds the cash-movement category that a POS Sales Return cash refund is booked under.
 *
 * <p><b>Why this exists rather than a plain DROP_OUT.</b> A default DROP_OUT posts
 * {@code Dr General Expense (6099) / Cr Cash (1001)}. That is wrong for a refund: the return's
 * own journal ({@link PostingEngineService#createJournalFromSalesReturn}) already posts
 * {@code Dr Sales Revenue + Dr VAT Output / Cr Accounts Receivable}, leaving a credit sitting
 * on AR that the cash payout is supposed to clear. Booking the drawer payout as an expense
 * would leave AR permanently overstated <em>and</em> overstate expenses by the same amount.
 *
 * <p>Pointing the category's GL override at Accounts Receivable makes the payout post
 * {@code Dr Accounts Receivable / Cr Cash}, so the two entries combine to the correct net
 * effect — {@code Dr Revenue, Dr VAT, Cr Cash} — with AR netting to zero.
 *
 * <p>This deliberately reuses the existing category GL-override mechanism rather than adding a
 * posting path: void reversal, audit, and report aggregation then all work unchanged.
 *
 * <p>Runs after {@link SystemAccountSeeder} (Order 1) because it resolves the AR account by
 * code. Idempotent — re-running only repairs a missing GL mapping, and never overwrites a
 * name, description, or activation state an administrator has since changed.
 */
@Component
@Order(3)
public class SalesReturnCashCategorySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SalesReturnCashCategorySeeder.class);

    /** Stable lookup key. {@code PosCashMovementCategory.code} is unique, so this identifies
     *  the row across tenants without depending on its (editable) display name. */
    public static final String CATEGORY_CODE = "SALES_RETURN_REFUND";

    /**
     * The drop-in side, used when a cash-refunded return is reversed and the money goes back into
     * the drawer. A separate category rather than widening the one above to {@code BOTH}: the two
     * are opposite events and reports that group by category should be able to tell them apart,
     * and widening would mutate a row administrators are allowed to edit.
     */
    public static final String REVERSAL_CATEGORY_CODE = "SALES_RETURN_REFUND_REVERSAL";

    private final PosCashMovementCategoryRepository categoryRepository;
    private final AccountRepository accountRepository;

    public SalesReturnCashCategorySeeder(PosCashMovementCategoryRepository categoryRepository,
                                         AccountRepository accountRepository) {
        this.categoryRepository = categoryRepository;
        this.accountRepository = accountRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        Account receivable = accountRepository.findByCode(PostingEngineService.ACC_ACCOUNTS_RECEIVABLE);
        if (receivable == null) {
            // Without the AR account the category would post to the default General Expense,
            // which is exactly the mis-posting this class exists to prevent. Better to leave it
            // unseeded and let the refund fail loudly than to book refunds to expense.
            log.error("[SalesReturn] Accounts Receivable account '{}' not found — cash-refund category '{}' "
                            + "was NOT seeded. POS cash refunds will be rejected until the chart of accounts is seeded.",
                    PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, CATEGORY_CODE);
            return;
        }

        upsert(CATEGORY_CODE, "Sales Return Refund",
                "Cash paid out of the POS drawer to refund a Sales Return. "
                        + "Created automatically when a return is confirmed with Cash Refund.",
                // Cash only ever leaves the drawer for a refund, so this must never be selectable
                // on a drop-in — addCashMovement validates direction compatibility for us.
                PosCashMovementCategoryMovementType.DROP_OUT, 100, receivable);

        upsert(REVERSAL_CATEGORY_CODE, "Sales Return Refund Reversal",
                "Cash returned to the POS drawer when a cash-refunded Sales Return is reversed. "
                        + "Created automatically by SalesReturnCashReversalService.",
                PosCashMovementCategoryMovementType.DROP_IN, 101, receivable);
    }

    /**
     * Creates the category if it is missing, otherwise repairs only its GL mapping. Name,
     * description, movement type and activation state are administrator-owned once the row
     * exists and are never reset by a restart.
     */
    private void upsert(String code, String name, String description,
                        PosCashMovementCategoryMovementType movementType,
                        int displayOrder, Account receivable) {

        PosCashMovementCategory category = categoryRepository.findAll().stream()
                .filter(c -> code.equalsIgnoreCase(c.getCode()))
                .findFirst()
                .orElse(null);

        if (category == null) {
            category = new PosCashMovementCategory();
            category.setCode(code);
            category.setName(name);
            category.setDescription(description);
            category.setMovementType(movementType);
            category.setGlAccountId(receivable.getId());
            category.setDisplayOrder(displayOrder);
            // The return number and reason are already captured on the return itself, so
            // forcing a free-text note here would only add a redundant field to the flow.
            category.setNotesRequired(false);
            category.setApprovalRequired(false);
            categoryRepository.save(category);
            log.info("[SalesReturn] Seeded cash-movement category '{}' -> GL account {} ({}).",
                    code, receivable.getCode(), receivable.getName());
            return;
        }

        if (category.getGlAccountId() == null || category.getGlAccountId().isBlank()) {
            category.setGlAccountId(receivable.getId());
            categoryRepository.save(category);
            log.info("[SalesReturn] Repaired missing GL mapping on cash-movement category '{}' -> {}.",
                    code, receivable.getCode());
        }
    }
}
