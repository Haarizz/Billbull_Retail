package com.billbull.backend.pos.checkout;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * The open till session the checkout unit suites ring their sales up in.
 *
 * <p>Since Phase 0 / M1 ({@link PosCheckoutSessionGuard}) a checkout that takes payment must name
 * an OPEN session of the branch the server resolves. Real tills always do: selling is gated on an
 * active session in {@code POSSales.jsx}. These suites predate the guard and built sessionless
 * cash sales, which the server now refuses. They exercise pricing, tenders, salesperson and
 * business-date rules, not session handling, so they now sell inside this fixture session instead.
 * The guard's own cases live in {@link PosCheckoutSessionGuardTest}.
 */
final class PosCheckoutTillFixture {

    static final long TILL_SESSION_ID = 4242L;
    static final long TILL_BRANCH_ID = 1L;

    private PosCheckoutTillFixture() {}

    /** A checkout request already inside the open fixture session. */
    static PosCheckoutRequest tillRequest() {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setSessionId(TILL_SESSION_ID);
        // Phase 0 / M2.1: a sale that takes payment must carry a stable checkout key, as every
        // real till does (useCheckout.js checkoutKeyFor). The refusal itself is tested separately.
        req.setCheckoutKey("till-fixture-" + java.util.UUID.randomUUID());
        return req;
    }

    static PosSession openTillSession() {
        PosSession s = new PosSession();
        s.setId(TILL_SESSION_ID);
        s.setStatus(PosSessionStatus.OPEN);
        s.setBranchId(TILL_BRANCH_ID);
        return s;
    }

    static Branch tillBranch() {
        Branch b = new Branch();
        b.setId(TILL_BRANCH_ID);
        return b;
    }

    /**
     * Lenient stubs: the user's branch resolves to the till branch, and the fixture session is
     * OPEN on it. A test that stubs a specific session id later still wins for that id.
     */
    static void stubOpenTill(PosSessionService sessionService, BranchAccessService branchAccessService) {
        lenient().when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(tillBranch());
        lenient().when(sessionService.getById(anyLong())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            if (id != null && id == TILL_SESSION_ID) return openTillSession();
            return null;
        });
        // Phase 0 / M2: delivery settlement reads its session through the locking accessor. In a
        // unit test there is no row lock to take, so it answers whatever getById is stubbed with.
        lenient().when(sessionService.lockById(anyLong()))
                .thenAnswer(inv -> sessionService.getById(inv.getArgument(0)));
    }
}
