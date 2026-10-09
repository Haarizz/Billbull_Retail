import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { logClientError, logClientEvent } from '@billbull/shared/utils/clientLogger';
import { signOutOfTill } from './signOut';
import TillScreen, { tillButton, tillSecondaryButton } from './TillScreen';

// Browser extensions occasionally inject DOM nodes that desync React (removeChild/insertBefore
// NotFoundError). Those are recoverable without user action — same policy as Retail's boundary.
export const isRecoverableDomError = (error) =>
  error?.name === 'NotFoundError' &&
  (error?.message?.includes('removeChild') || error?.message?.includes('insertBefore'));

const MAX_DOM_RETRIES = 10;

/**
 * Till error boundary. It never reloads the page on its own: a render crash has already unmounted
 * the workspace below it, so the operator decides — return to the till (session, terminal and
 * business day are reloaded from the server; the unfinished sale on screen must be re-entered) or
 * reload the POS. Nothing is written to storage and no diagnostic dump is shown beyond the message.
 */
export default class PosErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.domRetries = 0;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isRecoverableDomError(error)) {
      logClientEvent('warn', 'POS: recoverable browser DOM mutation error', {
        componentStack: info?.componentStack, errorName: error?.name, errorMessage: error?.message,
      });
      if (this.domRetries < MAX_DOM_RETRIES) {
        this.domRetries += 1;
        const delay = Math.min(50 * 2 ** (this.domRetries - 1), 1000);
        setTimeout(() => this.setState({ error: null }), delay);
      }
      return;
    }
    logClientError('POS ErrorBoundary caught', error, { componentStack: info?.componentStack });
  }

  reset = () => {
    this.domRetries = 0;
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isRecoverableDomError(error) && this.domRetries < MAX_DOM_RETRIES) return null;
    return (
      <TillScreen title="The till hit a problem" subtitle="Nothing has been reloaded automatically." tone="danger">
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="space-y-1">
            <p>Completed sales are safe on the server. Any sale that was still being built on screen will need to be entered again.</p>
            {error?.message && <p className="font-mono text-xs text-amber-900/80 break-words">{error.message}</p>}
          </div>
        </div>
        <div className="space-y-3">
          <button type="button" className={tillButton} onClick={this.reset}>Return to the till</button>
          <button type="button" className={tillSecondaryButton} onClick={() => window.location.reload()}>Reload POS</button>
          <button type="button" className={tillSecondaryButton} onClick={() => signOutOfTill()}>Sign out</button>
        </div>
      </TillScreen>
    );
  }
}
