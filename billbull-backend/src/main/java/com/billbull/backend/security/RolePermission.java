package com.billbull.backend.security;

import com.billbull.backend.role.Role;
import jakarta.persistence.*;

@Entity
@Table(name = "role_permissions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"role_id", "module"}),
        indexes = {
                @Index(name = "idx_rp_role_id", columnList = "role_id"),
                @Index(name = "idx_rp_module",  columnList = "module")
        })
public class RolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @Column(nullable = false)
    private String module;

    @Column(nullable = false)
    private boolean canView = false;

    @Column(nullable = false)
    private boolean canCreate = false;

    @Column(nullable = false)
    private boolean canEdit = false;

    @Column(nullable = false)
    private boolean canApprove = false;

    @Column(nullable = false)
    private boolean canExport = false;

    // --- Getters & Setters ---

    public Long getId() { return id; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }

    public boolean isCanView() { return canView; }
    public void setCanView(boolean canView) { this.canView = canView; }

    public boolean isCanCreate() { return canCreate; }
    public void setCanCreate(boolean canCreate) { this.canCreate = canCreate; }

    public boolean isCanEdit() { return canEdit; }
    public void setCanEdit(boolean canEdit) { this.canEdit = canEdit; }

    public boolean isCanApprove() { return canApprove; }
    public void setCanApprove(boolean canApprove) { this.canApprove = canApprove; }

    public boolean isCanExport() { return canExport; }
    public void setCanExport(boolean canExport) { this.canExport = canExport; }
}
