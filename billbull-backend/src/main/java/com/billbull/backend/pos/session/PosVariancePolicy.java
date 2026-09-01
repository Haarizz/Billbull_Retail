package com.billbull.backend.pos.session;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Decides whether a cash variance needs authorization.
 *
 * <h3>What the threshold means</h3>
 * {@code PosSettings.cashVarianceThreshold} is the largest discrepancy a cashier may close
 * without a supervisor. The states are:
 *
 * <ul>
 *   <li><b>threshold = 0</b> (the shipped default) — zero tolerance: <em>any</em> discrepancy
 *       needs approval.</li>
 *   <li><b>threshold &gt; 0</b> — discrepancies up to and including it close unaided; beyond it
 *       need approval.</li>
 *   <li><b>threshold null</b> — unconfigured, treated as 0.</li>
 * </ul>
 *
 * <p>This is a deliberate reversal. The previous gate read
 * {@code if (threshold.signum() > 0 && variance > threshold)}, so a threshold of zero — the
 * default every branch ships with — disabled the check entirely rather than enforcing zero
 * tolerance. The control that was supposed to be strictest was the one that never fired. There
 * is no "disabled" state: a branch that genuinely wants no gate sets a threshold high enough to
 * say so explicitly, which is at least visible in configuration.
 *
 * <h3>Tolerance</h3>
 * Comparisons use {@link #EPSILON}, half the smallest AED coin. Below that a "variance" is
 * arithmetic noise rather than money, and no drawer can be off by less than the smallest
 * denomination it can hold.
 */
@Service
public class PosVariancePolicy {

    /** Half the smallest circulating coin (0.05). Below this, a difference is not money. */
    public static final BigDecimal EPSILON = new BigDecimal("0.025");

    private final PosSettingsRepository posSettingsRepository;

    public PosVariancePolicy(PosSettingsRepository posSettingsRepository) {
        this.posSettingsRepository = posSettingsRepository;
    }

    /** The configured tolerance for a branch; 0 when unset. */
    public BigDecimal thresholdFor(Long branchId) {
        if (branchId == null) return BigDecimal.ZERO;
        return posSettingsRepository.findByBranchId(branchId)
                .map(PosSettings::getCashVarianceThreshold)
                .orElse(BigDecimal.ZERO);
    }

    /** True when the difference is real money rather than rounding noise. */
    public boolean isVariance(BigDecimal cashDifference) {
        return cashDifference != null && cashDifference.abs().compareTo(EPSILON) > 0;
    }

    /**
     * Whether closing with this discrepancy requires an authorized approval.
     *
     * <p>An uncounted drawer needs no approval here: it has no variance to approve, and whether
     * an uncounted session may close at all is a separate question.
     */
    public boolean requiresApproval(Long branchId, BigDecimal cashDifference) {
        if (!isVariance(cashDifference)) return false;
        BigDecimal threshold = thresholdFor(branchId);
        if (threshold == null) threshold = BigDecimal.ZERO;
        return cashDifference.abs().compareTo(threshold) > 0;
    }
}
