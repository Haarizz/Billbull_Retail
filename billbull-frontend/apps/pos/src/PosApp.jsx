import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import { CompanyProvider } from '@billbull/shared/context/CompanyContext';
import { BranchProvider } from '@billbull/shared/context/BranchContext';
import { PermissionProvider } from '@billbull/shared/context/PermissionContext';
import AedSymbolRenderer from '@billbull/shared/components/AedSymbolRenderer';
import AppAlertBridge from '@billbull/shared/components/AppAlertBridge';
import PosLogin from './shell/PosLogin';
import RequireAuth from './shell/RequireAuth';
import RequirePosAccess from './shell/RequirePosAccess';
import PosBootGate from './shell/PosBootGate';
import PosErrorBoundary from './shell/PosErrorBoundary';
import SessionLock from './shell/SessionLock';
import { ROUTER_BASENAME } from './shell/posPaths';
import TillWorkspace from './workspace/TillWorkspace';

// Standalone POS. Only what a till needs: no Retail sidebar, dashboards, notification centre,
// global search or back-office routes. Provider order matches Retail's (Company → Branch, then
// Permission once authenticated) because the shared contexts expect it.
//
//   /login  sign in (existing /api/auth/login)
//   /       auth → lock-on-expiry → error boundary → till permission → one branch → workspace
//   *       back to / (which sends signed-out users to /login)
export function TillRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PosLogin />} />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <PermissionProvider>
              <SessionLock>
                <PosErrorBoundary>
                  <RequirePosAccess>
                    <PosBootGate>
                      <TillWorkspace />
                    </PosBootGate>
                  </RequirePosAccess>
                </PosErrorBoundary>
              </SessionLock>
            </PermissionProvider>
          </RequireAuth>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function PosApp() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <CompanyProvider>
        <BranchProvider>
          <AedSymbolRenderer />
          <AppAlertBridge />
          <Toaster position="top-right" reverseOrder={false} containerStyle={{ zIndex: 10000 }} />
          <SonnerToaster position="top-right" richColors />
          <TillRoutes />
        </BranchProvider>
      </CompanyProvider>
    </BrowserRouter>
  );
}
