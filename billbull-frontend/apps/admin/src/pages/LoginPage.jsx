import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Field, Input } from '../ui/kit';

/**
 * Three steps: password → (first time) scan the QR code and confirm a code → (afterwards) the
 * six-digit code from the authenticator app. Each step's challenge is valid for five minutes.
 */
export default function LoginPage() {
  const { completeSignIn } = useAuth();
  const [step, setStep] = useState({ stage: 'PASSWORD' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (step.stage === 'MFA_SETUP' && step.otpauthUri) {
      QRCode.toDataURL(step.otpauthUri, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
    }
  }, [step]);

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await platformApi.login(email.trim(), password);
      setPassword('');
      if (r.stage === 'DONE') completeSignIn(r);
      else setStep(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = step.stage === 'MFA_SETUP'
        ? await platformApi.enrollMfa(step.challenge, code.trim())
        : await platformApi.verifyMfa(step.challenge, code.trim());
      completeSignIn(r);
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      if (err?.response?.data?.code === 'CHALLENGE_EXPIRED') setStep({ stage: 'PASSWORD' });
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#FFF8E7] to-white p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#FDE6A9] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5C742] font-extrabold text-slate-900">BB</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">BillBull Platform</h1>
            <p className="text-xs text-slate-500">Staff sign-in. Client accounts sign in on their own site.</p>
          </div>
        </div>

        {step.stage === 'PASSWORD' && (
          <form onSubmit={submitPassword} className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Alert>{error}</Alert>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</Button>
          </form>
        )}

        {(step.stage === 'MFA' || step.stage === 'MFA_SETUP') && (
          <form onSubmit={submitCode} className="space-y-4">
            {step.stage === 'MFA_SETUP' ? (
              <>
                <Alert kind="info">Two-step sign-in is required. Scan this code with an authenticator app (Google or Microsoft Authenticator, 1Password…), then enter the six-digit code it shows.</Alert>
                {qr && <img src={qr} alt="Authenticator QR code" className="mx-auto h-48 w-48" />}
                <p className="break-all text-center font-mono text-xs text-slate-500">{step.secret}</p>
              </>
            ) : (
              <p className="text-sm text-slate-600">Enter the six-digit code from your authenticator app.</p>
            )}
            <Field label="Code">
              <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            </Field>
            <Alert>{error}</Alert>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Verifying…' : 'Sign in'}</Button>
            <button type="button" className="w-full text-xs text-slate-500 hover:text-slate-700" onClick={() => { setStep({ stage: 'PASSWORD' }); setError(''); }}>
              Start again
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
