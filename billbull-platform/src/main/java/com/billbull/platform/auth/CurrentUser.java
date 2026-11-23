package com.billbull.platform.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** The signed-in platform user for the current request. */
public final class CurrentUser {

    private CurrentUser() {}

    public static PlatformPrincipal get() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a != null && a.getPrincipal() instanceof PlatformPrincipal p) return p;
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not signed in");
    }
}
