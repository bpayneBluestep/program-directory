/* =====================================================================
   LoginGate.tsx — the sign-in screen shown whenever the session is not
   authenticated. It POSTs credentials same-origin to the BlueStep login
   handler (via api.login), then asks the parent to re-probe the session.
   Global-user email 2FA hands off to a full-page native POST that returns
   to this SPA.
   ===================================================================== */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { login, nativeLoginSubmit } from './api';
import { Wordmark } from './ui';

export default function LoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setBusy(true);
    const result = await login(username.trim(), password);
    if (result.ok) {
      onAuthenticated();
      return; // keep the button busy while the parent swaps the view
    }
    if (result.twoFactor) {
      // Hand off to the platform's email verification, returning here after.
      nativeLoginSubmit(username.trim(), password, window.location.href);
      return;
    }
    setError(result.error || 'Sign-in failed. Please try again.');
    setBusy(false);
  }

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

      {/* Right: sign-in form */}
      <main className="login-panel">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <Wordmark />

          <h1 className="login-title">Sign in</h1>
          <p className="login-hint">Use the email and password you set when you claimed your program.</p>

          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field">
            <span className="field-label">Email or username</span>
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
              autoFocus
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
            />
          </label>

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="login-alt">
            New here? <Link to="/">Find and claim your program</Link>
          </p>
          <p className="login-legal">
            Your password is sent only to this BlueStep site over a secure connection.
          </p>
        </form>
      </main>
    </div>
  );
}
