import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { resolveTillBranch } from './posAccess';
import { signOutOfTill } from './signOut';
import TillScreen, { TillSpinner, tillButton, tillSecondaryButton } from './TillScreen';

// Shell-level boot: settle on exactly one branch before the workspace mounts, so no POS request
// is ever sent under "All Branches". Terminal registration/resume, POS settings, tax config,
// business day and session resolution stay where they already live — inside the POS workspace's
// own hooks (usePosSession and friends) — and are not re-implemented here.
//
// Once ready the gate latches: a later BranchProvider reload must not unmount a sale in progress.
export default function PosBootGate({ children }) {
  const { isLoading, activeBranchId, branches, canSwitchBranches, defaultBranch, switchBranch, formatBranchLabel } = useBranch();
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  const decision = useMemo(
    () => (isLoading ? null : resolveTillBranch({ activeBranchId, branches, canSwitchBranches, defaultBranch })),
    [isLoading, activeBranchId, branches, canSwitchBranches, defaultBranch],
  );

  const select = useCallback(async (branchId) => {
    setSwitching(true);
    setError(null);
    try {
      await switchBranch(branchId);
    } catch (e) {
      setError(
        e?.isPosConflict
          ? 'You already have an open POS session on another branch. Close or transfer it before using this branch.'
          : e?.response?.data?.message || e?.message || 'Could not switch to that branch.',
      );
    } finally {
      setSwitching(false);
    }
  }, [switchBranch]);

  // Latch during render (React's "store information from previous renders" pattern).
  if (decision?.status === 'ready' && !ready) setReady(true);

  useEffect(() => {
    if (decision?.status === 'select' && !switching && !error) select(decision.branchId);
  }, [decision, switching, error, select]);

  if (ready || decision?.status === 'ready') return children;

  if (!decision || decision.status === 'select') {
    return (
      <TillScreen title="Starting the till" subtitle="Loading your branch">
        <TillSpinner />
        {error && <BootError error={error} onRetry={() => setError(null)} />}
      </TillScreen>
    );
  }

  if (decision.status === 'none') {
    return (
      <TillScreen title="No branch available" subtitle="This account has no branch it can sell from." tone="danger">
        <button type="button" className={tillButton} onClick={() => signOutOfTill({ confirmDiscard: false })}>Sign in as someone else</button>
      </TillScreen>
    );
  }

  return (
    <TillScreen title="Choose a branch" subtitle="The till sells from one branch at a time.">
      <div className="space-y-2" role="list">
        {decision.options.map((branch) => (
          <button key={branch.id} type="button" role="listitem" disabled={switching}
            onClick={() => select(branch.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-[#F5C742] hover:bg-[#FFF8E7] disabled:opacity-50">
            <Building2 className="h-5 w-5 flex-shrink-0 text-[#b8920e]" />
            <span className="flex-1">
              <span className="block font-semibold text-[#1E293B]">{formatBranchLabel(branch)}</span>
              {branch.defaultWarehouseName && <span className="block text-xs text-gray-500">{branch.defaultWarehouseName}</span>}
            </span>
            {branch.isDefault && <span className="rounded-full bg-[#FFF8E7] px-2 py-0.5 text-xs font-semibold text-[#8a6a10]">Default</span>}
          </button>
        ))}
      </div>
      {switching && <TillSpinner label="Switching branch…" />}
      {error && <BootError error={error} onRetry={() => setError(null)} />}
      <button type="button" className={`${tillSecondaryButton} mt-4`} onClick={() => signOutOfTill({ confirmDiscard: false })}>Sign out</button>
    </TillScreen>
  );
}

function BootError({ error, onRetry }) {
  return (
    <div className="mt-4 space-y-3">
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      <button type="button" className={tillButton} onClick={onRetry}>Try again</button>
    </div>
  );
}
