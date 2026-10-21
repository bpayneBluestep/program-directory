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
import { Logo, MAIN_SITE, ThemeToggle, Wordmark } from './ui';

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
    <div className="auth">
      <header className="auth-top">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="auth-main">
        <form className="auth-card" onSubmit={handleSubmit} noValidate>
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

      <footer className="auth-foot">
        <span>Free for every program, always.</span>
        <a href={MAIN_SITE} target="_blank" rel="noopener noreferrer" className="auth-sign">
          <span>A platform by</span> <Logo className="side-logo" />
        </a>
      </footer>
    </div>
  );
}
