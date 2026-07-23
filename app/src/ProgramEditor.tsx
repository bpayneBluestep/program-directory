/* =====================================================================
   ProgramEditor.tsx — the profile editor for one program. Loads the full
   record, tracks working state + dirtiness against the last-saved baseline,
   and saves the five editable fields as a partial. The logo saves on its
   own (see LogoUpload). A live ListingPreview mirrors the working state.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiGetProgram,
  apiSaveProgram,
  LoggedOutError,
  parseContacts,
  serializeContacts,
  type Contact,
  type Program,
} from './api';
import ContactsEditor from './ContactsEditor';
import ListingPreview from './ListingPreview';
import LogoUpload from './LogoUpload';
import { Icon, Spinner, StatusBadge, useToast } from './ui';

interface Props {
  programId: string;
  canSwitch: boolean;
  onSwitch: () => void;
  onLoggedOut: () => void;
}

// The working, editable slice of a program (everything the form touches).
interface Draft {
  programName: string;
  website: string;
  overview: string;
  admissionsContact: string;
  contacts: Contact[];
}

function draftFromProgram(p: Program): Draft {
  return {
    programName: p.programName || '',
    website: p.website || '',
    overview: p.overview || '',
    admissionsContact: p.admissionsContact || '',
    contacts: parseContacts(p),
  };
}

// Compare current draft to the baseline to drive the Save button + guard.
function isDirty(a: Draft, b: Draft): boolean {
  return (
    a.programName !== b.programName ||
    a.website !== b.website ||
    a.overview !== b.overview ||
    a.admissionsContact !== b.admissionsContact ||
    serializeContacts(a.contacts) !== serializeContacts(b.contacts)
  );
}

export default function ProgramEditor({ programId, canSwitch, onSwitch, onLoggedOut }: Props) {
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await apiGetProgram(programId);
      const d = draftFromProgram(p);
      setProgram(p);
      setDraft(d);
      setBaseline(d);
      setLogoUrl(p.logoUrl || '');
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      setLoadError(err instanceof Error ? err.message : 'Could not load this program.');
    } finally {
      setLoading(false);
    }
  }, [programId, onLoggedOut]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => (draft && baseline ? isDirty(draft, baseline) : false), [draft, baseline]);

  // Warn on tab close / reload while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function handleSave() {
    if (!draft || saving || !dirty) return;
    setSaving(true);
    try {
      const result = await apiSaveProgram(programId, {
        programName: draft.programName.trim(),
        website: draft.website.trim(),
        overview: draft.overview,
        admissionsContact: draft.admissionsContact.trim(),
        contactsJson: serializeContacts(draft.contacts),
      });
      // Re-baseline from the server's authoritative copy.
      const saved = draftFromProgram(result);
      setProgram(result);
      setDraft(saved);
      setBaseline(saved);
      if (result.logoUrl !== undefined) setLogoUrl(result.logoUrl || '');

      const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
      if (warnings.length > 0) {
        toast.push('info', `Saved with ${warnings.length === 1 ? 'a note' : 'notes'}: ${warnings.join(' ')}`);
      } else {
        toast.push('success', 'Changes saved.');
      }
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      toast.push('error', err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (baseline) setDraft(baseline);
  }

  if (loading) {
    return (
      <div className="state-center">
        <Spinner label="Loading your program…" />
      </div>
    );
  }

  if (loadError || !draft || !program) {
    return (
      <div className="state-center">
        <div className="state-card">
          <div className="state-icon state-icon-alert">
            <Icon name="alert" size={22} />
          </div>
          <h2 className="state-title">We couldn&rsquo;t load this program</h2>
          <p className="state-text">{loadError || 'Something went wrong.'}</p>
          <button className="btn btn-primary" onClick={load}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {/* Program title row */}
      <header className="editor-head">
        <div className="editor-head-main">
          <div className={`editor-logo${logoUrl ? '' : ' editor-logo-empty'}`}>
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <span aria-hidden="true">{(draft.programName || 'P').trim().charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="editor-eyebrow">Editing your listing</p>
            <h1 className="editor-title">{draft.programName.trim() || program.programName || 'Untitled program'}</h1>
            <div className="editor-meta">
              <StatusBadge status={program.portalStatus} />
              {program.shortId ? <span className="editor-id">ID {program.shortId}</span> : null}
            </div>
          </div>
        </div>
        {canSwitch ? (
          <button className="btn btn-ghost" onClick={onSwitch}>
            <Icon name="switch" size={16} />
            Switch program
          </button>
        ) : null}
      </header>

      <div className="editor-body">
        {/* Left: the form */}
        <div className="editor-form">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Basics</h2>
              <p className="card-sub">The name, site, and who handles admissions.</p>
            </div>
            <div className="card-body">
              <label className="field">
                <span className="field-label">Program name</span>
                <input
                  className="input"
                  type="text"
                  value={draft.programName}
                  onChange={(e) => set('programName', e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span className="field-label">Website</span>
                <input
                  className="input"
                  type="url"
                  inputMode="url"
                  placeholder="https://yourprogram.org"
                  value={draft.website}
                  onChange={(e) => set('website', e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span className="field-label">Admissions contact</span>
                <input
                  className="input"
                  type="text"
                  placeholder="Name, phone, or email for admissions inquiries"
                  value={draft.admissionsContact}
                  onChange={(e) => set('admissionsContact', e.target.value)}
                  disabled={saving}
                />
                <span className="field-help">A quick line families can act on — the rest goes under Contacts.</span>
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Overview</h2>
              <p className="card-sub">The story families read first. Plain language, no jargon.</p>
            </div>
            <div className="card-body">
              <label className="field">
                <span className="sr-only">Overview</span>
                <textarea
                  className="input textarea"
                  rows={7}
                  placeholder="Who you serve, the care you provide, and what makes your program distinct."
                  value={draft.overview}
                  onChange={(e) => set('overview', e.target.value)}
                  disabled={saving}
                />
                <span className="field-help">{draft.overview.trim().length} characters</span>
              </label>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Contacts</h2>
              <p className="card-sub">The people a referring family or professional should reach.</p>
            </div>
            <div className="card-body">
              <ContactsEditor
                contacts={draft.contacts}
                onChange={(next) => set('contacts', next)}
                disabled={saving}
              />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Logo</h2>
              <p className="card-sub">Saved on upload — separate from the changes below.</p>
            </div>
            <div className="card-body">
              <LogoUpload
                programId={programId}
                logoUrl={logoUrl}
                programName={draft.programName}
                onLogoChange={setLogoUrl}
                onLoggedOut={onLoggedOut}
              />
            </div>
          </section>
        </div>

        {/* Right: live listing preview (signature) */}
        <aside className="editor-side">
          <ListingPreview
            programName={draft.programName}
            website={draft.website}
            overview={draft.overview}
            admissionsContact={draft.admissionsContact}
            contacts={draft.contacts}
            logoUrl={logoUrl}
            portalStatus={program.portalStatus}
          />
        </aside>
      </div>

      {/* Sticky save bar */}
      <div className={`savebar${dirty ? ' savebar-active' : ''}`}>
        <span className="savebar-status" aria-live="polite">
          {saving ? 'Saving…' : dirty ? 'You have unsaved changes' : 'All changes saved'}
        </span>
        <div className="savebar-actions">
          <button className="btn btn-ghost" onClick={handleReset} disabled={!dirty || saving}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
