// Extracted verbatim from POSSales.jsx (R22 - POS Locked Overlay).
// Behaviour is unchanged; only the location moved. The posLocked guard, the PIN state and
// the unlock comparison are still written in POSSales and passed straight through.

import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';

function PosLockedOverlay({ unlockPin, onUnlockPinChange, onUnlock }) {
  return (
        <div className="fixed inset-0 z-[100] bg-[#1E293B] flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#F5C742]/10 border-2 border-[#F5C742] flex items-center justify-center">
            <Lock className="h-10 w-10 text-[#F5C742]" />
          </div>
          <h2 className="text-white text-2xl font-bold">POS Terminal Locked</h2>
          <p className="text-gray-400 text-sm">Enter your PIN to unlock</p>
          <div className="w-64 space-y-3">
            <Input type="password" placeholder="Enter PIN..." value={unlockPin} onChange={onUnlockPinChange}
              className="text-center text-lg bg-white/10 border-white/20 text-white placeholder-gray-500" />
            <Button className="w-full bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-bold"
              onClick={onUnlock}>
              Unlock
            </Button>
          </div>
        </div>
  );
}

export default PosLockedOverlay;
