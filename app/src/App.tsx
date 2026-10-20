/* =====================================================================
   App.tsx — routes + the portal shell.

   Routes (under the /spa basename):
     /            → Landing (public search + claim entry)
     /claim/:id   → ClaimFlow (public self-serve claim)
     /portal      → the signed-in portal below
     /admin       → AdminPage (global supers only; unlinked)

   Portal boot: probe /session.
     logged out                → LoginGate
     logged in, nothing         → empty state pointing to the claim flow
     logged in, only pending    → "claim under review" state
     logged in, 1 editable, no pending → straight into its editor
     otherwise                  → picker (editable + pending cards), then editor
   The header shows the signed-in name + a Logout affordance. Session loss
   at any point (a call throwing LoggedOutError) drops back to the gate.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import {
  apiGetMyPrograms,
  apiSession,
  LoggedOutError,
  type ProgramSummary,
  type Session,
} from './api';
import AdminPage from './AdminPage';
import ClaimFlow from './ClaimFlow';
import Landing from './Landing';
import LoginGate from './LoginGate';
import ProgramEditor from './ProgramEditor';
import ProgramPicker from './ProgramPicker';
import { Icon, Spinner, ToastProvider, TopBar } from './ui';

const LOGOUT_URL = '/shared/login/logout';

type Phase = 'booting' | 'loggedOut' | 'loadingPrograms' | 'ready';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/claim/:id" element={<ClaimFlow />} />
        <Route path="/portal/*" element={<Portal />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
      // Auto-open the editor when there's exactly one editable program and
      // nothing under review to tell them about.
      const editable = safe.filter((p) => !p.pending);
      setSelectedId(editable.length === 1 && editable.length === safe.length ? editable[0].id : null);
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
    <TopBar>
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
    </TopBar>
  );
}

function EmptyState() {
  return (
    <div className="state-center">
      <div className="state-card">
        <div className="state-icon">
          <Icon name="search" size={22} />
        </div>
        <h2 className="state-title">Your account isn&rsquo;t linked to a program yet</h2>
        <p className="state-text">
          Find your program in the directory and claim it. It takes about two minutes.
        </p>
        <Link className="btn btn-primary" to="/">
          Find and claim your program
        </Link>
      </div>
    </div>
  );
}
