/* =====================================================================
   ListingPreview.tsx — the signature element. A live card that shows how
   the program's public directory listing reads as the rep edits it: the
   same logo, name, website, overview and contacts a referring family sees
   first. It mirrors the form's working state (not the last-saved copy), so
   editing always answers "what will people see?".
   ===================================================================== */

import type { Contact } from './api';
import { StatusBadge } from './ui';

interface Props {
  programName: string;
  website: string;
  overview: string;
  admissionsContact: string;
  contacts: Contact[];
  logoUrl: string;
  portalStatus: string;
}

// Strip a protocol + trailing slash for a tidy display host.
function prettyHost(website: string): string {
  const w = (website || '').trim();
  if (!w) return '';
  return w.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export default function ListingPreview({
  programName,
  website,
  overview,
  admissionsContact,
  contacts,
  logoUrl,
  portalStatus,
}: Props) {
  const host = prettyHost(website);
  const named = contacts.filter((c) => (c.name || c.role || c.phone || c.email));
  const initial = (programName || 'P').trim().charAt(0).toUpperCase();

  return (
    <div className="preview">
      <div className="preview-head">
        <span className="preview-eyebrow">Directory preview</span>
        <StatusBadge status={portalStatus} />
      </div>

      <div className="preview-card">
        <div className="preview-card-top">
          <div className={`preview-logo${logoUrl ? '' : ' preview-logo-empty'}`}>
            {logoUrl ? <img src={logoUrl} alt="" /> : <span aria-hidden="true">{initial}</span>}
          </div>
          <div className="preview-title-wrap">
            <h3 className="preview-name">{programName.trim() || 'Your program name'}</h3>
            {host ? <span className="preview-host">{host}</span> : <span className="preview-host preview-muted">website.org</span>}
          </div>
        </div>

        <p className={`preview-overview${overview.trim() ? '' : ' preview-muted'}`}>
          {overview.trim() || 'A short overview of your program appears here — who you serve and what makes your care distinct.'}
        </p>

        {admissionsContact.trim() ? (
          <div className="preview-line">
            <span className="preview-line-label">Admissions</span>
            <span>{admissionsContact.trim()}</span>
          </div>
        ) : null}

        {named.length > 0 ? (
          <div className="preview-contacts">
            <span className="preview-line-label">Contacts</span>
            <ul>
              {named.slice(0, 4).map((c, i) => (
                <li key={i}>
                  <span className="preview-contact-name">{c.name || c.role || c.email || c.phone}</span>
                  {c.role && c.name ? <span className="preview-contact-role"> · {c.role}</span> : null}
                </li>
              ))}
              {named.length > 4 ? <li className="preview-muted">+{named.length - 4} more</li> : null}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="preview-foot">This is how families and referring professionals will see your listing.</p>
    </div>
  );
}
