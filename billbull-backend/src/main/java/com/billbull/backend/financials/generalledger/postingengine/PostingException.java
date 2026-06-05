package com.billbull.backend.financials.generalledger.postingengine;

/**
 * Thrown by the posting gateway when a journal entry fails pre-validation.
 *
 * Carries a stable {@link PostingErrorCode} so callers (controllers, the
 * frontend) can react to the specific failure rather than parsing a message
 * string. Extends {@link RuntimeException} so it triggers transaction rollback
 * under Spring's default rollback rules.
 */
public class PostingException extends RuntimeException {

    private final PostingErrorCode code;

    public PostingException(PostingErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public PostingErrorCode getCode() {
        return code;
    }

    @Override
    public String getMessage() {
        return "[" + code + "] " + super.getMessage();
    }
}
