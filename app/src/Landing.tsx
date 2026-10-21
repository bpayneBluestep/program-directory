/* =====================================================================
   Landing.tsx — the Find workspace, the public front door. A program rep
   searches by name; results list on the left, the selected listing in a
   detail pane on the right (as it stands today, with its claim state), and
   one click starts the claim. Arrow keys move the selection, Enter opens it.
   Phones have no detail pane: a result goes straight to the claim.
   `?program=<id>` (personal links from outreach email) skips the search.
   ===================================================================== */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPreviewProgram, apiSearchPrograms, type ClaimState, type ProgramHit, type ProgramPreview } from './api';
import { ListingFacts, ListingHead, prettyHost } from './ListingFacts';
import { Icon, Shell, Spinner } from './ui';

const STATE_LABEL: Record<ClaimState, string> = {
  unclaimed: 'Unclaimed',
  managed: 'Managed by program',
  pending: 'Claim in review',
};

const CLAIM_LABEL: Record<ClaimState, string> = {
  unclaimed: 'Claim this listing',
  managed: 'Request access',
  pending: 'Continue to claim',
};

// Below this width the detail pane is hidden and a result opens the claim.
const SPLIT_QUERY = '(min-width: 1000px)';

const claimPath = (id: string) => `/claim/${encodeURIComponent(id)}`;

export default function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProgramHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Find a program · Program Directory';
  }, []);

  // Personal claim links: /?program=<id> jumps straight to the claim.
  useEffect(() => {
    const id = params.get('program');
    if (id) navigate(claimPath(id), { replace: true });
  }, [params, navigate]);

  // "/" focuses the search from anywhere on the page.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Debounced search; a sequence number drops out-of-order replies.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const res = await apiSearchPrograms(term);
        if (mine === seq.current) {
          setHits(Array.isArray(res) ? res : []);
          setSelected(0);
          setError(null);
        }
      } catch (err) {
        if (mine === seq.current) setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  const current = hits && hits.length ? hits[Math.min(selected, hits.length - 1)] : null;

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!hits || !hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && current) {
      navigate(claimPath(current.id));
    }
  }

  function pick(i: number, id: string) {
    if (window.matchMedia(SPLIT_QUERY).matches) setSelected(i);
    else navigate(claimPath(id));
  }

  return (
    <Shell title="Find a program">
      <main className="ws">
        <div className="ws-head">
          <h1 className="ws-title">Find your program</h1>
          <p className="ws-sub">
            Educational consultants use the directory to find the right fit for families. Claim your listing to correct
            it, keep it current, and earn a verified badge.
          </p>
        </div>

        <div className="cmd">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmd-input"
            type="search"
            placeholder="Search programs by name"
            aria-label="Search programs by name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            autoFocus
          />
          {busy ? <Spinner /> : <kbd className="kbd">/</kbd>}
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="split">
          <section className="pane" aria-label="Results">
            <header className="pane-head">
              <span className="pane-title">{hits ? 'Results' : 'Directory'}</span>
              {hits ? <span className="pane-count">{hits.length}</span> : null}
            </header>

            {!hits ? (
              <div className="pane-empty">
                <span className="pane-empty-icon"><Icon name="search" size={20} /></span>
                <p className="pane-empty-title">Start with your program&rsquo;s name</p>
                <p className="muted">Most programs are already listed, built from public information on their website.</p>
              </div>
            ) : hits.length === 0 ? (
              <div className="pane-empty">
                <span className="pane-empty-icon"><Icon name="alert" size={20} /></span>
                <p className="pane-empty-title">No match for &ldquo;{q.trim()}&rdquo;</p>
                <p className="muted">Try a shorter name, or tell us about your program and we&rsquo;ll add it.</p>
                <Link className="btn btn-primary btn-sm" to={`/add?name=${encodeURIComponent(q.trim())}`}>
                  <Icon name="plus" size={15} /> Add your program
                </Link>
              </div>
            ) : (
              <ul className="rows" role="listbox" aria-label="Programs">
                {hits.map((h, i) => (
                  <li key={h.id} role="option" aria-selected={i === selected}>
                    <button type="button" className={`row${i === selected ? ' is-selected' : ''}`} onClick={() => pick(i, h.id)} onDoubleClick={() => navigate(claimPath(h.id))}>
                      <span className="result-mark" aria-hidden="true">{h.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="result-body">
                        <span className="result-name">{h.name}</span>
                        <span className="result-meta">
                          {h.location ? <span>{h.location}</span> : null}
                          {h.website ? <span className="result-host">{prettyHost(h.website)}</span> : null}
                        </span>
                      </span>
                      <span className={`pill pill-${h.state}`}>{STATE_LABEL[h.state]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <footer className="pane-foot">
              <span className="muted">Not listed?</span>
              <Link to={q.trim() ? `/add?name=${encodeURIComponent(q.trim())}` : '/add'}>Add your program</Link>
            </footer>
          </section>

          <aside className="pane pane-detail" aria-label="Selected listing">
            {current ? <Detail hit={current} /> : <HowItWorks />}
          </aside>
        </div>
      </main>
    </Shell>
  );
}

const previews = new Map<string, ProgramPreview>();

function Detail({ hit }: { hit: ProgramHit }) {
  const [program, setProgram] = useState<ProgramPreview | null>(previews.get(hit.id) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const cached = previews.get(hit.id);
    setProgram(cached || null);
    if (cached) return;
    apiPreviewProgram(hit.id)
      .then((p) => {
        previews.set(hit.id, p);
        if (live) setProgram(p);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [hit.id]);

  return (
    <div className="detail">
      <header className="pane-head">
        <span className="pane-title">Listing</span>
        <span className={`pill pill-${hit.state}`}>{STATE_LABEL[hit.state]}</span>
      </header>
      <div className="detail-body">
        {program ? (
          <>
            <ListingHead program={program} />
            <ListingFacts program={program} />
          </>
        ) : failed ? (
          <p className="muted">Couldn&rsquo;t load this listing&rsquo;s details. You can still open it.</p>
        ) : (
          <div className="detail-loading"><Spinner label="Loading the listing…" /></div>
        )}
      </div>
      <footer className="detail-foot">
        <span className="muted detail-hint">
          {hit.state === 'managed'
            ? 'Someone at this program manages it. Colleagues at the same email domain get in right away.'
            : hit.state === 'pending'
              ? 'A claim is already under review.'
              : 'Takes about two minutes with your work email.'}
        </span>
        <Link className="btn btn-primary" to={claimPath(hit.id)}>
          {CLAIM_LABEL[hit.state]} <Icon name="arrowRight" size={15} />
        </Link>
      </footer>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { t: 'Find your listing', b: 'Search by name. Select a result to see the listing as consultants see it today.' },
    { t: 'Verify your work email', b: 'We send a 6-digit code. An email at your program’s own domain gets instant access.' },
    { t: 'Confirm the essentials', b: 'Four quick steps, then your listing shows a verified badge to every consultant.' },
  ];
  return (
    <div className="detail">
      <header className="pane-head">
        <span className="pane-title">How claiming works</span>
      </header>
      <ol className="checklist">
        {steps.map((s, i) => (
          <li key={s.t}>
            <span className="checklist-num">{i + 1}</span>
            <div>
              <p className="checklist-title">{s.t}</p>
              <p className="muted">{s.b}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="detail-foot">
        <span className="muted detail-hint">Already claimed one?</span>
        <Link className="btn btn-outline btn-sm" to="/portal">Sign in</Link>
      </footer>
    </div>
  );
}
