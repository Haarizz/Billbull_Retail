package com.billbull.backend.pos.session;

import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Validates a POS drawer/collection session that a caller has <em>explicitly declared</em>.
 *
 * <h3>Why this is a validator and not a resolver</h3>
 * Drawer ownership is never inferred. This class deliberately offers no way to look a session
 * up from a terminal id, a branch, a cashier, an invoice's sale session, or "whatever is
 * currently open" — every one of those would attribute physical cash to a drawer the caller
 * never named. The caller states which drawer took the money; this class only decides whether
 * that statement is acceptable.
 *
 * <p>The distinction matters because the two failure modes are opposite. An inferred session
 * silently books cash against the wrong till and reconciles clean; a rejected declaration
 * fails loudly at the point where it is still cheap to fix. Shared services reused by both POS
 * and back-office callers must therefore take the session as a parameter, never discover it.
 *
 * <p>Modelled on the guard already proven in
 * {@code SalesReturnCashRefundService#recordCashRefund}, which refuses a cash refund whose
 * return carries no POS session rather than trusting the UI to have supplied one.
 */
@Service
public class PosDrawerSessionValidator {

    private final PosSessionRepository sessionRepository;
    private final BranchAccessService branchAccessService;

    public PosDrawerSessionValidator(PosSessionRepository sessionRepository,
                                     BranchAccessService branchAccessService) {
        this.sessionRepository = sessionRepository;
        this.branchAccessService = branchAccessService;
    }

    /**
     * The declared session, proven fit to receive or release physical cash.
     *
     * @param declaredSessionId the session the caller states owns this drawer movement; never
     *                          defaulted or discovered when null
     * @param operation         human-readable operation name, used only in the error message
     * @throws ResponseStatusException 400 when no session was declared, the declared session
     *                                 does not exist, or it is not OPEN
     */
    public PosSession requireOpenDrawerSession(Long declaredSessionId, String operation) {
        if (declaredSessionId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    operation + " moves physical cash and requires an open POS session. "
                            + "Perform it from a POS terminal with an open session, or choose a "
                            + "non-cash method.");
        }
        PosSession session = sessionRepository.findById(declaredSessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "POS session " + declaredSessionId + " was not found, so " + operation
                                + " cannot be attributed to a cash drawer."));
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "POS session " + declaredSessionId + " is " + session.getStatus()
                            + ". Cash cannot move through a drawer whose session is not open.");
        }
        // The caller must be entitled to the branch that owns the drawer. Without this an
        // explicit declaration is merely client-asserted, which is the defect this class exists
        // to close rather than relocate.
        branchAccessService.assertTransactionBranchAccessible(session.getBranchId(), "POS session");
        return session;
    }

    /**
     * Validating variant for flows that are legitimately performed both at a till and from the
     * back office: returns the validated session when one was declared, and {@code null} when
     * none was — never a discovered one.
     *
     * <p>A {@code null} return means "this cash was not declared to any drawer", which is the
     * correct outcome for a genuine back-office receipt and a reportable omission for a
     * till-side one. Callers must not treat it as permission to look a session up.
     */
    public PosSession validateOptionalDrawerSession(Long declaredSessionId, String operation) {
        return declaredSessionId == null ? null : requireOpenDrawerSession(declaredSessionId, operation);
    }
}
