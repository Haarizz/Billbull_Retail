package com.billbull.backend.auth;

import com.billbull.backend.role.Role;
import com.billbull.backend.user.User;

/** Builds the sign-in response body shared by password and till PIN sign-in. */
public final class LoginResponses {

    private LoginResponses() {
    }

    /** Primary role is the canonical role for sidebar fallback and login redirect. */
    public static String primaryRole(User user) {
        return user.getPrimaryRole() != null
                ? user.getPrimaryRole().getName()
                : user.getRoles().stream().map(Role::getName).findFirst().orElse("USER");
    }

    public static LoginResponse of(User user, String token) {
        String primaryRole = primaryRole(user);
        var branch = user.getBranch();
        var warehouse = branch != null ? branch.getDefaultWarehouse() : null;
        return new LoginResponse(
                token,
                user.getUsername(),
                user.getResolvedDisplayName(),
                primaryRole, // `role` always equals primaryRole
                primaryRole,
                branch != null ? branch.getId() : null,
                branch != null ? branch.getName() : null,
                branch != null ? branch.getCode() : null,
                warehouse != null ? warehouse.getId() : null,
                warehouse != null ? warehouse.getName() : null);
    }
}
