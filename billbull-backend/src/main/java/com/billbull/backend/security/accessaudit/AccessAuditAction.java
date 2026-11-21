package com.billbull.backend.security.accessaudit;

/**
 * Every kind of access-control change the ledger records. Stored by name, so values may be added
 * but never renamed (existing rows and their hash chain reference the stored text).
 */
public enum AccessAuditAction {
    // Roles
    ROLE_CREATED(TargetType.ROLE, "Role created"),
    ROLE_UPDATED(TargetType.ROLE, "Role details changed"),
    ROLE_DELETED(TargetType.ROLE, "Role deleted"),

    // Role permissions
    PERMISSION_ADDED(TargetType.ROLE_PERMISSION, "Explicit permission rule added"),
    PERMISSION_CHANGED(TargetType.ROLE_PERMISSION, "Permission changed"),
    PERMISSION_RESET(TargetType.ROLE_PERMISSION, "Explicit rule removed (inherits from module)"),
    PERMISSIONS_COPIED(TargetType.ROLE, "Permissions replaced from another role"),

    // User assignments
    USER_ROLES_ASSIGNED(TargetType.USER, "Roles assigned to new user"),
    USER_ROLES_CHANGED(TargetType.USER, "User roles changed"),
    USER_BRANCHES_CHANGED(TargetType.USER, "User branch access changed"),
    USER_SUSPENDED(TargetType.USER, "User access suspended"),
    USER_REACTIVATED(TargetType.USER, "User access restored"),

    // The audit trail itself
    AUDIT_EXPORTED(TargetType.AUDIT, "Audit log exported");

    public enum TargetType { ROLE, ROLE_PERMISSION, USER, AUDIT }

    private final TargetType targetType;
    private final String label;

    AccessAuditAction(TargetType targetType, String label) {
        this.targetType = targetType;
        this.label = label;
    }

    public TargetType getTargetType() { return targetType; }
    public String getLabel() { return label; }
}
