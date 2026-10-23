// Close Day confirmation — replaces the window.confirm that used to guard the Day Close
// Management "Close Day" button. Confirming only hands back to POSSales' handleCloseDay,
// which still runs every blocking-validation / supervisor guard itself.

import React from 'react';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent } from '../../../../../components/ui/dialog';

function CloseDayConfirmDialog({ open, onOpenChange, businessDate, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border border-gray-200 shadow-2xl rounded-2xl p-0 overflow-hidden gap-0 bg-white [&>button:last-child]:hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#FFF8E7] border border-[#FDE6A9]">
              <Lock className="h-5 w-5 text-[#d9a91f]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1E293B]">Close Business Day</h2>
              <p className="text-sm text-gray-500 mt-1">
                Close business day <span className="font-semibold text-[#1E293B]">{businessDate}</span>?
                This will finalize all sessions for the day.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-10 px-5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="h-10 px-5 text-sm font-bold text-[#1E293B] bg-[#F5C742] hover:bg-[#e6b838] rounded-xl shadow-sm flex items-center gap-2 transition-colors"
          >
            <Lock className="h-4 w-4" />Close Day
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CloseDayConfirmDialog;
