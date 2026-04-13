import { usePermissions } from '../context/PermissionContext';

/**
 * Custom hook for module-specific permission checks.
 * 
 * Usage:
 * const { canView, canCreate, canEdit, canDelete } = usePermission('INVENTORY');
 * 
 * @param {string} module - Module name (e.g., 'INVENTORY', 'SALES', 'FINANCE')
 */
export const usePermission = (module) => {
    const { canView, canCreate, canEdit, canDelete, hasAnyRole, hasPermission } = usePermissions();

    return {
        canView: canView(module),
        canCreate: canCreate(module),
        canEdit: canEdit(module),
        canDelete: canDelete(module),
        hasAnyRole,
        hasPermission,
    };
};

export default usePermission;
