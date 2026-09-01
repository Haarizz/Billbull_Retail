package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;

/**
 * The variance authorization gate and the grants that satisfy it.
 *
 * <p>Approval used to be {@code "supervisorApproved": true} in the request body — no
 * credentials, no identity, no record of what was approved. These tests pin down that a grant
 * now authorizes one session, one pair of figures, exactly once.
 */
@ExtendWith(MockitoExtension.class)
class PosVarianceApprovalTest {

    @Mock private PosSettingsRepository posSettingsRepository;

    private PosVariancePolicy policy;
    private PosVarianceApprovalRegistry registry;

    @BeforeEach
    void setUp() {
        policy = new PosVariancePolicy(posSettingsRepository);
        registry = new PosVarianceApprovalRegistry();
    }

    private void threshold(String amount) {
        PosSettings settings = new PosSettings();
        settings.setCashVarianceThreshold(new BigDecimal(amount));
        lenient().when(posSettingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));
    }

    // ── Threshold semantics ──────────────────────────────────────────────────────────────

    @Test
    void zeroThresholdMeansZeroToleranceNotDisabled() {
        // The reversal that matters. The old gate read `threshold.signum() > 0 && ...`, so the
        // shipped default of 0 disabled the check on every branch: the strictest setting was
        // the one that never fired.
        threshold("0");
        assertTrue(policy.requiresApproval(1L, new BigDecimal("-0.05")));
        assertTrue(policy.requiresApproval(1L, new BigDecimal("200")));
    }

    @Test
    void aVarianceWithinThresholdNeedsNoApproval() {
        threshold("50");
        assertFalse(policy.requiresApproval(1L, new BigDecimal("-20")));
        assertFalse(policy.requiresApproval(1L, new BigDecimal("20")));
    }

    @Test
    void exactlyAtTheThresholdIsAllowed() {
        threshold("50");
        assertFalse(policy.requiresApproval(1L, new BigDecimal("-50")));
        assertFalse(policy.requiresApproval(1L, new BigDecimal("50")));
    }

    @Test
    void justOverTheThresholdRequiresApproval() {
        threshold("50");
        assertTrue(policy.requiresApproval(1L, new BigDecimal("-50.01")));
    }

    @Test
    void roundingNoiseIsNotAVariance() {
        threshold("0");
        assertFalse(policy.isVariance(new BigDecimal("0.001")));
        assertFalse(policy.requiresApproval(1L, new BigDecimal("0.001")));
    }

    @Test
    void aBalancedDrawerNeedsNoApprovalEvenAtZeroTolerance() {
        threshold("0");
        assertFalse(policy.requiresApproval(1L, BigDecimal.ZERO));
    }

    @Test
    void anUnknownBranchGetsTheStrictestThreshold() {
        // No branch means no settings to read. Defaulting to permissive would make an
        // unconfigured drawer the easiest one to close short.
        assertTrue(policy.requiresApproval(null, new BigDecimal("-200")));
    }

    // ── Grants: bound to session AND figures ─────────────────────────────────────────────

    @Test
    void aGrantAuthorizesTheExactReconciliationItWasIssuedFor() {
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");

        var approval = registry.consume(1L, bd("5000"), bd("4800"), token);

        assertTrue(approval.isPresent());
        assertEquals("supervisor", approval.get().approverUsername());
        assertEquals(7L, approval.get().approverUserId());
        assertEquals("miscount", approval.get().reason());
    }

    @Test
    void aRecountAfterApprovalInvalidatesTheGrant() {
        // The critical case: approve a 200 shortage, then recount to a 500 one. The old
        // approval must not carry over — otherwise authorization for a small discrepancy is
        // spendable on a large one.
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");

        assertTrue(registry.consume(1L, bd("5000"), bd("4500"), token).isEmpty());
    }

    @Test
    void aChangedExpectedFigureInvalidatesTheGrant() {
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");
        assertTrue(registry.consume(1L, bd("5200"), bd("4800"), token).isEmpty());
    }

    @Test
    void aGrantCannotBeSpentOnAnotherSession() {
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");
        assertTrue(registry.consume(99L, bd("5000"), bd("4800"), token).isEmpty());
    }

    @Test
    void aGrantIsSingleUse() {
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");

        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isPresent());
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isEmpty());
    }

    @Test
    void aFailedRedemptionStillBurnsTheToken() {
        // Otherwise a rejected attempt leaves the grant available to retry against a figure it
        // does happen to match.
        String token = registry.issue(1L, bd("5000"), bd("4800"), 7L, "supervisor", "miscount");

        assertTrue(registry.consume(1L, bd("5000"), bd("4500"), token).isEmpty());
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isEmpty());
    }

    @Test
    void anUnknownTokenAuthorizesNothing() {
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), "not-a-token").isEmpty());
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), null).isEmpty());
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), "").isEmpty());
    }

    @Test
    void scaleDoesNotDefeatAGrant() {
        // 200 and 200.00 are the same authorization; a trailing zero must not force a re-approval.
        String token = registry.issue(1L, bd("5000.00"), bd("4800.00"), 7L, "supervisor", "r");
        assertTrue(registry.consume(1L, bd("5000"), bd("4800"), token).isPresent());
    }

    private static BigDecimal bd(String v) { return new BigDecimal(v); }
}
