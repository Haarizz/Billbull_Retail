import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { enterOffline, offlineEntryProfile } from '@billbull/shared/pages/Sales/POS/offline/offlineRuntime';
import { useOfflineState } from '@billbull/shared/pages/Sales/POS/offline/OfflineStatusPanel';

/**
 * M3: when the server cannot be reached and this till holds a valid offline lease, the session
 * owner it was issued to can carry on selling offline (decision D12: session owner only). No token
 * is created; the next sign-in once the server is back is an ordinary one, and only then does the
 * till synchronise.
 */
export default function OfflineEntry({ onEntered }) {
  const s = useOfflineState();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const offline = s?.connectivity === 'offline';

  useEffect(() => {
    let cancelled = false;
    if (offline) offlineEntryProfile().then((p) => { if (!cancelled) setProfile(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [offline, s?.lease?.leaseId]);

  if (!offline) return null;
  return (
    <div data-testid="offline-entry" className="relative z-10 mx-auto mt-4 w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow">
      <div className="flex items-start gap-3">
        <CloudOff className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">The server cannot be reached.</p>
          {profile ? (
            <>
              <p className="mt-1">This till may sell offline (cash only) under its offline authorisation until {new Date(s.lease.claims.exp * 1000).toLocaleTimeString()}.</p>
              <button type="button" data-testid="offline-entry-continue"
                onClick={async () => { try { await enterOffline(); onEntered(); } catch (e) { setError(e.message); } }}
                className="mt-3 w-full rounded-xl bg-[#F5C742] px-4 py-2.5 font-bold text-[#1A1A1A] hover:bg-[#E5B732]">
                Continue offline as {profile.fullName || profile.user}
              </button>
            </>
          ) : (
            <p className="mt-1">This till has no valid offline authorisation, so it cannot sell until the server is back.</p>
          )}
          {error && <p className="mt-2 text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}
