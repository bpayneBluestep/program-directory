/* =====================================================================
   Landing.tsx — the public front door. A program rep searches for their
   program by name, sees whether it is unclaimed / managed / under review,
   and starts the claim. Returning reps sign in from the top bar.
   `?program=<id>` (personal links from outreach email) skips the search.
   ===================================================================== */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiSearchPrograms, type ClaimState, type ProgramHit } from './api';
import { Icon, Spinner, TopBar } from './ui';

const STATE_LABEL: Record<ClaimState, string> = {
  unclaimed: 'Unclaimed',
  managed: 'Managed by program',
  pending: 'Claim in review',
};

export default function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProgramHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Personal claim links: /?program=<id> jumps straight to the claim.
  useEffect(() => {
    const id = params.get('program');
    if (id) navigate(`/claim/${encodeURIComponent(id)}`, { replace: true });
  }, [params, navigate]);

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

  return (
    <div className="page">
      <TopBar>
        <Link className="btn btn-outline btn-sm" to="/portal">
          Sign in
        </Link>
      </TopBar>

      <main className="landing">
        <section className="hero">
          <p className="eyebrow">Free for every program · always</p>
          <h1 className="display">Your program, described by the people who run it.</h1>
          <p className="hero-sub">
            Educational consultants use the Program Directory to find the right fit for families. Claim your
            listing to correct it, keep it current, and earn a verified badge.
          </p>

          <div className="search-box">
            <Icon name="search" size={18} />
            <input
              className="search-input"
              type="search"
              placeholder="Search for your program by name"
              aria-label="Search for your program by name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {busy ? <Spinner /> : null}
          </div>

          {error ? <div className="form-error" role="alert">{error}</div> : null}

          {hits ? (
            <div className="results card">
              {hits.length === 0 ? (
                <div className="results-empty">
                  <p>
                    <strong>No match for &ldquo;{q.trim()}&rdquo;.</strong>
                  </p>
                  <p className="muted">
                    Try a shorter name. If your program isn&rsquo;t listed yet, email{' '}
                    <a href="mailto:bpayne@bluestep.net?subject=Add%20our%20program%20to%20the%20directory">
                      bpayne@bluestep.net
                    </a>{' '}
                    and we&rsquo;ll add it.
                  </p>
                </div>
              ) : (
                <ul className="results-list">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <Link className="result" to={`/claim/${encodeURIComponent(h.id)}`}>
                        <span className="result-mark" aria-hidden="true">
                          {h.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="result-body">
                          <span className="result-name">{h.name}</span>
                          <span className="result-meta">
                            {h.location ? (
                              <>
                                <Icon name="map" size={13} /> {h.location}
                              </>
                            ) : null}
                            {h.website ? <span className="result-host">{prettyHost(h.website)}</span> : null}
                          </span>
                        </span>
                        <span className={`pill pill-${h.state}`}>{STATE_LABEL[h.state]}</span>
                        <span className="result-go" aria-hidden="true">
                          <Icon name="arrowRight" size={16} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>

        <section className="how">
          <div className="how-step">
            <span className="how-num">1</span>
            <h3>Find your listing</h3>
            <p>Most programs are already here, built from public information on your website.</p>
          </div>
          <div className="how-step">
            <span className="how-num">2</span>
            <h3>Verify your work email</h3>
            <p>We send a 6-digit code, then a link to set your password. An email at your program&rsquo;s own domain gets instant access.</p>
          </div>
          <div className="how-step">
            <span className="how-num">3</span>
            <h3>Confirm the essentials</h3>
            <p>Four quick steps, then your listing shows a verified badge to every consultant.</p>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <span>BlueStep Program Directory</span>
        <span className="muted">Listings are free for programs, forever.</span>
      </footer>
    </div>
  );
}

export function prettyHost(website: string): string {
  return (website || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}
