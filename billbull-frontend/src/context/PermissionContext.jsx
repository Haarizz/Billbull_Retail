import React, { createContext, useContext, useState, useEffect } from 'react';
import { getRoles, isAuthenticated } from '../api/auth';
import { rolePermissionsApi } from '../api/rolePermissionsApi';

/**
 * Permission Context for RBAC throughout the application.
 *
 * Permissions are loaded from the backend (role_permissions table) on mount.
 * Default = DENY: if no permission row exists for a role+module, access is false.
 * Merge rule = ALLOW wins (union): if any of the user's roles grants access, access is granted.
 */
const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
    const [userRoles, setUserRoles] = useState([]);
    const [granularPermissions, setGranularPermissions] = useState({});
    const [permissionsLoaded, setPermissionsLoaded] = useState(false);
    const [featureToggles, setFeatureToggles] = useState({
        userManagement: false,
        hr: false,
        customer: false,
        finance: false,
        inventory: false,
        purchases: false,
        sales: false,
        dashboard: false,
        tally: false,
    });

    useEffect(() => {
        const roles = getRoles();
        setUserRoles(roles);

        if (!isAuthenticated() || roles.length === 0) return;

        const fetchPermissions = async () => {
            try {
                // Fetch granular permissions for ALL roles the user has (including ADMIN)
                const allRolePerms = await Promise.all(
                    roles.map((roleName) => rolePermissionsApi.getByRole(roleName))
                );

                // Merge: ALLOW wins (union across all roles)
                const merged = {};
                allRolePerms.flat().forEach((rp) => {
                    const mod = rp.module;
                    if (!merged[mod]) {
                        merged[mod] = {
                            canView: false,
                            canCreate: false,
                            canEdit: false,
                            canApprove: false,
                            canExport: false,
                        };
                    }
                    merged[mod].canView    = merged[mod].canView    || rp.canView;
                    merged[mod].canCreate  = merged[mod].canCreate  || rp.canCreate;
                    merged[mod].canEdit    = merged[mod].canEdit    || rp.canEdit;
                    merged[mod].canApprove = merged[mod].canApprove || rp.canApprove;
                    merged[mod].canExport  = merged[mod].canExport  || rp.canExport;
                });

                setGranularPermissions(merged);

                // Enable featureToggles only for modules where canView is true
                const toggles = {};
                Object.keys(merged).forEach((mod) => {
                    toggles[mod] = merged[mod].canView;
                });
                setFeatureToggles((prev) => ({ ...prev, ...toggles }));
                setPermissionsLoaded(true);

            } catch (e) {
                console.warn('Could not load role permissions from API:', e);
                // Do NOT set permissionsLoaded = true on error.
                // Sidebar will keep using the role-based fallback so users
                // are never locked out due to a transient API failure.
            }
        };

        fetchPermissions();
    }, []);

    /**
     * Check if user can VIEW a module.
     * Default = false (DENY) if no permission row exists.
     */
    const canView = (module) =>
        granularPermissions[module?.toLowerCase()]?.canView ?? false;

    /**
     * Check if user can CREATE in a module.
     */
    const canCreate = (module) =>
        granularPermissions[module?.toLowerCase()]?.canCreate ?? false;

    /**
     * Check if user can EDIT in a module.
     */
    const canEdit = (module) =>
        granularPermissions[module?.toLowerCase()]?.canEdit ?? false;

    /**
     * Check if user can DELETE in a module (maps to canEdit in the permission model).
     */
    const canDelete = (module) =>
        granularPermissions[module?.toLowerCase()]?.canEdit ?? false;

    /**
     * Check if user can APPROVE in a module.
     */
    const canApprove = (module) =>
        granularPermissions[module?.toLowerCase()]?.canApprove ?? false;

    /**
     * Check if user can EXPORT from a module.
     */
    const canExport = (module) =>
        granularPermissions[module?.toLowerCase()]?.canExport ?? false;

    /**
     * Check if user has any of the specified roles.
     */
    const hasAnyRole = (...roles) =>
        roles.some((role) => userRoles.includes(role));

    /**
     * Legacy permission check for code using string-based permission names.
     * Falls back to role-based check if no granular data available.
     */
    const hasPermission = (permission) => {
        if (!permission) return false;
        // Legacy: check if any module grants the derived action
        const [modulePart] = permission.split('_');
        const mod = modulePart?.toLowerCase();
        if (granularPermissions[mod]) {
            const lower = permission.toLowerCase();
            if (lower.includes('_write') || lower.includes('_create')) return canCreate(mod);
            if (lower.includes('_read'))  return canView(mod);
        }
        return false;
    };

    const value = {
        userRoles,
        granularPermissions,
        featureToggles,
        permissionsLoaded,
        hasPermission,
        hasAnyRole,
        canView,
        canCreate,
        canEdit,
        canDelete,
        canApprove,
        canExport,
    };

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
};

/**
 * Hook to use permission context.
 */
export const usePermissions = () => {
    const context = useContext(PermissionContext);
    if (!context) {
        throw new Error('usePermissions must be used within PermissionProvider');
    }
    return context;
};

export default PermissionContext;
