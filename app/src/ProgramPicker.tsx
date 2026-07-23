/* =====================================================================
   ProgramPicker.tsx — shown only when the signed-in rep manages 2+ programs
   (the corporate-parent case). Pick one to open its editor.
   ===================================================================== */

import type { ProgramSummary } from './api';
import { Icon, StatusBadge } from './ui';

interface Props {
  programs: ProgramSummary[];
  onPick: (id: string) => void;
}

export default function ProgramPicker({ programs, onPick }: Props) {
  return (
    <div className="picker">
      <header className="picker-head">
        <p className="picker-eyebrow">{programs.length} programs</p>
        <h1 className="picker-title">Choose a program to edit</h1>
        <p className="picker-sub">You manage more than one listing. Pick the one you want to update.</p>
      </header>

      <ul className="picker-list">
        {programs.map((p) => (
          <li key={p.id}>
            <button className="picker-card" onClick={() => onPick(p.id)}>
              <span className="picker-card-mark" aria-hidden="true">
                {(p.programName || 'P').trim().charAt(0).toUpperCase()}
              </span>
              <span className="picker-card-body">
                <span className="picker-card-name">{p.programName || 'Untitled program'}</span>
                <StatusBadge status={p.portalStatus} />
              </span>
              <span className="picker-card-go" aria-hidden="true">
                <Icon name="switch" size={18} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
