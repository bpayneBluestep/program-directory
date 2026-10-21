/* =====================================================================
   AdminPage.tsx — /admin, for BlueStep global super users only. Not linked
   from any public page. Signed out → its own sign-in (Microsoft first,
   then the other global options), returning here. Signed in as a super:
     /admin               → overview (totals, claims waiting on review,
                            recent edits, claimed programs) + every program,
                            searchable
     /admin/programs/:id  → the rep editor on any program, in admin mode
   The top bar carries the Backend menu (native BlueStep tools).
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  apiAdminDashboard,
  apiAdminPrograms,
  apiAdminSession,
  globalLoginUrl,
  LoggedOutError,
  microsoftLoginUrl,
  monthYear,
  type AdminDashboard,
  type AdminProgram,
  type AdminSession,
} from './api';
import BackendMenu from './BackendMenu';
import ProgramEditor from './ProgramEditor';
import { Icon, Spinner, StatusBadge, TopBar, VerifiedBadge } from './ui';

const ADMIN_DEST = '/admin';
const LOGOUT_URL = '/shared/login/logout';

type Phase = 'loading' | 'signedOut' | 'notSuper' | 'ready' | 'error';

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await apiAdminSession();
      setSession(s);
      if (!s.loggedIn) return setPhase('signedOut');
      if (!s.isSuper) return setPhase('notSuper');
      setPhase('ready');
    } catch (err) {
      if (err instanceof LoggedOutError) return setPhase('signedOut');
      setError(err instanceof Error ? err.message : 'Could not reach the directory.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    document.title = 'Admin · Program Directory';
    load();
  }, [load]);

  const toSignIn = useCallback(() => setPhase('signedOut'), []);

  const signOut = () => {
    window.location.href = `${LOGOUT_URL}?desturl=${encodeURIComponent(ADMIN_DEST)}`;
  };

  if (phase === 'loading') {
    return (
      <div className="boot">
        <Spinner label="Loading admin…" />
      </div>
    );
  }

  if (phase === 'signedOut') {
    return (
      <div className="page">
        <TopBar />
        <main className="state-center">
          <div className="state-card admin-signin">
            <div className="state-icon">
              <Icon name="lock" size={22} />
            </div>
            <h1 className="state-title">Directory admin</h1>
            <p className="state-text">For BlueStep staff. Sign in with your BlueStep Microsoft account.</p>
            <a className="btn btn-primary btn-block" href={microsoftLoginUrl(ADMIN_DEST)}>
              <MicrosoftMark /> Sign in with Microsoft
            </a>
            <a className="link-btn" href={globalLoginUrl(ADMIN_DEST)}>
              Other BlueStep sign-in options
            </a>
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'notSuper' || phase === 'error') {
    return (
      <div className="page">
        <TopBar />
        <main className="state-center">
          <div className="state-card">
            <div className="state-icon state-icon-alert">
              <Icon name="alert" size={22} />
            </div>
            <h1 className="state-title">{phase === 'notSuper' ? 'Super users only' : 'Couldn’t load the admin'}</h1>
            <p className="state-text">
              {phase === 'notSuper'
                ? `You're signed in as ${session?.fullName || 'a user'} without super-user access.`
                : error}
            </p>
            <button className="btn btn-outline" onClick={signOut}>
              Sign out and switch accounts
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar>
        <span className="pill pill-unclaimed">Admin</span>
        <span className="app-user-name admin-user">{session?.fullName}</span>
        <BackendMenu />
        <button className="btn btn-ghost btn-sm" onClick={signOut}>
          <Icon name="logout" size={16} />
          <span className="app-logout-label">Sign out</span>
        </button>
      </TopBar>

      <Routes>
        <Route index element={<Overview onSignedOut={toSignIn} />} />
        <Route path="programs/:id" element={<AdminEdit onSignedOut={toSignIn} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}

const programPath = (id: string) => `/admin/programs/${encodeURIComponent(id)}`;

function AdminEdit({ onSignedOut }: { onSignedOut: () => void }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  return (
    <main className="app-main">
      <ProgramEditor programId={id} admin canSwitch onSwitch={() => navigate('/admin')} onLoggedOut={onSignedOut} />
    </main>
  );
}

function Overview({ onSignedOut }: { onSignedOut: () => void }) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiAdminDashboard());
      setError('');
    } catch (err) {
      if (err instanceof LoggedOutError) return onSignedOut();
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    }
  }, [onSignedOut]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) {
    return (
      <main className="state-center">
        <div className="state-card">
          <div className="state-icon state-icon-alert">
            <Icon name="alert" size={22} />
          </div>
          <h1 className="state-title">Couldn’t load the dashboard</h1>
          <p className="state-text">{error}</p>
          <button className="btn btn-primary" onClick={refresh}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="boot">
        <Spinner label="Loading dashboard…" />
      </div>
    );
  }

  const d = data;
  const t = d.totals;
  const claimedPct = t.programs ? Math.round((t.managed / t.programs) * 100) : 0;

  return (
    <main className="admin">
      <header className="admin-head">
        <div>
          <h1 className="page-title">Directory overview</h1>
          <p className="muted">
            {claimedPct}% of programs claimed · as of {d.generatedAt}
          </p>
        </div>
        <div className="admin-head-actions">
          <Link className="btn btn-ghost btn-sm" to="/">
            Public site
          </Link>
          <button className="btn btn-outline btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="Programs" value={t.programs} />
        <Stat label="Claimed" value={t.managed} tone="success" sub={`${claimedPct}% of total`} />
        <Stat label="Pending review" value={t.pending} tone={t.pending ? 'warning' : undefined} />
        <Stat label="Unclaimed" value={t.unclaimed} />
        <Stat label="Verified" value={t.verified} sub="rep saved updates" />
        <Stat label="Program reps" value={t.reps} sub="with access or a claim" />
      </section>

      <div className="claim-bar" aria-hidden="true">
        <span className="claim-bar-managed" style={{ width: pct(t.managed, t.programs) }} />
        <span className="claim-bar-pending" style={{ width: pct(t.pending, t.programs) }} />
      </div>

      {d.pending.length ? (
        <section className="card admin-card">
          <div className="card-head">
            <h2 className="card-title">Waiting on your review</h2>
            <p className="card-sub">Approve or decline from the review email each claim sent you.</p>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Program</th><th>Rep</th><th>Email</th></tr>
            </thead>
            <tbody>
              {d.pending.map((p) => (
                <tr key={p.programId + p.rep.email}>
                  <td><Link className="tbl-strong tbl-link" to={programPath(p.programId)}>{p.programName}</Link></td>
                  <td>{p.rep.name || '—'}</td>
                  <td><a href={`mailto:${p.rep.email}`}>{p.rep.email}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="admin-grid">
        <section className="card admin-card">
          <div className="card-head">
            <h2 className="card-title">Recent updates</h2>
            <p className="card-sub">Latest saves from the portal.</p>
          </div>
          {d.recent.length ? (
            <ul className="activity">
              {d.recent.map((r) => (
                <li key={r.id}>
                  <Link className="activity-name tbl-link" to={programPath(r.id)}>{r.name}</Link>
                  <span className="muted">
                    {r.lastEditedBy || 'Someone'} · {r.lastEditedAt}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">No portal edits yet.</p>
          )}
        </section>

        <section className="card admin-card">
          <div className="card-head">
            <h2 className="card-title">Claimed programs</h2>
            <p className="card-sub">{d.claimed.length} programs with a manager.</p>
          </div>
          {d.claimed.length ? (
            <table className="tbl">
              <thead>
                <tr><th>Program</th><th>Managed by</th><th>Status</th></tr>
              </thead>
              <tbody>
                {d.claimed.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="tbl-strong tbl-link" to={programPath(c.id)}>{c.name}</Link>
                      {c.location ? <span className="tbl-sub">{c.location}</span> : null}
                    </td>
                    <td>
                      {c.managers.length
                        ? c.managers.map((m) => (
                            <span className="tbl-person" key={m.email || m.name}>
                              {m.name || m.email}
                              {m.email && m.name ? <span className="tbl-sub">{m.email}</span> : null}
                            </span>
                          ))
                        : <span className="muted">No linked user</span>}
                    </td>
                    <td>
                      <span className="tbl-badges">
                        {c.verified ? <VerifiedBadge lastVerified={c.lastVerified} /> : <StatusBadge status={c.status || 'Active'} />}
                        {c.lastEditedAt ? <span className="tbl-sub">Edited {monthYear(c.lastEditedAt) || c.lastEditedAt}</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-empty">Nobody has claimed a program yet.</p>
          )}
        </section>
      </div>

      <AllPrograms onSignedOut={onSignedOut} />
    </main>
  );
}

type ProgramFilter = 'all' | 'claimed' | 'pending' | 'unclaimed' | 'verified';

const FILTERS: { key: ProgramFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'pending', label: 'Pending' },
  { key: 'unclaimed', label: 'Unclaimed' },
  { key: 'verified', label: 'Verified' },
];

const PAGE = 50;

function claimState(p: AdminProgram): 'claimed' | 'pending' | 'unclaimed' {
  if (p.status === 'Active') return 'claimed';
  if (p.status === 'Pending review') return 'pending';
  return 'unclaimed';
}

// Every program, searched and filtered client-side. Each row opens the editor.
function AllPrograms({ onSignedOut }: { onSignedOut: () => void }) {
  const [programs, setPrograms] = useState<AdminProgram[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    apiAdminPrograms()
      .then((list) => setPrograms(Array.isArray(list) ? list : []))
      .catch((err) => {
        if (err instanceof LoggedOutError) return onSignedOut();
        setError(err instanceof Error ? err.message : 'Could not load programs.');
      });
  }, [onSignedOut]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (programs || []).filter((p) => {
      if (filter === 'verified' ? !p.verified : filter !== 'all' && claimState(p) !== filter) return false;
      if (!term) return true;
      return [p.name, p.location, p.website].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [programs, q, filter]);

  useEffect(() => setLimit(PAGE), [q, filter]);

  return (
    <section className="card admin-card">
      <div className="card-head admin-programs-head">
        <div>
          <h2 className="card-title">All programs</h2>
          <p className="card-sub">
            {programs ? `${matches.length.toLocaleString()} of ${programs.length.toLocaleString()}` : 'Loading…'} · open one to edit it
          </p>
        </div>
        <div className="admin-search">
          <Icon name="search" size={16} />
          <input
            className="admin-search-input"
            type="search"
            placeholder="Search name, city or website"
            aria-label="Search programs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="admin-filters" role="group" aria-label="Filter programs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip-check${filter === f.key ? ' is-on' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="admin-empty">{error}</p>
      ) : !programs ? (
        <div className="admin-empty"><Spinner label="Loading programs…" /></div>
      ) : matches.length === 0 ? (
        <p className="admin-empty">No programs match.</p>
      ) : (
        <>
          <table className="tbl">
            <thead>
              <tr><th>Program</th><th>Status</th><th>Managers</th></tr>
            </thead>
            <tbody>
              {matches.slice(0, limit).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="tbl-strong tbl-link" to={programPath(p.id)}>{p.name || 'Untitled program'}</Link>
                    {p.location ? <span className="tbl-sub">{p.location}</span> : null}
                  </td>
                  <td>
                    <span className="tbl-badges">
                      {p.verified ? <VerifiedBadge /> : <StatusBadge status={p.status || 'Unclaimed'} />}
                      {p.lastEditedAt ? <span className="tbl-sub">Edited {monthYear(p.lastEditedAt) || p.lastEditedAt}</span> : null}
                    </span>
                  </td>
                  <td>{p.managers || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {matches.length > limit ? (
            <div className="admin-more">
              <button className="btn btn-outline btn-sm" onClick={() => setLimit((n) => n + PAGE * 4)}>
                Show more ({(matches.length - limit).toLocaleString()} left)
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'success' | 'warning' }) {
  return (
    <div className={`stat card${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString()}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}

function pct(n: number, total: number): string {
  return total ? `${(n / total) * 100}%` : '0%';
}

function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
