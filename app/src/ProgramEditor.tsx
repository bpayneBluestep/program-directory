/* =====================================================================
   ProgramEditor.tsx — the full profile editor for one program.

   Schema-driven: the field catalog, section order, and option lists come
   from the endpoint (getMeta), so the form renders every program-editable
   field without hardcoding the 50-field schema here. Each field renders the
   right control for its type (text / memo / number / boolean / single- /
   multi-select), plus the structured Contacts editor and the Logo uploader.

   Working state is tracked against a last-saved baseline; Save sends only the
   changed fields as a partial. A live ListingPreview mirrors the headline
   fields. The logo saves on its own (see LogoUpload).
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiGetMeta,
  apiGetProgram,
  apiSaveProgram,
  LoggedOutError,
  parseContacts,
  serializeContacts,
  type Contact,
  type EditableFields,
  type FieldMeta,
  type PortalMeta,
  type Program,
} from './api';
import ContactsEditor from './ContactsEditor';
import Essentials from './Essentials';
import ListingPreview from './ListingPreview';
import LogoUpload from './LogoUpload';
import { Icon, Spinner, StatusBadge, useToast, VerifiedBadge } from './ui';

interface Props {
  programId: string;
  canSwitch: boolean;
  onSwitch: () => void;
  onLoggedOut: () => void;
  // /admin: a super editing someone else's listing. No guided essentials, and the
  // switch button goes back to the program list.
  admin?: boolean;
}

// The working, editable slice: every catalog field's value (keyed by catalog
// key) plus the structured contacts list (contactsJson is derived on save).
export interface Draft {
  values: Record<string, unknown>;
  contacts: Contact[];
}

const LOGO_SECTION = 'Logo';

function anchorId(section: string): string {
  return 'sec-' + section.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Build the working draft from a loaded program per the schema. Values are
// normalized to what each control edits: multi → string[], boolean → bool,
// everything else → string (number kept as its string form for the input).
export function buildDraft(p: Program, meta: PortalMeta): Draft {
  const values: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (f.widget === 'contacts') continue;
    const v = p[f.key];
    if (f.type === 'multi') values[f.key] = Array.isArray(v) ? [...(v as string[])] : [];
    else if (f.type === 'boolean') values[f.key] = v === true;
    else if (f.type === 'number') values[f.key] = v === null || v === undefined ? '' : String(v);
    else values[f.key] = v == null ? '' : String(v);
  }
  return { values, contacts: parseContacts(p) };
}

// The changed keys, in the shape the endpoint's write engine expects. Number
// fields send an actual number (or '' to clear); contacts serialize to JSON.
function changedFields(draft: Draft, base: Draft, meta: PortalMeta): EditableFields {
  const out: EditableFields = {};
  for (const f of meta.fields) {
    if (f.widget === 'contacts') continue;
    const a = draft.values[f.key];
    const b = base.values[f.key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (f.type === 'number') out[f.key] = a === '' ? '' : Number(a);
    else if (f.type === 'multi') out[f.key] = (a as string[]) || [];
    else if (f.type === 'boolean') out[f.key] = a === true;
    else out[f.key] = (a as string) ?? '';
  }
  const cj = serializeContacts(draft.contacts);
  if (cj !== serializeContacts(base.contacts)) out.contactsJson = cj;
  return out;
}

export default function ProgramEditor({ programId, canSwitch, onSwitch, onLoggedOut, admin = false }: Props) {
  const [meta, setMeta] = useState<PortalMeta | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  // Unverified listings open on the guided essentials first.
  const [guided, setGuided] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Meta + record in parallel; meta rarely changes but is cheap to refetch.
      const [m, p] = await Promise.all([apiGetMeta(), apiGetProgram(programId)]);
      const d = buildDraft(p, m);
      setMeta(m);
      setProgram(p);
      setDraft(d);
      setBaseline(d);
      setLogoUrl(p.logoUrl || '');
      setGuided(!admin && !p.verified);
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      setLoadError(err instanceof Error ? err.message : 'Could not load this program.');
    } finally {
      setLoading(false);
    }
  }, [programId, onLoggedOut, admin]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(
    () => (draft && baseline && meta ? changedFields(draft, baseline, meta) : {}),
    [draft, baseline, meta],
  );
  const dirty = Object.keys(pending).length > 0;

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

  const setValue = useCallback((key: string, value: unknown) => {
    setDraft((d) => (d ? { ...d, values: { ...d.values, [key]: value } } : d));
  }, []);
  const setContacts = useCallback((next: Contact[]) => {
    setDraft((d) => (d ? { ...d, contacts: next } : d));
  }, []);

  async function handleSave() {
    if (!draft || !meta || saving || !dirty) return;
    setSaving(true);
    try {
      const result = await apiSaveProgram(programId, pending);
      const saved = buildDraft(result, meta);
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

  if (loadError || !draft || !program || !meta) {
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

  if (guided) {
    return (
      <Essentials
        programId={programId}
        meta={meta}
        program={program}
        onLoggedOut={onLoggedOut}
        onSkip={() => setGuided(false)}
        onDone={(saved) => {
          const d = buildDraft(saved, meta);
          setProgram(saved);
          setDraft(d);
          setBaseline(d);
          setGuided(false);
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  const programName = String(draft.values.programName || '');
  const navSections = [...meta.sections, LOGO_SECTION];

  return (
    <div className="editor">
      {/* Program title row */}
      <header className="editor-head">
        <div className="editor-head-main">
          <div className={`editor-logo${logoUrl ? '' : ' editor-logo-empty'}`}>
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <span aria-hidden="true">{(programName || 'P').trim().charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="editor-eyebrow">{admin ? 'Admin edit · saving does not verify the listing' : 'Editing your listing'}</p>
            <h1 className="editor-title">{programName.trim() || program.programName || 'Untitled program'}</h1>
            <div className="editor-meta">
              <StatusBadge status={program.portalStatus} />
              {program.verified ? <VerifiedBadge lastVerified={program.lastVerified} /> : null}
              {program.shortId ? <span className="editor-id">ID {program.shortId}</span> : null}
            </div>
          </div>
        </div>
        <div className="editor-head-actions">
          {!program.verified && !admin ? (
            <button className="btn btn-outline btn-sm" onClick={() => setGuided(true)}>
              <Icon name="shield" size={15} />
              Verify the essentials
            </button>
          ) : null}
          {canSwitch ? (
            <button className="btn btn-ghost btn-sm" onClick={onSwitch}>
              <Icon name={admin ? 'arrowLeft' : 'switch'} size={16} />
              {admin ? 'All programs' : 'Switch program'}
            </button>
          ) : null}
        </div>
      </header>

      {/* Section jump nav */}
      <nav className="editor-nav" aria-label="Profile sections">
        {navSections.map((s) => (
          <a key={s} className="editor-nav-chip" href={`#${anchorId(s)}`}>
            {s}
          </a>
        ))}
      </nav>

      <div className="editor-body">
        {/* Left: the form, one card per section */}
        <div className="editor-form">
          {meta.sections.map((section) => {
            const fields = meta.fields.filter((f) => f.section === section);
            if (!fields.length) return null;
            return (
              <section className="card" id={anchorId(section)} key={section}>
                <div className="card-head">
                  <h2 className="card-title">{section}</h2>
                </div>
                <div className="card-body">
                  <div className="field-grid">
                    {fields.map((f) => (
                      <FieldControl
                        key={f.key}
                        field={f}
                        value={draft.values[f.key]}
                        options={meta.options[f.key] || []}
                        contacts={draft.contacts}
                        disabled={saving}
                        onChange={(v) => setValue(f.key, v)}
                        onContactsChange={setContacts}
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Logo — saves on upload, separate from the field changes above */}
          <section className="card" id={anchorId(LOGO_SECTION)}>
            <div className="card-head">
              <h2 className="card-title">Logo</h2>
              <p className="card-sub">Saved on upload — separate from the changes below.</p>
            </div>
            <div className="card-body">
              <LogoUpload
                programId={programId}
                logoUrl={logoUrl}
                programName={programName}
                onLogoChange={setLogoUrl}
                onLoggedOut={onLoggedOut}
              />
            </div>
          </section>
        </div>

        {/* Right: live listing preview */}
        <aside className="editor-side">
          <ListingPreview
            programName={programName}
            website={String(draft.values.website || '')}
            overview={String(draft.values.overview || '')}
            admissionsContact={String(draft.values.admissionsContact || '')}
            contacts={draft.contacts}
            logoUrl={logoUrl}
            portalStatus={program.portalStatus}
            verified={program.verified === true}
            lastVerified={program.lastVerified}
          />
        </aside>
      </div>

      {/* Sticky save bar */}
      <div className={`savebar${dirty ? ' savebar-active' : ''}`}>
        <span className="savebar-status" aria-live="polite">
          {saving
            ? 'Saving…'
            : dirty
              ? `You have unsaved changes${
                  Object.keys(pending).length ? ` (${Object.keys(pending).length})` : ''
                }`
              : 'All changes saved'}
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

/* ---- one field, rendered by type ---- */

interface FieldControlProps {
  field: FieldMeta;
  value: unknown;
  options: string[];
  contacts: Contact[];
  disabled: boolean;
  onChange: (value: unknown) => void;
  onContactsChange: (next: Contact[]) => void;
}

export function FieldControl({ field, value, options, contacts, disabled, onChange, onContactsChange }: FieldControlProps) {
  // Structured contacts editor.
  if (field.widget === 'contacts') {
    return (
      <div className="field field-wide">
        <span className="field-label">{field.label}</span>
        <ContactsEditor contacts={contacts} onChange={onContactsChange} disabled={disabled} />
      </div>
    );
  }

  if (field.type === 'memo') {
    const v = String(value ?? '');
    return (
      <label className="field field-wide">
        <span className="field-label">{field.label}</span>
        <textarea
          className="input textarea"
          rows={6}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <span className="field-help">{v.trim().length} characters</span>
      </label>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="field field-bool">
        <label className="switch">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
          <span className="field-label switch-label">{field.label}</span>
        </label>
      </div>
    );
  }

  if (field.type === 'single') {
    return (
      <label className="field">
        <span className="field-label">{field.label}</span>
        <select className="input select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">— Select —</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'multi') {
    const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
    };
    return (
      <div className="field field-wide">
        <span className="field-label">
          {field.label}
          {selected.length ? <span className="field-count"> · {selected.length} selected</span> : null}
        </span>
        {options.length ? (
          <div className="checkgroup">
            {options.map((o) => (
              <label key={o} className={`chip-check${selected.includes(o) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} disabled={disabled} />
                <span>{o}</span>
              </label>
            ))}
          </div>
        ) : (
          <span className="field-help">No options configured.</span>
        )}
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <label className="field">
        <span className="field-label">{field.label}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </label>
    );
  }

  if (field.type === 'date') {
    return (
      <label className="field">
        <span className="field-label">{field.label}</span>
        <input className="input" type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      </label>
    );
  }

  // text (default)
  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      <input
        className="input"
        type={field.key === 'website' ? 'url' : 'text'}
        inputMode={field.key === 'website' ? 'url' : undefined}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}
