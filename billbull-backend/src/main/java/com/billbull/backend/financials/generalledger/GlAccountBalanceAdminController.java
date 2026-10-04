package com.billbull.backend.financials.generalledger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Operations endpoints for the pre-aggregated {@code gl_account_balances} table.
 *
 * <p>{@code GlBalanceRebuildJob} has pointed its nightly drift warning at
 * {@code POST /api/admin/gl-balance/rebuild} since it was written, with a comment admitting the
 * endpoint was "not implemented yet — deferred to Phase 9 operations tooling". So drift could be
 * detected and not repaired: one tenant ran for a month with four accounts 1,256.00 adrift after a
 * single manual correcting JV, and the only available fix was another hand-written correction,
 * which is what caused it. This is that endpoint.
 *
 * <p>Admin-only. A rebuild rewrites the numbers every financial report reads, so it is not
 * something a cashier or a branch user should be able to trigger, even though it only ever makes
 * the table agree with {@code journal_lines}.
 */
@RestController
@RequestMapping("/api/admin/gl-balance")
@CrossOrigin(origins = "*")
public class GlAccountBalanceAdminController {

    private static final Logger log = LoggerFactory.getLogger(GlAccountBalanceAdminController.class);

    private final GlAccountBalanceService glAccountBalanceService;

    public GlAccountBalanceAdminController(GlAccountBalanceService glAccountBalanceService) {
        this.glAccountBalanceService = glAccountBalanceService;
    }

    /**
     * Reports which accounts' stored totals disagree with the posted lines, without changing
     * anything. The same check {@code GlBalanceRebuildJob} runs nightly, available on demand so a
     * rebuild can be justified before it is run and verified after.
     */
    @GetMapping("/drift")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> drift() {
        List<String> drifted = glAccountBalanceService.findDrift();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("driftedAccountCount", drifted.size());
        body.put("driftedAccountCodes", drifted);
        body.put("inSync", drifted.isEmpty());
        return ResponseEntity.ok(body);
    }

    /**
     * Recomputes the pre-aggregated balances from {@code journal_lines}.
     *
     * <p>Safe to run at any time and safe to run twice: it only ever writes what the posted lines
     * already say, so a second run corrects nothing and reports nothing corrected. That is also
     * the check — run it, then run it again, and the second response should list no accounts.
     *
     * @param accountCode optional, to repair a single account instead of the whole table
     */
    @PostMapping("/rebuild")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> rebuild(
            @RequestParam(required = false) String accountCode) {

        List<String> corrected = glAccountBalanceService.rebuild(accountCode);

        log.warn("[GlAccountBalance] Rebuild requested for {} — {} account(s) corrected: {}",
                accountCode == null || accountCode.isBlank() ? "ALL accounts" : accountCode,
                corrected.size(), corrected);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("scope", accountCode == null || accountCode.isBlank() ? "ALL" : accountCode);
        body.put("correctedAccountCount", corrected.size());
        body.put("correctedAccountCodes", corrected);
        return ResponseEntity.ok(body);
    }
}
