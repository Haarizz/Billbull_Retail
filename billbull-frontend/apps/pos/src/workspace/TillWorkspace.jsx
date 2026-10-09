import { LogOut } from 'lucide-react';
import POSSales from '@billbull/shared/pages/Sales/POSSales';
import { PosHostContext, STANDALONE_POS_HOST } from '@billbull/shared/pages/Sales/POS/posHost';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { signOutOfTill } from '../shell/signOut';

// The till: the existing POS workspace (Classic / Compact / Cart Focus, Console, reports, returns,
// layaways, held sales, delivery, devices and printing — all chosen and owned inside POSSales)
// beside a slim rail. The rail takes the width Retail's collapsed sidebar (70px) took, so every
// POS layout keeps the geometry it was built for, including the full-height selling screen.
export default function TillWorkspace() {
  return (
    <PosHostContext.Provider value={STANDALONE_POS_HOST}>
      <div className="flex h-screen w-full overflow-hidden bg-[#F7F7FA]">
        <TillRail />
        <main className="relative h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <POSSales />
        </main>
      </div>
    </PosHostContext.Provider>
  );
}

const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';

function TillRail() {
  const { activeBranch } = useBranch();
  const fullName = sessionStorage.getItem('fullName') || sessionStorage.getItem('user') || '';
  const branchLabel = activeBranch?.code || activeBranch?.name || '';

  return (
    <nav aria-label="Till" className="flex h-full w-16 flex-shrink-0 flex-col items-center justify-between bg-[#1C2838] py-4 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5C742] text-sm font-extrabold text-[#1C2838]" title="BillBull POS">BB</div>
        {branchLabel && (
          <div className="max-w-[56px] truncate rounded-md bg-white/10 px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide"
            title={activeBranch?.name || branchLabel}>
            {branchLabel}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-bold" title={fullName}>
          {initials(fullName)}
        </div>
        <button type="button" onClick={() => signOutOfTill()} title="Sign out" aria-label="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}
