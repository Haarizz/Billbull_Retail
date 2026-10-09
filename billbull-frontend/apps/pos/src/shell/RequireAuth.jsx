import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '@billbull/shared/api/auth';

// Checked once, when the till mounts. A token that expires later mid-shift is handled by
// SessionLock (re-authenticate in place) — never by unmounting the workspace and its cart.
export default function RequireAuth({ children }) {
  const [authenticated] = useState(() => isAuthenticated());
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}
