// Extracted verbatim from POSSales.jsx (R22 - Lock POS Dialog).
// Behaviour is unchanged; only the location moved. The Dialog's open expression, its
// onOpenChange handler, the PIN state and the Cancel / Lock Terminal handlers are still
// written in POSSales and passed straight through.

import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../../../components/ui/dialog';

function LockPosDialog({ open, onOpenChange, pin, onPinChange, onCancel, onLock }) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm border-0 shadow-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-[#F5C742]" /> Lock POS</DialogTitle>
            <DialogDescription>Enter a PIN to lock the POS terminal. Staff will need to enter this PIN to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Set PIN (4–6 digits)</label>
            <Input type="password" placeholder="Enter PIN…" value={pin} onChange={onPinChange} maxLength={6} className="h-11 text-center text-xl tracking-widest border-gray-200" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onCancel} className="border-gray-200">Cancel</Button>
            <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold" onClick={onLock}>
              <Lock className="h-4 w-4 mr-2" />Lock Terminal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

export default LockPosDialog;
