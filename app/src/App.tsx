/* =====================================================================
   App.tsx — the portal shell + boot flow.

   Boot: probe /session.
     logged out            → LoginGate
     logged in, 0 programs  → empty state
     logged in, 1 program   → straight into its editor
     logged in, 2+ programs → picker, then editor
   The header shows the signed-in name + a Logout affordance. Session loss
   at any point (a call throwing LoggedOutError) drops back to the gate.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import {
  apiGetMyPrograms,
  apiSession,
  LoggedOutError,
  type ProgramSummary,
  type Session,
} from './api';
import LoginGate from './LoginGate';
import ProgramEditor from './ProgramEditor';
import ProgramPicker from './ProgramPicker';
import { Icon, Spinner, ToastProvider } from './ui';

const LOGOUT_URL = '/shared/login/logout';

type Phase = 'booting' | 'loggedOut' | 'loadingPrograms' | 'ready';

export default function App() {
  return (
    <ToastProvider>
      <Portal />
    </ToastProvider>
  );
}

function Portal() {
  const [phase, setPhase] = useState<Phase>('booting');
  const [session, setSession] = useState<Session | null>(null);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Drop to the login gate — called on boot when logged out, and any time a
  // later call reports the session expired.
  const toLoginGate = useCallback(() => {
    setSession(null);
    setPrograms([]);
    setSelectedId(null);
    setPhase('loggedOut');
  }, []);

  const loadPrograms = useCallback(async () => {
    setPhase('loadingPrograms');
    setProgramsError(null);
    try {
      const list = await apiGetMyPrograms();
      const safe = Array.isArray(list) ? list : [];
      setPrograms(safe);
      // Auto-open the editor when there's exactly one program.
      setSelectedId(safe.length === 1 ? safe[0].id : null);
      setPhase('ready');
    } catch (err) {
      if (err instanceof LoggedOutError) {
        toLoginGate();
        return;
      }
      setProgramsError(err instanceof Error ? err.message : 'Could not load your programs.');
      setPhase('ready');
    }
  }, [toLoginGate]);

  const boot = useCallback(async () => {
    setPhase('booting');
    try {
      const sess = await apiSession();
      if (!sess || !sess.loggedIn) {
        toLoginGate();
        return;
      }
      setSession(sess);
      await loadPrograms();
    } catch (err) {
      if (err instanceof LoggedOutError) {
        toLoginGate();
        return;
      }
      // A non-auth failure on the session probe still can't proceed without a
      // session — send the user to the gate, where a retry is one click away.
      toLoginGate();
    }
  }, [toLoginGate, loadPrograms]);

  useEffect(() => {
    boot();
  }, [boot]);

  function handleLogout() {
    // Full-page navigation to the platform logout, returning to the SPA.
    window.location.href = `${LOGOUT_URL}?desturl=${encodeURIComponent(window.location.href)}`;
  }

  /* ---- render by phase ---- */

  if (phase === 'booting') {
    return (
      <div className="boot">
        <Spinner label="Loading the portal…" />
      </div>
    );
  }

  if (phase === 'loggedOut') {
    return <LoginGate onAuthenticated={boot} />;
  }

  return (
    <div className="app">
      <AppHeader fullName={session?.fullName || ''} onLogout={handleLogout} />

      <main className="app-main">
        {phase === 'loadingPrograms' ? (
          <div className="state-center">
            <Spinner label="Loading your programs…" />
          </div>
        ) : programsError ? (
          <div className="state-center">
            <div className="state-card">
              <div className="state-icon state-icon-alert">
                <Icon name="alert" size={22} />
              </div>
              <h2 className="state-title">We couldn&rsquo;t load your programs</h2>
              <p className="state-text">{programsError}</p>
              <button className="btn btn-primary" onClick={loadPrograms}>
                Try again
              </button>
            </div>
          </div>
        ) : programs.length === 0 ? (
          <EmptyState />
        ) : selectedId ? (
          <ProgramEditor
            programId={selectedId}
            canSwitch={programs.length > 1}
            onSwitch={() => setSelectedId(null)}
            onLoggedOut={toLoginGate}
          />
        ) : (
          <ProgramPicker programs={programs} onPick={(id) => setSelectedId(id)} />
        )}
      </main>
    </div>
  );
}

function AppHeader({ fullName, onLogout }: { fullName: string; onLogout: () => void }) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <header className="app-header">
      <div className="wordmark">
        <span className="wordmark-mark">PD</span>
        <span className="wordmark-text">Program Portal</span>
      </div>
      <div className="app-header-right">
        {fullName ? (
          <span className="app-user">
            <span className="app-user-avatar" aria-hidden="true">{initials || 'U'}</span>
            <span className="app-user-name">{fullName}</span>
          </span>
        ) : null}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          <Icon name="logout" size={16} />
          <span className="app-logout-label">Log out</span>
        </button>
      </div>
    </header>
  );
}

function EmptyState() {
  return (
    <div className="state-center">
      <div className="state-card">
        <div className="state-icon">
          <Icon name="external" size={22} />
        </div>
        <h2 className="state-title">Your account isn&rsquo;t linked to a program yet</h2>
        <p className="state-text">
          Once your program is connected, it will show up here to edit. Reach out to your BlueStep
          contact to get linked.
        </p>
      </div>
    </div>
  );
}
