import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { usePermissions } from '@billbull/shared/context/PermissionContext';
import { TILL_PERMISSIONS, canOperateTill } from './posAccess';
import { signOutOfTill } from './signOut';
import TillScreen, { TillSpinner, tillButton, tillSecondaryButton } from './TillScreen';

const SLOW_PERMISSIONS_MS = 8000;

// Admits only users who may operate the till (see posAccess.TILL_PERMISSIONS). The decision
// latches once granted: the 5-minute permission poll must not unmount a sale in progress — the
// backend still authorizes every request on its own.
export default function RequirePosAccess({ children }) {
  const { permissionsLoaded, canView, refreshPermissions } = usePermissions();
  const [granted, setGranted] = useState(false);
  const [slow, setSlow] = useState(false);

  const allowed = permissionsLoaded && canOperateTill(canView);
  useEffect(() => {
    if (allowed) setGranted(true);
  }, [allowed]);

  useEffect(() => {
    if (permissionsLoaded) return undefined;
    const t = setTimeout(() => setSlow(true), SLOW_PERMISSIONS_MS);
    return () => clearTimeout(t);
  }, [permissionsLoaded]);

  if (granted || allowed) return children;

  if (!permissionsLoaded) {
    return (
      <TillScreen title="Starting the till" subtitle="Checking your permissions">
        <TillSpinner />
        {slow && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-sm text-gray-500">This is taking longer than usual. Check the connection, then retry.</p>
            <button type="button" className={tillButton} onClick={() => { setSlow(false); refreshPermissions(); }}>Retry</button>
            <button type="button" className={tillSecondaryButton} onClick={() => signOutOfTill({ confirmDiscard: false })}>Sign out</button>
          </div>
        )}
      </TillScreen>
    );
  }

  return (
    <TillScreen title="No till access" subtitle="This account isn't allowed to operate the POS till." tone="danger">
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <p>
          The till needs view access to {TILL_PERMISSIONS.map((m) => <code key={m} className="mx-0.5 font-semibold">{m}</code>)}.
          Ask an administrator to grant it in Roles &amp; Permissions.
        </p>
      </div>
      <button type="button" className={tillButton} onClick={() => signOutOfTill({ confirmDiscard: false })}>Sign in as someone else</button>
    </TillScreen>
  );
}
