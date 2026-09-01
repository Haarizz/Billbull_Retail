package com.billbull.backend.pos.session.denomination;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The denomination ladder the count screens render from.
 *
 * <p>Exposed so the browser stops owning the definition of what a drawer can contain. The
 * frontend may keep a bundled AED ladder purely as a rendering fallback when this endpoint is
 * unreachable, but that copy has no authority: the server validates every submitted count against
 * the ladder here and rejects anything else, so a stale or edited client cannot widen what counts
 * as money.
 */
@RestController
@RequestMapping("/api/pos/denominations")
public class PosDenominationLadderController {

    private final PosDenominationCountService countService;

    public PosDenominationLadderController(PosDenominationCountService countService) {
        this.countService = countService;
    }

    /**
     * The ladder for the drawer currency, or for an explicitly requested one.
     *
     * <p>Returns 422 for a currency with no configured ladder — the same refusal the count path
     * gives, so the UI discovers the misconfiguration when it renders rather than when a cashier
     * tries to close.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getLadder(
            @RequestParam(required = false) String currencyCode) {
        String resolved = (currencyCode != null && !currencyCode.isBlank())
                ? currencyCode.trim().toUpperCase(java.util.Locale.ROOT)
                : countService.resolveCurrencyCode();
        PosDenominationLadder ladder = countService.requireLadder(resolved);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("currencyCode", ladder.currencyCode());
        body.put("currencyName", ladder.currencyName());
        body.put("noteKeys", ladder.noteKeys());
        body.put("coinKeys", ladder.coinKeys());
        body.put("allKeys", ladder.allKeys());
        body.put("supportedCurrencies", PosDenominationLadder.supportedCurrencies());
        return ResponseEntity.ok(body);
    }
}
