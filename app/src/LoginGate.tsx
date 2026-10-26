/* =====================================================================
   LoginGate.tsx — the sign-in screen shown whenever there's no live
   session. Reps sign in with their Program Directory username (or email)
   and password via /b/claim login, which stores a 3-hour session; then the
   parent re-probes the session. "Forgot password?" swaps in a two-step
   reset: request a code, then the code + a new password (which also signs
   them in). ?u=<username> prefills the username (the claim flow links here).
   ===================================================================== */

import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiLogin, apiResetFinish, apiResetStart } from './api';
import { RecaptchaNote } from './ClaimFlow';
import { Wordmark } from './ui';

type Mode = 'signIn' | 'resetRequest' | 'resetFinish';
const MIN_PASSWORD = 10;

export default function LoginGate({ onAuthenticated, expired = false }: { onAuthenticated: () => void; expired?: boolean }) {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState(params.get('u') || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(expired ? 'Your session expired. Please sign in again.' : null);

  const [resetToken, setResetToken] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setBusy(true);
    try {
      await apiLogin(username.trim(), password);
      onAuthenticated();
      // keep the button busy while the parent swaps the view
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }

  async function handleResetRequest(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!username.trim()) {
      setError('Enter your username or email.');
      return;
    }
    setBusy(true);
    try {
      const r = await apiResetStart(username.trim());
      setResetToken(r.token);
      setCode('');
      setNotice('If an account matches, we emailed a 6-digit code to its address. It expires in 15 minutes.');
      setMode('resetFinish');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetFinish(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('Enter the 6-digit code from the email.');
    if (newPassword.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (newPassword !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await apiResetFinish(resetToken, digits, newPassword);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
  }

  const alerts = (
    <>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="callout callout-info" role="status"><span>{notice}</span></div> : null}
    </>
  );

  return (
    <div className="login">
      {/* Left: brand panel (hidden on small screens) */}
      <aside className="login-brand" aria-hidden="true">
        <div className="login-brand-inner">
          <p className="eyebrow eyebrow-onbrand">BlueStep Program Directory</p>
          <p className="login-brand-lead">
            Your program, described by the people who run it.
          </p>
          <p className="login-brand-sub">
            Keep your listing current: what you treat, who you serve, and who a consultant should call.
          </p>
        </div>
        <div className="login-brand-footer">Free for every program, always.</div>
      </aside>

      {/* Right: sign-in / reset */}
      <main className="login-panel">
        {mode === 'signIn' ? (
          <form className="login-form" onSubmit={handleSignIn} noValidate>
            <Wordmark />
            <h1 className="login-title">Sign in</h1>
            <p className="login-hint">Use the username and password you created when you claimed your program.</p>
            {alerts}

            <label className="field">
              <span className="field-label">Username or email</span>
              <input
                className="input"
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
                autoFocus={!username}
              />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoFocus={!!username}
              />
            </label>

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="link-btn" onClick={() => switchMode('resetRequest')} disabled={busy}>
              Forgot your password?
            </button>

            <p className="login-alt">
              New here? <Link to="/">Find and claim your program</Link>
            </p>
            <RecaptchaNote />
          </form>
        ) : mode === 'resetRequest' ? (
          <form className="login-form" onSubmit={handleResetRequest} noValidate>
            <Wordmark />
            <h1 className="login-title">Reset your password</h1>
            <p className="login-hint">Enter your username or the email on your account. We&rsquo;ll email you a code.</p>
            {alerts}

            <label className="field">
              <span className="field-label">Username or email</span>
              <input
                className="input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            <button type="button" className="link-btn" onClick={() => switchMode('signIn')} disabled={busy}>
              Back to sign in
            </button>
            <RecaptchaNote />
          </form>
        ) : (
          <form className="login-form" onSubmit={handleResetFinish} noValidate>
            <Wordmark />
            <h1 className="login-title">Choose a new password</h1>
            {alerts}

            <label className="field">
              <span className="field-label">6-digit code</span>
              <input
                className="input input-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
              />
              <span className="field-help">At least {MIN_PASSWORD} characters. A few unrelated words work well.</span>
            </label>
            <label className="field">
              <span className="field-label">Confirm new password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save and sign in'}
            </button>
            <button type="button" className="link-btn" onClick={() => handleResetRequest()} disabled={busy}>
              Send a new code
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
