import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { clientConfig } from "../../config/clientConfig";
import { TRIAL_NOTICE_PENDING_KEY, formatTrialRemaining, getTrialRemaining } from "../../utils/trialNotice";

function isNoticePending() {
  try {
    return sessionStorage.getItem(TRIAL_NOTICE_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Free-trial expiry warning shown once after login for clients whose
 * clientConfig declares `trial.expiresAt`. Mounted in the authenticated app shell.
 */
export default function TrialExpiryModal({ expiresAt = clientConfig.trial?.expiresAt }) {
  const [open, setOpen] = useState(() => Boolean(expiresAt) && isNoticePending());
  const [now, setNow] = useState(() => Date.now());

  const remaining = open ? getTrialRemaining(expiresAt, now) : null;
  const expired = remaining?.expired ?? false;

  useEffect(() => {
    if (!open || expired) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [open, expired]);

  const dismiss = () => {
    try {
      sessionStorage.removeItem(TRIAL_NOTICE_PENDING_KEY);
    } catch {
      // storage unavailable — closing the dialog is enough for this mount
    }
    setOpen(false);
  };

  if (!remaining) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md border-0 shadow-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#F5C742]" />
            {expired ? "Trial Expired" : "Free Trial Expiring"}
          </DialogTitle>
          <DialogDescription>
            {expired
              ? "Please contact BillBull to continue using the application."
              : "Please contact BillBull to keep using the application without interruption."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-[#FDE6A9] bg-[#FFF8E7] px-4 py-3 text-sm font-semibold text-[#1E293B]">
          {expired ? "Your free trial has expired." : "Your free trial is going to expire this weekend."}
        </div>

        {!expired && (
          <div className="space-y-1 text-center">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Time remaining</p>
            <p role="timer" className="text-xl font-bold tabular-nums text-[#1E293B]">
              {formatTrialRemaining(remaining)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button className="bg-[#F5C742] hover:bg-[#e6b838] text-[#1E293B] font-semibold" onClick={dismiss}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
