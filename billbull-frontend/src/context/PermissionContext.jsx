import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

  const pollIntervalRef = useRef(null);

  const refreshPermissions = async () => {
    if (!isAuthenticated()) return;

    // Roles come straight from the JWT — needed by hasAnyRole() for the few
    // role-gated (rather than permission-gated) UI branches.
    setUserRoles(getRoles());

    try {
      const merged = await rolePermissionsApi.getMyPermissions();
      setGranularPermissions(merged);

      // Feature toggles fallback to top-level view permissions
      const toggles = {};
      Object.keys(merged).forEach((mod) => {
        if (!mod.includes('.')) {
          toggles[mod] = merged[mod].view;
        }
      });
      setFeatureToggles((prev) => ({ ...prev, ...toggles }));
      setPermissionsLoaded(true);
    } catch (e) {
      console.warn('Could not load role permissions from /api/rbac/me:', e);
    }
  };

  useEffect(() => {
    refreshPermissions();

    // Poll every 5 minutes so permission changes take effect without requiring logout
    pollIntervalRef.current = setInterval(() => {
      if (isAuthenticated()) refreshPermissions();
    }, 5 * 60 * 1000);

    return () => clearInterval(pollIntervalRef.current);
  }, []);

    /**
     * CORE PERMISSION LOGIC — mirrors backend ModulePermissionService exactly:
     * 1. If an explicit row exists for the key (e.g. sales.quotation), that row is
     *    AUTHORITATIVE — its value is returned even when false. An explicit deny
     *    must not be overridden by a broader parent grant.
     * 2. Only when NO explicit row exists does a sub-key fall back to its parent
     *    (e.g. sales.quotation -> sales).
     * 3. Default to DENY.
     */
    const canAction = (module, action) => {
        const modKey = module?.toLowerCase();
        const actionKey = action?.replace('can', '').toLowerCase(); // match 'view', 'create', etc.

        // 1. Explicit row — authoritative (merged ALLOW-wins union across roles)
        const exact = granularPermissions[modKey];
        if (exact !== undefined) {
            return exact[actionKey] === true;
        }

        // 2. Parent fallback only when no explicit row exists
        if (modKey?.includes('.')) {
            const parentKey = modKey.split('.')[0];
            const parent = granularPermissions[parentKey];
            if (parent && parent[actionKey] === true) {
                return true;
            }
        }

        // 3. Default DENY
        return false;
    };

    const canView    = (module) => canAction(module, 'view');
    const canCreate  = (module) => canAction(module, 'create');
    const canEdit    = (module) => canAction(module, 'edit');
    const canDelete  = (module) => canAction(module, 'delete');
    const canApprove = (module) => canAction(module, 'approve');
    const canExport  = (module) => canAction(module, 'export');

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
        const exactKey = permission.toLowerCase();
        const exactPermission = granularPermissions[exactKey];
        if (exactPermission) {
            return Boolean(
                exactPermission.view ||
                exactPermission.create ||
                exactPermission.edit ||
                exactPermission.delete ||
                exactPermission.approve ||
                exactPermission.export
            );
        }

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
        refreshPermissions,
        hasPermission,
        hasAnyRole,
        canView,
        canAction,
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
