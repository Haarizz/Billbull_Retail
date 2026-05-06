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
    refreshPermissions();
  }, []);

  const refreshPermissions = async () => {
    if (!isAuthenticated()) return;

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

    /**
     * CORE PERMISSION LOGIC:
     * Check if user can perform an ACTION in a MODULE.
     * 1. If exact match exists (e.g. sales.quotation) -> use it (true or false).
     * 2. If no exact match AND it is a sub-key -> fallback to parent key (e.g. sales).
     * 3. Default to false.
     */
    const canAction = (module, action) => {
        const modKey = module?.toLowerCase();
        const actionKey = action?.replace('can', '').toLowerCase(); // match 'view', 'create', etc.

        // 1. Check Exact Match
        const exact = granularPermissions[modKey];
        if (exact && exact[actionKey] === true) {
            return true;
        }

        // 2. Check Parent Fallback (if it's a sub-key like sales.quotation)
        if (modKey?.includes('.')) {
            const parentKey = modKey.split('.')[0];
            const parent = granularPermissions[parentKey];
            if (parent && parent[actionKey] === true) {
                return true;
            }
        }

        // 3. Explicit check for EXACT false (if exact exists and is false, it means NO role granted it)
        // But since we are doing "ALLOW wins", we only return true if WE FOUND an allow.
        // If we reach here, neither exact nor parent was explicitly true.
        return false;
    };

    const canView    = (module) => canAction(module, 'view');
    const canCreate  = (module) => canAction(module, 'create');
    const canEdit    = (module) => canAction(module, 'edit');
    const canDelete  = (module) => canAction(module, 'edit');
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
