package com.billbull.backend.exception;

/**
 * A POS session close or Business Day Close refused because the branch requires an
 * administrator's approval (Console > Behavior > Closing Approval) and none was supplied.
 *
 * <p>Rendered by {@link GlobalExceptionHandler} as 403 with {@code code=ADMIN_APPROVAL_REQUIRED}
 * and the {@code action} being refused, so the till can open the approval prompt instead of
 * string-matching a message.
 */
public class AdminApprovalRequiredException extends RuntimeException {

    private final String action;

    public AdminApprovalRequiredException(String action, String message) {
        super(message);
        this.action = action;
    }

    public String getAction() { return action; }
}
