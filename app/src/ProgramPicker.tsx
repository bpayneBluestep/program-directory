/* =====================================================================
   ProgramPicker.tsx — the signed-in rep's programs: editable listings
   (open the editor) and claims still under review (shown, locked until
   approved). Shown when there is more than one, or anything is pending.
   ===================================================================== */

import { Link } from 'react-router-dom';
import type { ProgramSummary } from './api';
import { Icon, StatusBadge, VerifiedBadge } from './ui';

interface Props {
  programs: ProgramSummary[];
  onPick: (id: string) => void;
}

export default function ProgramPicker({ programs, onPick }: Props) {
  const editable = programs.filter((p) => !p.pending);
  const pending = programs.filter((p) => p.pending);

  return (
    <div className="picker">
      <header className="picker-head">
        <div>
          <h1 className="page-title">Your programs</h1>
          <p className="muted">
            {editable.length
              ? 'Pick a listing to update.'
              : 'Your claim is with our team. Editing unlocks as soon as it’s approved.'}
          </p>
        </div>
        <Link className="btn btn-outline btn-sm" to="/">
          <Icon name="plus" size={15} /> Claim another program
        </Link>
      </header>

      {editable.length ? (
        <ul className="picker-list">
          {editable.map((p) => (
            <li key={p.id}>
              <button className="picker-card" onClick={() => onPick(p.id)}>
                <span className="picker-card-mark" aria-hidden="true">
                  {(p.programName || 'P').trim().charAt(0).toUpperCase()}
                </span>
                <span className="picker-card-body">
                  <span className="picker-card-name">{p.programName || 'Untitled program'}</span>
                  <span className="picker-card-meta">
                    {p.verified ? <VerifiedBadge lastVerified={p.lastVerified} /> : <span className="pill pill-unclaimed">Not verified yet</span>}
                    {p.location ? <span className="muted">{p.location}</span> : null}
                  </span>
                </span>
                <span className="picker-card-go" aria-hidden="true">
                  <Icon name="arrowRight" size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length ? (
        <>
          <h2 className="section-label">Under review</h2>
          <ul className="picker-list">
            {pending.map((p) => (
              <li key={p.id}>
                <div className="picker-card picker-card-locked" aria-disabled="true">
                  <span className="picker-card-mark" aria-hidden="true">
                    <Icon name="lock" size={16} />
                  </span>
                  <span className="picker-card-body">
                    <span className="picker-card-name">{p.programName || 'Untitled program'}</span>
                    <span className="picker-card-meta">
                      <StatusBadge status="Pending review" />
                      <span className="muted">We&rsquo;ll email you when it&rsquo;s approved, usually within a business day.</span>
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
