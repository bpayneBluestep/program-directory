/* =====================================================================
   ListingFacts.tsx — a listing as it stands today, read-only: the head
   (initial, name, location, host, verified) and the facts table. Shared by
   the Find workspace's detail pane and the claim flow's confirm step.
   ===================================================================== */

import type { ProgramPreview } from './api';
import { Icon, VerifiedBadge } from './ui';

export function prettyHost(website: string): string {
  return (website || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

export function ListingHead({ program, as: Title = 'h2' }: { program: ProgramPreview; as?: 'h1' | 'h2' }) {
  return (
    <div className="listing-head">
      <span className="result-mark result-mark-lg" aria-hidden="true">
        {program.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="listing-head-body">
        <Title className="listing-name">{program.name}</Title>
        <p className="listing-meta">
          {program.location ? (
            <span>
              <Icon name="map" size={13} /> {program.location}
            </span>
          ) : null}
          {program.website ? <span>{prettyHost(program.website)}</span> : null}
          {program.verified ? <VerifiedBadge lastVerified={program.lastVerified} /> : null}
        </p>
      </div>
    </div>
  );
}

export function ListingFacts({ program }: { program: ProgramPreview }) {
  const ages =
    program.ageMin != null || program.ageMax != null ? `Ages ${program.ageMin ?? '?'}–${program.ageMax ?? '?'}` : '';
  const care = [...program.programType, ...program.levelOfCare].filter((v, i, a) => a.indexOf(v) === i);
  const serves = [ages, program.genderServed.join(', ')].filter(Boolean).join(' · ');

  return (
    <dl className="facts">
      <div>
        <dt>Type of care</dt>
        <dd>{care.length ? care.join(' · ') : <span className="muted">Not listed</span>}</dd>
      </div>
      <div>
        <dt>Who they serve</dt>
        <dd>{serves || <span className="muted">Not listed</span>}</dd>
      </div>
      <div>
        <dt>Specialties</dt>
        <dd>{program.specialties.length ? program.specialties.join(' · ') : <span className="muted">Not listed</span>}</dd>
      </div>
      <div>
        <dt>Admissions contact</dt>
        <dd>{program.hasAdmissions ? 'On file' : <span className="muted">Missing</span>}</dd>
      </div>
    </dl>
  );
}
