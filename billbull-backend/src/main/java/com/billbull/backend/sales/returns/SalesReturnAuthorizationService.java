package com.billbull.backend.sales.returns;

import com.billbull.backend.pos.auth.CredentialVerificationResult;
import com.billbull.backend.pos.auth.PosCredentialVerificationService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.user.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Supervisor sign-off for Sales Returns that policy flags as high-risk (§15).
 *
 * <p>Reuses the existing POS credential primitive
 * ({@link PosCredentialVerificationService#verifyCredentials}) and the same supervisor role set
 * the POS price-override and terminal-handover flows already enforce. It deliberately does not
 * call {@code PosSettingsService.verifySupervisorCredentials}, because that method also
 * reassigns the terminal's session owner — a side effect that makes sense for a shift handover
 * and would be actively wrong when merely approving a refund.
 *
 * <p>Authorization is established server-side and persisted on the return row. Nothing here
 * trusts a frontend flag: a return that requires sign-off and has no stamped approver is
 * rejected by {@link SalesReturnService} even when the API is called directly (§10).
 */
@Service
@Slf4j
public class SalesReturnAuthorizationService {

    /** The same roles POS already treats as supervisors. Kept identical on purpose — a second,
     *  divergent definition of "who may approve" is exactly the duplication §11 forbids. */
    private static final List<String> SUPERVISOR_ROLES =
            List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR");

    @Autowired
    private PosCredentialVerificationService credentialVerificationService;

    @Autowired
    private SalesReturnAuthorizationPolicy authorizationPolicy;

    @Autowired
    private AuditLogService auditLogService;

    /**
     * The reason this return needs sign-off, or {@code null} when it does not.
     *
     * <p>Evaluated from persisted state, never from anything the client asserted. Both the
     * pre-flight eligibility call and the approval path go through this one rule, so the badge
     * the cashier sees and the gate the backend enforces cannot disagree.
     */
    public String resolveRequiredAuthorization(SalesReturn salesReturn) {
        boolean windowExpired = "RETURN_WINDOW_EXPIRED".equals(salesReturn.getAuthorizationReason());
        return authorizationPolicy.resolveAuthorizationReason(
                salesReturn.getRefundMethod(),
                salesReturn.getRefundAmount() != null
                        ? salesReturn.getRefundAmount()
                        : salesReturn.getTotalAmount(),
                windowExpired);
    }

    /**
     * Verifies supervisor credentials and stamps the approval onto the return.
     *
     * <p>Called inside the approval transaction, before any stock, GL or cash side effect runs
     * (§13) — an unauthorized attempt must fail with nothing having moved.
     *
     * @throws ResponseStatusException 401 when credentials are wrong, 403 when the account is
     *         valid but lacks supervisor privileges
     */
    public void authorize(SalesReturn salesReturn, String reasonCode,
                          String supervisorUsername, String supervisorPassword) {

        if (supervisorUsername == null || supervisorUsername.isBlank()
                || supervisorPassword == null || supervisorPassword.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Supervisor authorization is required for " + salesReturn.getReturnNumber()
                            + " (" + describeReason(reasonCode) + "). Provide supervisor credentials to continue.");
        }

        CredentialVerificationResult result =
                credentialVerificationService.verifyCredentials(supervisorUsername, supervisorPassword);

        if (!result.valid()) {
            // Audit the failed attempt: repeated failures against a refund approval are exactly
            // the signal a loss-prevention review needs.
            auditLogService.logDomainEvent("SALES_RETURN", salesReturn.getReturnNumber(),
                    "RETURN_AUTHORIZATION_DENIED",
                    String.format("Authorization attempt for %s (%s) failed: %s. Attempted by '%s', requested by '%s'.",
                            salesReturn.getReturnNumber(), reasonCode, result.message(),
                            supervisorUsername, currentUser()));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Supervisor authorization failed: " + result.message());
        }

        User supervisor = result.user();
        boolean isSupervisor = supervisor.getRoles() != null && supervisor.getRoles().stream()
                .anyMatch(r -> SUPERVISOR_ROLES.contains(r.getName()));

        if (!isSupervisor) {
            auditLogService.logDomainEvent("SALES_RETURN", salesReturn.getReturnNumber(),
                    "RETURN_AUTHORIZATION_DENIED",
                    String.format("User '%s' attempted to authorize %s (%s) but lacks supervisor privileges.",
                            supervisor.getUsername(), salesReturn.getReturnNumber(), reasonCode));
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This account does not have supervisor privileges to authorize a return.");
        }

        String displayName = (supervisor.getFullName() != null && !supervisor.getFullName().isBlank())
                ? supervisor.getFullName()
                : supervisor.getUsername();

        salesReturn.setAuthorizedByUserId(supervisor.getId());
        salesReturn.setAuthorizedByUsername(supervisor.getUsername());
        salesReturn.setAuthorizedAt(LocalDateTime.now());
        salesReturn.setAuthorizationReason(reasonCode);

        auditLogService.logDomainEvent("SALES_RETURN", salesReturn.getReturnNumber(),
                "RETURN_AUTHORIZED",
                String.format("Supervisor '%s' (%s) authorized %s — reason %s, refund %s %s, invoice %s. Requested by '%s'.",
                        displayName, supervisor.getUsername(), salesReturn.getReturnNumber(), reasonCode,
                        salesReturn.getRefundMethod(), salesReturn.getRefundAmount(),
                        salesReturn.getLinkedInvoice(), currentUser()));

        log.info("[SalesReturn] {} authorized by supervisor '{}' (reason {}).",
                salesReturn.getReturnNumber(), supervisor.getUsername(), reasonCode);
    }

    /** Readable rendering of a reason code for messages shown to a cashier. */
    private String describeReason(String reasonCode) {
        if (reasonCode == null) return "policy";
        return switch (reasonCode) {
            case "HIGH_VALUE_CASH_REFUND" -> "cash refund above the approval threshold";
            case "RETURN_WINDOW_EXPIRED" -> "the return window has expired";
            default -> reasonCode;
        };
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
