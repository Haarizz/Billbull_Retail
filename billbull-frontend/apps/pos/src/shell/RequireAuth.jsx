import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '@billbull/shared/api/auth';
import { isOfflineEntry } from '@billbull/shared/pages/Sales/POS/offline/offlineRuntime';

// M3: an offline sign-in (OfflineEntry) has no token; it is admitted on its offline lease.
// Checked once, when the till mounts. A token that expires later mid-shift is handled by
// SessionLock (re-authenticate in place) — never by unmounting the workspace and its cart.
export default function RequireAuth({ children }) {
  const [authenticated] = useState(() => isAuthenticated() || isOfflineEntry());
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}
