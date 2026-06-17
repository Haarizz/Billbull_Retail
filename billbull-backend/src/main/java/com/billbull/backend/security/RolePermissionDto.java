package com.billbull.backend.security;

/**
 * Safe DTO for RolePermission — used in API responses.
 */
public class RolePermissionDto {

    private Long id;
    private String roleName;
    private String module;
    private boolean canView;
    private boolean canCreate;
    private boolean canEdit;
    private boolean canDelete;
    private boolean canApprove;
    private boolean canExport;

    public RolePermissionDto(RolePermission rp) {
        this.id = rp.getId();
        this.roleName = rp.getRole().getName();
        this.module = rp.getModule();
        this.canView = rp.isCanView();
        this.canCreate = rp.isCanCreate();
        this.canEdit = rp.isCanEdit();
        this.canDelete = rp.isCanDelete();
        this.canApprove = rp.isCanApprove();
        this.canExport = rp.isCanExport();
    }

    // --- Getters only ---

    public Long getId() { return id; }
    public String getRoleName() { return roleName; }
    public String getModule() { return module; }
    public boolean isCanView() { return canView; }
    public boolean isCanCreate() { return canCreate; }
    public boolean isCanEdit() { return canEdit; }
    public boolean isCanDelete() { return canDelete; }
    public boolean isCanApprove() { return canApprove; }
    public boolean isCanExport() { return canExport; }
}
