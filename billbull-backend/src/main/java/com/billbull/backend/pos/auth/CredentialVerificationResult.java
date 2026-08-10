package com.billbull.backend.pos.auth;

import com.billbull.backend.user.User;

public record CredentialVerificationResult(
    boolean valid,
    User user,
    String message
) {
    public static CredentialVerificationResult valid(User user) {
        return new CredentialVerificationResult(true, user, null);
    }

    public static CredentialVerificationResult invalid(String message) {
        return new CredentialVerificationResult(false, null, message);
    }
}
