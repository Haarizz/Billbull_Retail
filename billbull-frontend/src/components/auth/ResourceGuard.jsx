import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../context/PermissionContext';
import { ShieldAlert, Lock } from 'lucide-react';

/**
 * ResourceGuard protects routes and UI sections based on granular permissions.
 * 
 * @param {string} module - The module/resource key (e.g., 'sales.invoice')
 * @param {string} action - The action to check ('view', 'create', 'edit', 'approve', 'export')
 * @param {React.ReactNode} children - Content to show if access is granted
 * @param {boolean} showMessage - If true, shows "Access Denied" UI; if false, redirects to Dashboard
 */
const ResourceGuard = ({ 
  module, 
  action = 'view', 
  children, 
  showMessage = true 
}) => {
  const { canAction, permissionsLoaded } = usePermissions();

  if (!permissionsLoaded) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const hasAccess = canAction(module, action);

  if (!hasAccess) {
    if (!showMessage) {
      return <Navigate to="/" replace />;
    }

    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <ShieldAlert size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Access Restricted</h3>
        <p className="text-slate-500 text-center max-w-sm mb-6 text-sm">
          You don't have permission to <span className="font-bold text-slate-700">{action}</span> in 
          the <span className="font-bold text-slate-700">{module}</span> module. 
          Please contact your administrator to request access.
        </p>
        <button 
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
        >
          <Lock size={16} /> Go Back
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ResourceGuard;
