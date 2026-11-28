import { useState } from 'react';
import { errorMessage } from '../../../api/client';
import { Alert, Button, Field, Input, Modal } from '../../../ui/kit';

export const errorCode = (e) => e?.response?.data?.code || '';

const isStepUp = (e) => ['STEP_UP_REQUIRED', 'STEP_UP_INVALID'].includes(errorCode(e));

/**
 * Runs `fn(code)` first without a code; when the platform answers 403 STEP_UP_REQUIRED (no fresh
 * authenticator code in the last 5 minutes) it asks for one and runs `fn(code)` again. Resolves to
 * the result, or to null if the user cancels.
 */
export function useStepUp() {
  const [pending, setPending] = useState(null);

  const run = (fn, purpose) => new Promise((resolve, reject) => {
    fn(null).then(resolve).catch((e) => {
      if (isStepUp(e)) setPending({ fn, resolve, reject, purpose, error: '' });
      else reject(e);
    });
  });

  const submit = async (code) => {
    const p = pending;
    try {
      const r = await p.fn(code);
      setPending(null);
      p.resolve(r);
    } catch (e) {
      if (isStepUp(e)) setPending({ ...p, error: errorMessage(e) });
      else {
        setPending(null);
        p.reject(e);
      }
    }
  };

  const cancel = () => {
    const p = pending;
    setPending(null);
    p?.resolve(null);
  };

  const modal = pending ? <StepUpModal purpose={pending.purpose} error={pending.error} onSubmit={submit} onCancel={cancel} /> : null;
  return { run, modal };
}

function StepUpModal({ purpose, error, onSubmit, onCancel }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(code.replace(/\s/g, ''));
    } finally {
      setBusy(false);
      setCode('');
    }
  };
  return (
    <Modal title="Confirm it's you" onClose={onCancel}>
      <form onSubmit={go} className="space-y-4">
        <p className="text-sm text-slate-600">
          {purpose || 'This action'} needs a fresh code from your authenticator app. It unlocks sensitive database actions for 5 minutes.
        </p>
        <Alert>{error}</Alert>
        <Field label="Authenticator code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={7}
            placeholder="123456"
            autoFocus
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>{busy ? 'Checking…' : 'Confirm'}</Button>
        </div>
      </form>
    </Modal>
  );
}
