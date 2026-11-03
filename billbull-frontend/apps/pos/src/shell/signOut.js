import { confirmDialog } from '@billbull/shared/components/AppConfirmBridge';
import { clearTillSession } from './posAccess';
import { tillUrl } from './posPaths';

// Ends this person's use of the till: clears their tab session and reloads the POS login, which
// also drops any in-memory sale. The POS *session* (cash drawer shift) is server state and stays
// open, exactly as when signing out of Retail; closing it is the Close Session flow.
export async function signOutOfTill({ confirmDiscard = true } = {}) {
  if (confirmDiscard && !(await confirmDialog({
    title: 'Sign out of the till?',
    message: 'Any sale in progress on this screen will be discarded. Your POS session stays open.',
    confirmLabel: 'Sign out',
    tone: 'warning',
  }))) {
    return false;
  }
  clearTillSession();
  window.location.assign(tillUrl('login'));
  return true;
}
