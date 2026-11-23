import { useState } from 'react';
import { errorMessage, platformApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Field, Input, PageHeader } from '../ui/kit';

export default function AccountPage({ forced = false }) {
  const { user, refresh, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  const change = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ kind: 'error', text: 'The new passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      await platformApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ kind: 'success', text: 'Password changed.' });
      await refresh();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const everywhere = async () => {
    try {
      await platformApi.signOutEverywhere();
    } finally {
      signOut();
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Your account" subtitle={`${user?.email} · ${user?.role}`} />
      {forced && <div className="mb-4"><Alert kind="warn">Choose a new password before you continue. The one you signed in with was temporary.</Alert></div>}
      <Card title="Change password">
        <form onSubmit={change} className="space-y-4">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
          <Field label="New password" hint="At least 12 characters. A short sentence works well."><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} required /></Field>
          <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
          <Alert kind={msg.kind || 'error'}>{msg.text}</Alert>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
        </form>
      </Card>
      {!forced && (
        <Card title="Sessions" className="mt-6">
          <p className="mb-3 text-sm text-slate-600">Signs you out on every browser, including this one.</p>
          <Button variant="secondary" onClick={everywhere}>Sign out everywhere</Button>
        </Card>
      )}
    </div>
  );
}
