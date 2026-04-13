import React, { createContext, useContext, useState, useEffect } from 'react';
import { getRoles } from '../api/auth';

/**
 * Permission Context for RBAC throughout the application.
 * Provides permission checking functionality to all components.
 */
const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
    const [userRoles, setUserRoles] = useState([]);
    const [permissions, setPermissions] = useState(new Set());

    // Feature toggle states (read from backend or config)
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
        // Load user roles from JWT
        const roles = getRoles();
        setUserRoles(roles);

        // Calculate permissions based on roles
        const perms = new Set();

        if (roles.includes('ADMIN')) {
            // ADMIN has all permissions
            perms.add('ALL');
        }

        if (roles.includes('SALES')) {
            perms.add('SALES_READ');
            perms.add('SALES_WRITE');
            perms.add('CUSTOMER_READ');
            perms.add('CUSTOMER_WRITE');
            perms.add('PRODUCT_READ');
            perms.add('BARCODE_PRINT');
        }

        if (roles.includes('INVENTORY_MANAGER')) {
            perms.add('INVENTORY_READ');
            perms.add('INVENTORY_WRITE');
            perms.add('PURCHASE_READ');
            perms.add('PURCHASE_WRITE');
            perms.add('STOCK_TRANSFER');
        }

        if (roles.includes('ACCOUNTANT')) {
            perms.add('FINANCE_READ');
            perms.add('FINANCE_WRITE');
            perms.add('PURCHASE_PAYMENT');
            perms.add('SALES_PAYMENT');
            perms.add('VENDOR_LEDGER_VIEW');
            perms.add('SALARY_SUMMARY_VIEW');
        }

        if (roles.includes('HR')) {
            perms.add('EMPLOYEE_READ');
            perms.add('EMPLOYEE_WRITE');
            perms.add('SALARY_READ');
            perms.add('SALARY_WRITE');
        }

        setPermissions(perms);
    }, []);

    /**
     * Check if user has a specific permission.
     */
    const hasPermission = (permission) => {
        if (permissions.has('ALL')) return true;
        return permissions.has(permission);
    };

    /**
     * Check if user has any of the specified roles.
     */
    const hasAnyRole = (...roles) => {
        return roles.some(role => userRoles.includes(role));
    };

    /**
     * Check if RBAC is enabled for a specific module.
     */
    const isModuleRBACEnabled = (module) => {
        return featureToggles[module] || false;
    };

    /**
     * Generic permission checks for CRUD operations.
     */
    const canView = (module) => {
        if (!isModuleRBACEnabled(module)) return true;
        return hasPermission(`${module.toUpperCase()}_READ`) || hasPermission('ALL');
    };

    const canCreate = (module) => {
        if (!isModuleRBACEnabled(module)) return true;
        return hasPermission(`${module.toUpperCase()}_WRITE`) || hasPermission('ALL');
    };

    const canEdit = (module) => {
        if (!isModuleRBACEnabled(module)) return true;
        return hasPermission(`${module.toUpperCase()}_WRITE`) || hasPermission('ALL');
    };

    const canDelete = (module) => {
        if (!isModuleRBACEnabled(module)) return true;
        return hasPermission(`${module.toUpperCase()}_WRITE`) || hasPermission('ALL');
    };

    const value = {
        userRoles,
        permissions,
        hasPermission,
        hasAnyRole,
        isModuleRBACEnabled,
        canView,
        canCreate,
        canEdit,
        canDelete,
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
