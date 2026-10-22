package com.billbull.backend.pos.held;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;

/**
 * Held (parked) carts.
 *
 * <p>Branch scope is judged on the POS session a cart belongs to, never on a branch id sent by
 * the client: holding needs the session's branch to be one the caller may act on, and the cart
 * is stamped with that branch; listing and recalling check the stored cart's session. A refused
 * recall leaves the cart held.
 */
@Service
@Transactional
public class PosHeldSaleService {

    private static final String LABEL = "Held sale";

    private final PosHeldSaleRepository repo;
    private final PosSessionRepository sessionRepository;
    private final BranchAccessService branchAccessService;

    public PosHeldSaleService(PosHeldSaleRepository repo, PosSessionRepository sessionRepository,
                              BranchAccessService branchAccessService) {
        this.repo = repo;
        this.sessionRepository = sessionRepository;
        this.branchAccessService = branchAccessService;
    }

    /** The session, which must exist and belong to a branch the caller may act on. */
    private PosSession sessionInScope(Long sessionId) {
        PosSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "POS session not found: " + sessionId));
        branchAccessService.assertTransactionBranchAccessible(session.getBranchId(), LABEL);
        return session;
    }

    public PosHeldSale hold(PosHeldSaleRequest req) {
        if (req.getSessionId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An open POS session is required to hold a sale");
        }
        if (req.getCartJson() == null || req.getCartJson().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot hold an empty cart");
        }
        PosSession session = sessionInScope(req.getSessionId());
        PosHeldSale held = new PosHeldSale();
        held.setPosSessionId(session.getId());
        held.setBranchId(session.getBranchId());
        held.setTerminalId(req.getTerminalId());
        held.setCashierName(req.getCashierName() != null ? req.getCashierName() : currentUsername());
        held.setCustomerCode(req.getCustomerCode());
        held.setCustomerName(req.getCustomerName());
        held.setCartJson(req.getCartJson());
        held.setTotal(req.getTotal() != null ? BigDecimal.valueOf(req.getTotal()) : BigDecimal.ZERO);
        held.setItemCount(req.getItemCount() != null ? req.getItemCount() : 0);

        long existing = repo.countByPosSessionIdAndIsActiveTrue(req.getSessionId());
        held.setLabel(req.getLabel() != null && !req.getLabel().isBlank()
                ? req.getLabel()
                : "#" + (existing + 1));
        return repo.save(held);
    }

    @Transactional(readOnly = true)
    public List<PosHeldSale> listForSession(Long sessionId) {
        if (sessionId == null) {
            return List.of();
        }
        sessionInScope(sessionId);
        return repo.findByPosSessionIdAndIsActiveTrueOrderByCreatedAtAsc(sessionId);
    }

    /**
     * Recall a held cart: returns it and soft-deletes it so it leaves the recall list
     * (the cart is now back in the live POS).
     */
    public PosHeldSale recall(Long id) {
        PosHeldSale held = repo.findById(id)
                .filter(PosHeldSale::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Held sale not found: " + id));
        // The session decides; the cart's own stamp covers a session that no longer exists.
        Long branchId = held.getPosSessionId() == null ? held.getBranchId()
                : sessionRepository.findById(held.getPosSessionId()).map(PosSession::getBranchId).orElse(held.getBranchId());
        branchAccessService.assertTransactionBranchAccessible(branchId, LABEL);
        held.setActive(false);
        repo.save(held);
        return held;
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "system";
    }
}
