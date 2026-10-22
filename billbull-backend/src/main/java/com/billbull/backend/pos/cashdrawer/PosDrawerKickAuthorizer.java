package com.billbull.backend.pos.cashdrawer;

import com.billbull.backend.pos.auth.PosTillPermission;
import com.billbull.backend.pos.session.PosSessionOwnershipService;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may open a cash drawer.
 *
 * <p>A drawer opens when its printer receives a pulse command, so the rule is applied to the
 * bytes: when a print sent through the server carries a pulse, the caller must
 * <ol>
 *   <li>hold the till permission ({@code sales.pos} view),</li>
 *   <li>be able to act on the printer's branch, and</li>
 *   <li>own an OPEN POS session in that branch.</li>
 * </ol>
 * A cashier ringing up sales meets all three, and so may open the drawer as part of their shift
 * (cash sale, change, cash in/out, manual open). Belonging to the branch is not enough: Retail
 * users who print invoices and labels to the same printer cannot open the drawer, nor can a
 * till user with no shift running. Administrators get no exemption; they open a session too.
 *
 * <p>Prints without a pulse are unaffected.
 */
@Component
public class PosDrawerKickAuthorizer {

    private final ModulePermissionService modulePermissionService;
    private final BranchAccessService branchAccessService;
    private final PosSessionRepository sessionRepository;
    private final PosSessionOwnershipService ownershipService;

    public PosDrawerKickAuthorizer(ModulePermissionService modulePermissionService,
                                   BranchAccessService branchAccessService,
                                   PosSessionRepository sessionRepository,
                                   PosSessionOwnershipService ownershipService) {
        this.modulePermissionService = modulePermissionService;
        this.branchAccessService = branchAccessService;
        this.sessionRepository = sessionRepository;
        this.ownershipService = ownershipService;
    }

    /** 403 unless the caller may open a drawer on a printer of {@code branchId}. Writes nothing. */
    public void assertMayOpenDrawer(Long branchId) {
        modulePermissionService.requireCanView(PosTillPermission.MODULE);
        branchAccessService.assertTransactionBranchAccessible(branchId, "Cash drawer");
        Long userId = ownershipService.currentPrincipalUserId();
        boolean onShift = userId != null && branchId != null
                && !sessionRepository.findByOwnerUserIdAndBranchIdAndStatus(userId, branchId, PosSessionStatus.OPEN).isEmpty();
        if (!onShift) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Opening the cash drawer needs an open POS session in this branch.");
        }
    }
}
