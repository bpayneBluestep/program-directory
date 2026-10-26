/* =====================================================================
   RequestListing.tsx — /add, for a program that isn't in the directory
   yet. A short profile (the same questions the editor asks, trimmed) plus
   who's asking. Submitting emails BlueStep, who approves it into a
   listing; the requester then gets a link to claim it. `?name=` prefills
   the program name from the landing search.
   ===================================================================== */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiListingMeta, apiRequestListing, type ListingMeta, type ListingRequest } from './api';
import { RecaptchaNote } from './ClaimFlow';
import { Icon, Spinner, TopBar } from './ui';

type Program = ListingRequest['program'];
type Contact = ListingRequest['contact'];
type MultiKey = 'programType' | 'levelOfCare' | 'genderServed' | 'specialties';

const EMPTY_PROGRAM: Program = {
  programName: '',
  website: '',
  locationCity: '',
  locationState: '',
  programType: [],
  levelOfCare: [],
  genderServed: [],
  specialties: [],
  ageMin: '',
  ageMax: '',
  overview: '',
  admissionsContact: '',
};

const EMPTY_CONTACT: Contact = { firstName: '', lastName: '', role: '', email: '', phone: '' };

const OVERVIEW_MAX = 1500;

export default function RequestListing() {
  const [params] = useSearchParams();
  const [meta, setMeta] = useState<ListingMeta | null>(null);
  const [program, setProgram] = useState<Program>({ ...EMPTY_PROGRAM, programName: params.get('name') || '' });
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Add your program · Program Directory';
    apiListingMeta()
      .then(setMeta)
      .catch(() =>
        setMeta({ programType: [], levelOfCare: [], genderServed: [], specialties: [], locationState: [] }),
      );
  }, []);

  const setP = (k: keyof Program, v: Program[keyof Program]) => setProgram((p) => ({ ...p, [k]: v }));
  const setC = (k: keyof Contact, v: string) => setContact((c) => ({ ...c, [k]: v }));
  const toggle = (k: MultiKey, opt: string) =>
    setProgram((p) => ({ ...p, [k]: p[k].includes(opt) ? p[k].filter((x) => x !== opt) : [...p[k], opt] }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!program.programName.trim()) return fail("Please enter your program's name.");
    if (!program.website.trim()) return fail("Please enter your program's website.");
    if (!program.locationCity.trim() || !program.locationState) return fail("Please enter your program's city and state.");
    if (!contact.firstName.trim() || !contact.lastName.trim()) return fail('Please enter your first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return fail('Please enter a valid work email.');
    setBusy(true);
    try {
      const r = await apiRequestListing({ program, contact, notes });
      setSentTo(r.emailMasked);
      window.scrollTo(0, 0);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  }

  function fail(message: string) {
    setError(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="page">
      <TopBar>
        <Link className="btn btn-ghost btn-sm" to="/">
          <Icon name="arrowLeft" size={15} /> Search
        </Link>
      </TopBar>

      <main className="claim request">
        {sentTo ? (
          <div className="card claim-card claim-outcome">
            <span className="outcome-icon outcome-icon-success"><Icon name="check" size={22} /></span>
            <h1 className="claim-title">Thanks, we&rsquo;ve got it</h1>
            <p className="muted">
              We review every new program by hand, usually within a business day. We sent a receipt to{' '}
              <strong>{sentTo}</strong> and we&rsquo;ll email you there as soon as {program.programName.trim() || 'your program'} is
              listed, with a link to claim it.
            </p>
            <div className="claim-actions">
              <Link className="btn btn-outline" to="/">Back to the directory</Link>
            </div>
          </div>
        ) : !meta ? (
          <div className="state-center"><Spinner label="Loading…" /></div>
        ) : (
          <form className="card claim-card" onSubmit={submit} noValidate>
            <p className="eyebrow">Add your program</p>
            <h1 className="claim-title">Tell us about your program</h1>
            <p className="muted">
              Listings are free. We&rsquo;ll review this, add your program, and email you a link to claim and finish it.
            </p>

            {error ? <div className="form-error" role="alert">{error}</div> : null}

            <h2 className="request-section">The basics</h2>
            <label className="field">
              <span className="field-label">Program name</span>
              <input className="input" value={program.programName} onChange={(e) => setP('programName', e.target.value)} disabled={busy} autoFocus={!program.programName} />
            </label>
            <label className="field">
              <span className="field-label">Website</span>
              <input
                className="input"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="yourprogram.org"
                value={program.website}
                onChange={(e) => setP('website', e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">City</span>
                <input className="input" value={program.locationCity} onChange={(e) => setP('locationCity', e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span className="field-label">State</span>
                <select className="input select" value={program.locationState} onChange={(e) => setP('locationState', e.target.value)} disabled={busy}>
                  <option value="">Choose…</option>
                  {meta.locationState.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>

            <h2 className="request-section">Who you serve</h2>
            <Chips label="Program type" options={meta.programType} selected={program.programType} onToggle={(o) => toggle('programType', o)} disabled={busy} />
            <Chips label="Level of care" options={meta.levelOfCare} selected={program.levelOfCare} onToggle={(o) => toggle('levelOfCare', o)} disabled={busy} />
            <div className="field-row">
              <label className="field">
                <span className="field-label">Youngest age served</span>
                <input className="input" type="number" inputMode="numeric" min={0} max={99} value={program.ageMin} onChange={(e) => setP('ageMin', e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span className="field-label">Oldest age served</span>
                <input className="input" type="number" inputMode="numeric" min={0} max={99} value={program.ageMax} onChange={(e) => setP('ageMax', e.target.value)} disabled={busy} />
              </label>
            </div>
            <Chips label="Gender served" options={meta.genderServed} selected={program.genderServed} onToggle={(o) => toggle('genderServed', o)} disabled={busy} />
            <Chips label="Specialties" options={meta.specialties} selected={program.specialties} onToggle={(o) => toggle('specialties', o)} disabled={busy} />

            <h2 className="request-section">Your story</h2>
            <label className="field">
              <span className="field-label">Overview</span>
              <textarea
                className="input textarea"
                placeholder="A few sentences a family or consultant should read first: who you help and how."
                maxLength={OVERVIEW_MAX}
                value={program.overview}
                onChange={(e) => setP('overview', e.target.value)}
                disabled={busy}
              />
              <span className="field-help">{program.overview.length} / {OVERVIEW_MAX}</span>
            </label>
            <label className="field">
              <span className="field-label">Admissions contact</span>
              <input
                className="input"
                placeholder="Phone or email families should use"
                value={program.admissionsContact}
                onChange={(e) => setP('admissionsContact', e.target.value)}
                disabled={busy}
              />
            </label>

            <h2 className="request-section">About you</h2>
            <div className="field-row">
              <label className="field">
                <span className="field-label">First name</span>
                <input className="input" autoComplete="given-name" value={contact.firstName} onChange={(e) => setC('firstName', e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span className="field-label">Last name</span>
                <input className="input" autoComplete="family-name" value={contact.lastName} onChange={(e) => setC('lastName', e.target.value)} disabled={busy} />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Your role</span>
              <input className="input" placeholder="e.g. Admissions Director" autoComplete="organization-title" value={contact.role} onChange={(e) => setC('role', e.target.value)} disabled={busy} />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Work email</span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@yourprogram.org"
                  value={contact.email}
                  onChange={(e) => setC('email', e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span className="field-label">Phone <span className="field-count">(optional)</span></span>
                <input className="input" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setC('phone', e.target.value)} disabled={busy} />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Anything else? <span className="field-count">(optional)</span></span>
              <textarea
                className="input textarea textarea-sm"
                placeholder="What you'd like us to know, or the best time to reach you."
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </label>

            <div className="claim-actions">
              <Link className="btn btn-ghost" to="/">Cancel</Link>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send for review'}
              </button>
            </div>
            <RecaptchaNote />
          </form>
        )}
      </main>
    </div>
  );
}

function Chips({
  label,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (opt: string) => void;
  disabled: boolean;
}) {
  if (!options.length) return null;
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {selected.length ? <span className="field-count"> · {selected.length} selected</span> : null}
      </span>
      <div className="checkgroup">
        {options.map((o) => (
          <label key={o} className={`chip-check${selected.includes(o) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} disabled={disabled} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
