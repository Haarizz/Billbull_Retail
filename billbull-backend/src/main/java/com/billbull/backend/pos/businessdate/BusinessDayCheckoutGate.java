package com.billbull.backend.pos.businessdate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides whether a checkout may complete given the branch's Business Day state.
 *
 * <p>This is what actually stops selling after Business Day closure. Blocking session
 * <i>opening</i> alone is not enough: a session opened at 20:00 is still open at
 * 23:30, and without this gate it would keep ringing up sales into a Business Day
 * that has closed. The POS's closure screen is a UI affordance; this is the control.
 *
 * <h2>There is no time-based grace period, deliberately</h2>
 * An earlier revision allowed any checkout from an already-open session for a few
 * minutes past closure. That was wrong: "the session was open at closure" is a
 * property of the <i>session</i>, not of a particular sale, so it granted the cashier
 * a window in which brand-new carts could still be rung up. Business Day closure has
 * to mean selling stopped.
 *
 * <p>The only way past a closed Business Day is the <b>existing</b> per-transaction
 * supervisor authorization the checkout request already carries
 * ({@code supervisorOverridePin} / {@code supervisorOverrideEmail}+{@code Password},
 * verified by {@code PosCheckoutController} through {@code PosSettingsService}). That
 * is a deliberate, credential-verified, audited exception granted one sale at a time
 * — it cannot be spent on a second sale, and it expires the moment it is used. A
 * supervisor standing at the till to release one pending transaction is a very
 * different thing from a cashier inheriting free selling time.
 */
@Service
public class BusinessDayCheckoutGate {

    private final BusinessDayWindowService windowService;

    public BusinessDayCheckoutGate(BusinessDayWindowService windowService) {
        this.windowService = windowService;
    }

    /**
     * Throws {@link BusinessDayClosedException} if this checkout must be refused.
     * Returns normally — the overwhelmingly common case — whenever the Business Day
     * is ACTIVE, in EXTENSION, unconfigured, or enforcement is off for the branch.
     *
     * <p>Callers that support the supervisor-authorized exception catch the exception
     * and re-check their own supervisor credentials before letting a single
     * transaction through; this method deliberately knows nothing about credentials,
     * so the phase decision and the authorization decision stay separable and
     * separately testable.
     *
     * @param branchId branch the sale belongs to. A null branch is not gated — a
     *                 malformed request must fail on its own merits rather than be
     *                 reported as a Business Day closure.
     */
    @Transactional(readOnly = true)
    public void assertCheckoutAllowed(Long branchId) {
        if (branchId == null) return;

        BusinessDayState state = windowService.resolveCurrent(branchId);
        if (state.blocksNormalOperation()) {
            throw BusinessDayClosedException.of(state);
        }
    }
}
