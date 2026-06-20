package com.billbull.backend.pos.held;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;

@Service
@Transactional
public class PosHeldSaleService {

    private final PosHeldSaleRepository repo;

    public PosHeldSaleService(PosHeldSaleRepository repo) {
        this.repo = repo;
    }

    public PosHeldSale hold(PosHeldSaleRequest req) {
        if (req.getSessionId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An open POS session is required to hold a sale");
        }
        if (req.getCartJson() == null || req.getCartJson().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot hold an empty cart");
        }
        PosHeldSale held = new PosHeldSale();
        held.setPosSessionId(req.getSessionId());
        held.setBranchId(req.getBranchId());
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
        held.setActive(false);
        repo.save(held);
        return held;
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "system";
    }
}
