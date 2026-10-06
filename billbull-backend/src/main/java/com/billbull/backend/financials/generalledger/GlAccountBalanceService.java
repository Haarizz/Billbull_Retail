package com.billbull.backend.financials.generalledger;

import com.billbull.backend.financials.period.AccountingPeriod;
import com.billbull.backend.financials.period.AccountingPeriodService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Keeps {@code gl_account_balances} — the pre-aggregated running totals the reports read instead
 * of scanning {@code journal_lines} — in step with what has actually been posted.
 *
 * <p><b>Why this is its own service.</b> The upsert used to be private to
 * {@code PostingEngineService}, reachable only from its {@code persist} method. Every automatic
 * posting went through there and stayed correct, but a <em>manual</em> journal voucher posts via
 * {@code JournalEntryService.postEntry}, which never called it. So every manual JV wrote
 * {@code journal_lines}, {@code ledger_entries} and the running balance on {@code accounts}, and
 * silently left the pre-aggregated table behind.
 *
 * <p>That is not theoretical. One tenant carries a single correcting JV — posted through the
 * manual screen to clean up after a receipt-voucher outage — that left four accounts (1001, 1100,
 * 2051, 4001) each exactly 1,256.00 adrift. {@code GlBalanceRebuildJob} detected the drift nightly
 * and logged a warning pointing at {@code POST /api/admin/gl-balance/rebuild}, an endpoint its own
 * comment admits was never implemented. The drift was visible and unfixable for a month.
 *
 * <p>Both ends are closed here: {@link #applyEntry} is now called from the single place that marks
 * an entry Posted, so every posting path maintains balances; and {@link #rebuild} actually exists,
 * so drift that has already happened can be repaired without another hand-written correction —
 * which is what created this one.
 */
@Service
public class GlAccountBalanceService {

    private static final Logger log = LoggerFactory.getLogger(GlAccountBalanceService.class);

    private final GlAccountBalanceRepository balanceRepository;
    private final JournalLineRepository journalLineRepository;
    private final AccountingPeriodService accountingPeriodService;

    public GlAccountBalanceService(GlAccountBalanceRepository balanceRepository,
                                   JournalLineRepository journalLineRepository,
                                   AccountingPeriodService accountingPeriodService) {
        this.balanceRepository = balanceRepository;
        this.journalLineRepository = journalLineRepository;
        this.accountingPeriodService = accountingPeriodService;
    }

    /**
     * Applies one posted entry's lines to the pre-aggregated balances.
     *
     * <p>Called from {@code JournalEntryService.postEntry}, which is the one place an entry
     * becomes Posted — system entries from the posting engine and manual journal vouchers from
     * the UI both pass through it, so neither can skip this now. {@code postEntry} refuses an
     * entry that is already Posted, which is what stops an entry being counted twice.
     *
     * <p>Runs in the caller's transaction on purpose: the balances commit with the lines that
     * produced them, or neither does.
     */
    @Transactional
    public void applyEntry(JournalEntry entry) {
        if (entry == null || entry.getLines() == null) return;

        Long branchId = entry.getBranch() != null ? entry.getBranch().getId() : null;
        AccountingPeriod period = accountingPeriodService.findCoveringPeriod(entry.getDate());
        Long periodId = period != null ? period.getId() : null;

        for (JournalLine line : entry.getLines()) {
            String code = line.getAccountCode();
            if (code == null || code.isBlank()) continue;
            applyDelta(code, periodId, branchId, nvl(line.getDebit()), nvl(line.getCredit()));
        }
    }

    /**
     * Recomputes {@code gl_account_balances} from {@code journal_lines}, which is the source of
     * truth. Returns the account codes whose stored totals were wrong.
     *
     * <p>Rebuilds in place rather than deleting and reinserting: the rows are referenced by
     * account/period/branch and recreating them would churn ids for no benefit. A row whose
     * account no longer has any posted lines is zeroed rather than removed, so the absence of a
     * row keeps meaning "never had any activity" rather than "was cleared at some point".
     *
     * @param accountCode a single account to repair, or null for every account
     * @return the codes that were actually corrected, in the order they were found
     */
    @Transactional
    public List<String> rebuild(String accountCode) {
        List<Object[]> postedTotals = accountCode == null || accountCode.isBlank()
                ? journalLineRepository.sumPostedByAccountPeriodBranch()
                : journalLineRepository.sumPostedByAccountPeriodBranchForAccount(accountCode.trim());

        java.util.LinkedHashSet<String> corrected = new java.util.LinkedHashSet<>();
        java.util.Set<String> seenKeys = new java.util.HashSet<>();

        for (Object[] row : postedTotals) {
            String code      = (String) row[0];
            Long periodId    = row[1] != null ? ((Number) row[1]).longValue() : null;
            Long branchId    = row[2] != null ? ((Number) row[2]).longValue() : null;
            BigDecimal dr    = row[3] != null ? (BigDecimal) row[3] : BigDecimal.ZERO;
            BigDecimal cr    = row[4] != null ? (BigDecimal) row[4] : BigDecimal.ZERO;
            seenKeys.add(key(code, periodId, branchId));

            Optional<GlAccountBalance> existing = balanceRepository.findForUpdate(code, periodId, branchId);
            GlAccountBalance balance = existing.orElseGet(() -> {
                GlAccountBalance fresh = new GlAccountBalance();
                fresh.setAccountCode(code);
                fresh.setFiscalPeriodId(periodId);
                fresh.setBranchId(branchId);
                return fresh;
            });

            boolean changed = existing.isEmpty()
                    || nvl(balance.getDebitTotal()).compareTo(dr) != 0
                    || nvl(balance.getCreditTotal()).compareTo(cr) != 0;

            if (!changed) continue;

            log.info("[GlAccountBalance] Rebuilding {} (period {}, branch {}): "
                            + "debit {} -> {}, credit {} -> {}",
                    code, periodId, branchId,
                    nvl(balance.getDebitTotal()), dr, nvl(balance.getCreditTotal()), cr);

            balance.setDebitTotal(dr);
            balance.setCreditTotal(cr);
            balance.setClosingBalance(dr.subtract(cr));
            balanceRepository.save(balance);
            corrected.add(code);
        }

        // A stored row with no posted lines behind it any more — an entry that was voided, or a
        // balance written against a period boundary that has since moved. Zeroed rather than
        // deleted so the absence of a row keeps meaning "never had any activity", which is what
        // every reader of this table already assumes.
        if (accountCode == null || accountCode.isBlank()) {
            for (GlAccountBalance stale : balanceRepository.findAll()) {
                if (seenKeys.contains(key(stale.getAccountCode(), stale.getFiscalPeriodId(), stale.getBranchId()))) {
                    continue;
                }
                if (nvl(stale.getDebitTotal()).signum() == 0 && nvl(stale.getCreditTotal()).signum() == 0) {
                    continue;
                }
                log.info("[GlAccountBalance] Zeroing {} (period {}, branch {}): no posted lines remain "
                                + "behind debit {} / credit {}.",
                        stale.getAccountCode(), stale.getFiscalPeriodId(), stale.getBranchId(),
                        nvl(stale.getDebitTotal()), nvl(stale.getCreditTotal()));
                stale.setDebitTotal(BigDecimal.ZERO);
                stale.setCreditTotal(BigDecimal.ZERO);
                stale.setClosingBalance(BigDecimal.ZERO);
                balanceRepository.save(stale);
                corrected.add(stale.getAccountCode());
            }
        }

        return new java.util.ArrayList<>(corrected);
    }

    private static String key(String accountCode, Long periodId, Long branchId) {
        return accountCode + "|" + periodId + "|" + branchId;
    }

    /** The accounts whose stored totals disagree with {@code journal_lines} right now. */
    @Transactional(readOnly = true)
    public List<String> findDrift() {
        return balanceRepository.findDriftedAccountCodes();
    }

    // ── The incremental upsert, moved verbatim from PostingEngineService ─────────────────

    private void applyDelta(String code, Long periodId, Long branchId, BigDecimal dr, BigDecimal cr) {
        Optional<GlAccountBalance> existing = balanceRepository.findForUpdate(code, periodId, branchId);

        if (existing.isPresent()) {
            GlAccountBalance bal = existing.get();
            bal.setDebitTotal(nvl(bal.getDebitTotal()).add(dr));
            bal.setCreditTotal(nvl(bal.getCreditTotal()).add(cr));
            bal.setClosingBalance(bal.getDebitTotal().subtract(bal.getCreditTotal()));
            balanceRepository.save(bal);
            return;
        }

        GlAccountBalance b = new GlAccountBalance();
        b.setAccountCode(code);
        b.setFiscalPeriodId(periodId);
        b.setBranchId(branchId);
        b.setDebitTotal(dr);
        b.setCreditTotal(cr);
        b.setClosingBalance(dr.subtract(cr));
        try {
            balanceRepository.saveAndFlush(b);
        } catch (DataIntegrityViolationException raceLost) {
            // A concurrent posting inserted the row first. Re-read under lock and re-apply.
            GlAccountBalance bal = balanceRepository.findForUpdate(code, periodId, branchId)
                    .orElseThrow(() -> raceLost);
            bal.setDebitTotal(nvl(bal.getDebitTotal()).add(dr));
            bal.setCreditTotal(nvl(bal.getCreditTotal()).add(cr));
            bal.setClosingBalance(bal.getDebitTotal().subtract(bal.getCreditTotal()));
            balanceRepository.save(bal);
        }
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
