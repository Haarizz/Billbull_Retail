// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// Console -> Behavior tab. The two handlers and the three pieces of state they drive
// moved here unchanged: same defaults, same coercions, same validation order, same API
// call sequencing, same alert/console messages, same 2s saved-flash timeout.
//
// settingsSaving / settingsSavedFlash are deliberately still exposed as setters: POSConsole
// reuses the same "saving" spinner and "saved" flash for its template and layout saves, so
// they are part of the existing contract rather than internal state.
import { useState } from 'react';

import { getPosSettings, savePosSettings } from '../../../../../api/posApi';
import { mergeSavedPosSettings } from '../../posUtils';

/**
 * @param {object}   args
 * @param {object|null} args.posSettings          the live POS settings object
 * @param {Function} args.setPosSettings          setter for the above (merge-aware)
 * @param {object}   args.businessDayRefreshRef   ref holding the business-day re-poll fn
 */
export function usePosBehaviourSettings({ posSettings, setPosSettings, businessDayRefreshRef } = {}) {
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedFlash, setSettingsSavedFlash] = useState(false);

  const beginEditSettings = () => {
    setSettingsDraft({
      requireSupervisorForVoid: !!posSettings?.requireSupervisorForVoid,
      requireSupervisorForDayClose: !!posSettings?.requireSupervisorForDayClose,
      supervisorApprovalMode: posSettings?.supervisorApprovalMode === 'PASSWORD' ? 'PASSWORD' : 'PIN',
      requirePriceOverrideApproval: !!posSettings?.requirePriceOverrideApproval,
      // Write-only — the backend never returns the raw PIN (see supervisorPinSet on posSettings).
      supervisorPin: '',
      voidMode: posSettings?.voidMode === 'DELETE' ? 'DELETE' : 'VOID',
      productEntryMode: posSettings?.productEntryMode || 'DIRECT_ADD',
      cartViewMode: posSettings?.cartViewMode === 'DETAILED' ? 'DETAILED' : 'MINIMAL',
      cartShowBarcode: posSettings?.cartShowBarcode !== false,
      cartShowProductCode: posSettings?.cartShowProductCode !== false,
      cartShowBatchNumber: posSettings?.cartShowBatchNumber !== false,
      cartShowSerialNumber: !!posSettings?.cartShowSerialNumber,
      cartShowExpiryDate: !!posSettings?.cartShowExpiryDate,
      cashDrawerTriggers: posSettings?.cashDrawerTriggers ?? 'CASH_PAYMENT,CHANGE_RETURN,CASH_DROP,CASH_OUT,MANUAL_OPEN',
      operatingHoursEnabled: !!posSettings?.operatingHoursEnabled,
      operatingStartTime: posSettings?.operatingStartTime || '',
      operatingEndTime: posSettings?.operatingEndTime || '',
      businessDayExtensionMinutes: posSettings?.businessDayExtensionMinutes ?? 0,
    });
    // Refresh the stored settings alongside opening the editor, so the server-computed
    // Business Day schedule lock (businessDayScheduleLocked — sessions opened or closed since
    // this screen loaded) is current when the admin starts editing. The draft above is
    // seeded from the copy already in hand; only the read-only lock projection is at stake,
    // and the backend re-checks it under a row lock on save regardless.
    getPosSettings()
      .then(fresh => { if (fresh) setPosSettings(prev => mergeSavedPosSettings(prev, fresh)); })
      .catch(err => console.warn('Could not refresh POS settings before editing', err));
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    if (settingsDraft.operatingHoursEnabled && (!settingsDraft.operatingStartTime || !settingsDraft.operatingEndTime)) {
      window.alert('Business Day Start Time and End Time are required when the Business Day Window is enabled.');
      return;
    }
    if (settingsDraft.creditVoucherExpiryMode === 'MANUAL' && !settingsDraft.creditVoucherExpiryDate) {
      window.alert('Choose the date credit vouchers should expire on.');
      return;
    }
    setSettingsSaving(true);
    try {
      const payload = { ...(posSettings || {}), ...settingsDraft };
      // The number/date inputs yield '' when cleared, which is not a number or a date.
      // The backend re-validates all of this; normalising here just avoids sending it a
      // body it would reject for a type error rather than for the real problem.
      if (payload.creditVoucherExpiryMonths === '') payload.creditVoucherExpiryMonths = null;
      if (payload.creditVoucherExpiryDate === '') payload.creditVoucherExpiryDate = null;
      console.log('SAVING POS SETTINGS PAYLOAD:', payload);
      const saved = await savePosSettings(payload);
      setPosSettings(prev => mergeSavedPosSettings(prev, saved || payload));
      setSettingsDraft(null);
      // Start/end/extension feed the server-resolved Business Day phase. Without an
      // immediate re-poll the chip and banner would keep showing the old window
      // (and the old countdown) until the next 60s poll.
      businessDayRefreshRef.current?.();
      setSettingsSavedFlash(true);
      setTimeout(() => setSettingsSavedFlash(false), 2000);
    } catch (err) {
      console.warn('Failed to save POS settings', err);
      // A rejection must never be applied optimistically: the backend refuses a Business Day
      // schedule change while sessions are open or in closure, and quietly honoring it locally
      // would leave the POS running a window the server does not agree with. Surface the
      // server's own message and drop the draft, so the fields visibly return to the stored
      // (still authoritative) values rather than silently reverting without explanation.
      const serverMessage = err?.response?.data?.message || err?.response?.data?.error;
      window.alert(serverMessage || 'Could not save POS settings. Please try again.');
      setSettingsDraft(null);
    } finally {
      setSettingsSaving(false);
    }
  };

  return {
    settingsDraft, setSettingsDraft,
    settingsSaving, setSettingsSaving,
    settingsSavedFlash, setSettingsSavedFlash,
    beginEditSettings, handleSaveSettings,
  };
}

export default usePosBehaviourSettings;
