package com.billbull.platform.auth;

/** The signed-in platform user, as {@code JwtAuthFilter} puts it in the security context. */
public record PlatformPrincipal(Long id, String email, PlatformRole role, boolean mustChangePassword) {

    public static PlatformPrincipal system() {
        return new PlatformPrincipal(null, "system", PlatformRole.OWNER, false);
    }
}
