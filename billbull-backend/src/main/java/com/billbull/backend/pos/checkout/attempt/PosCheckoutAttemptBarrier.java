package com.billbull.backend.pos.checkout.attempt;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The session side of the M2 protocol: a session transition that would stop a checkout from being
 * recorded (close, begin-closure, suspend, scheduler suspend) refuses while the session has an
 * ACTIVE or STALLED checkout attempt.
 *
 * <p><b>Precondition:</b> the caller has already locked the session row in the current transaction
 * ({@code PosSessionRepository.findByIdForUpdate}). Attempts for a session are only created while
 * that lock is held ({@link PosCheckoutAttemptService#claim}), so under it the set of attempts for
 * the session cannot grow, and this plain read is authoritative. {@code MANDATORY} makes a call
 * outside a transaction fail loudly instead of silently checking nothing.
 *
 * <p>Expired ACTIVE attempts are recovered first (in a transaction of their own, never waiting on
 * the attempt row), so a crashed worker with nothing written does not hold a session forever. A
 * STALLED attempt keeps blocking: part of a sale is recorded and the session's totals may not
 * include it, so a person has to look before the drawer is closed.
 */
@Component
public class PosCheckoutAttemptBarrier {

    private static final Logger log = LoggerFactory.getLogger(PosCheckoutAttemptBarrier.class);

    private final PosCheckoutAttemptService attemptService;

    public PosCheckoutAttemptBarrier(PosCheckoutAttemptService attemptService) {
        this.attemptService = attemptService;
    }

    /**
     * @param transition a short label for the refusal and the log ("CLOSE", "SUSPEND", ...)
     * @throws CheckoutInProgressException 409 when the session has blocking attempts
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void assertNoBlockingCheckouts(Long sessionId, String transition) {
        if (sessionId == null) return;
        List<PosCheckoutAttempt> blocking = attemptService.blockingAttemptsAfterRecovery(sessionId);
        if (blocking.isEmpty()) return;
        log.warn("POS session {} {} refused: {} checkout attempt(s) still open: {}", sessionId, transition,
                blocking.size(), blocking.stream().map(a -> a.id() + "/" + a.state()).collect(Collectors.joining(",")));
        throw new CheckoutInProgressException(sessionId, transition, blocking);
    }

    /** 409 for a session transition refused because a checkout holds the session. */
    public static class CheckoutInProgressException extends ResponseStatusException {
        private final Long sessionId;
        private final String transition;
        private final transient List<PosCheckoutAttempt> attempts;

        CheckoutInProgressException(Long sessionId, String transition, List<PosCheckoutAttempt> attempts) {
            super(HttpStatus.CONFLICT, message(sessionId, transition, attempts));
            this.sessionId = sessionId;
            this.transition = transition;
            this.attempts = attempts;
        }

        private static String message(Long sessionId, String transition, List<PosCheckoutAttempt> attempts) {
            boolean stalled = attempts.stream().anyMatch(a -> a.state() == PosCheckoutAttemptState.STALLED);
            return "SESSION_CHECKOUT_IN_PROGRESS: Session #" + sessionId + " cannot " + verb(transition)
                    + " while a checkout is " + (stalled ? "partly recorded" : "being recorded") + " on it. "
                    + attempts.stream().map(a -> "Attempt " + a.id() + " (" + a.state()
                            + (a.invoiceNumber() != null ? ", invoice " + a.invoiceNumber() : "")
                            + (a.state() == PosCheckoutAttemptState.ACTIVE ? ", lease until " + a.leaseExpiresAt() : "")
                            + ")").collect(Collectors.joining("; "))
                    + ". " + (stalled
                            ? "A supervisor must review the stalled sale and release the attempt before the session can be changed."
                            : "Wait for the sale to finish, then try again.");
        }

        private static String verb(String transition) {
            return switch (transition) {
                case "CLOSE" -> "be closed";
                case "BEGIN_CLOSURE" -> "start closing";
                case "SUSPEND", "SCHEDULED_SUSPEND" -> "be suspended";
                case "TRANSFER" -> "be transferred to another terminal";
                case "TAKEOVER" -> "be taken over by another user";
                case "REASSIGN_OWNER" -> "be handed over to another cashier";
                default -> "change (" + transition + ")";
            };
        }

        public Long getSessionId() { return sessionId; }
        public String getTransition() { return transition; }
        public List<PosCheckoutAttempt> getAttempts() { return attempts; }
    }
}
