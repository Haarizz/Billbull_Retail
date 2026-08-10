package com.billbull.backend.pos.auth;

public record AuthorizationResult(
    boolean authorized,
    String reasonCode,
    String message,
    /** Single-use grant the client replays on the close call. Only set on the
     *  credential-verification endpoint; null for plain in-process checks. */
    String authorizationToken
) {
    public static AuthorizationResult success() {
        return new AuthorizationResult(true, null, null, null);
    }

    public static AuthorizationResult unauthorized(String reasonCode, String message) {
        return new AuthorizationResult(false, reasonCode, message, null);
    }

    /** Copy of this result carrying a closure grant for the client. */
    public AuthorizationResult withToken(String token) {
        return new AuthorizationResult(authorized, reasonCode, message, token);
    }
}
