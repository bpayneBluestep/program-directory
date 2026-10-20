/* =====================================================================
   Essentials.tsx — the guided first pass a rep sees on an unverified
   listing: four short steps (basics, specialties, who you serve,
   admissions) built from the same schema-driven controls as the full
   editor. Finishing saves every essential field, which stamps the
   verified badge server-side. "Skip to the full editor" is always there.
   ===================================================================== */

import { useState } from 'react';
import { apiSaveProgram, LoggedOutError, type EditableFields, type PortalMeta, type Program } from './api';
import { buildDraft, FieldControl, type Draft } from './ProgramEditor';
import { Icon, useToast } from './ui';

const STEPS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: 'The basics',
    blurb: 'How consultants and families find and recognise you.',
    keys: ['programName', 'website', 'locationCity', 'locationState', 'overview'],
  },
  {
    title: 'What you treat',
    blurb: 'Your primary focus and specialties drive search matches.',
    keys: ['primaryFocus', 'specialties'],
  },
  {
    title: 'Who you serve',
    blurb: 'Ages, gender and level of care — the first filters consultants apply.',
    keys: ['ageMin', 'ageMax', 'genderServed', 'levelOfCare'],
  },
  {
    title: 'Admissions',
    blurb: 'Who a consultant should call, and whether you have openings.',
    keys: ['admissionsContact', 'currentOpenings', 'admissionsTimeline'],
  },
];

interface Props {
  programId: string;
  meta: PortalMeta;
  program: Program;
  onDone: (saved: Program) => void;
  onSkip: () => void;
  onLoggedOut: () => void;
}

export default function Essentials({ programId, meta, program, onDone, onSkip, onLoggedOut }: Props) {
  const [draft, setDraft] = useState<Draft>(() => buildDraft(program, meta));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const byKey = new Map(meta.fields.map((f) => [f.key, f]));
  const current = STEPS[step];
  const fields = current.keys.map((k) => byKey.get(k)).filter(Boolean) as PortalMeta['fields'];
  const last = step === STEPS.length - 1;

  function setValue(key: string, value: unknown) {
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: value } }));
  }

  // Send every essential field (changed or not): confirming them unchanged is
  // still the rep vouching for the listing, and the save is what verifies it.
  async function finish() {
    if (saving) return;
    const out: EditableFields = {};
    for (const s of STEPS) {
      for (const k of s.keys) {
        const f = byKey.get(k);
        if (!f) continue;
        const v = draft.values[k];
        if (f.type === 'number') out[k] = v === '' || v == null ? '' : Number(v);
        else if (f.type === 'multi') out[k] = (v as string[]) || [];
        else if (f.type === 'boolean') out[k] = v === true;
        else out[k] = (v as string) ?? '';
      }
    }
    setSaving(true);
    try {
      const saved = await apiSaveProgram(programId, out);
      toast.push('success', 'Your listing is verified. Thank you!');
      onDone(saved);
    } catch (err) {
      if (err instanceof LoggedOutError) {
        onLoggedOut();
        return;
      }
      toast.push('error', err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <div className="essentials">
      <header className="essentials-head">
        <div>
          <p className="eyebrow">Confirm the essentials · {program.programName}</p>
          <h1 className="page-title">{current.title}</h1>
          <p className="muted">{current.blurb}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onSkip} disabled={saving}>
          Skip to the full editor
        </button>
      </header>

      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
        {STEPS.map((s, i) => (
          <span key={s.title} className={`progress-seg${i <= step ? ' is-on' : ''}`} title={s.title} />
        ))}
      </div>

      <section className="card">
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
                onContactsChange={(next) => setDraft((d) => ({ ...d, contacts: next }))}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="essentials-actions">
        <span className="muted">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="essentials-buttons">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>
              Back
            </button>
          ) : null}
          {last ? (
            <button className="btn btn-primary" onClick={finish} disabled={saving}>
              <Icon name="shield" size={15} />
              {saving ? 'Saving…' : 'Confirm and verify listing'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next <Icon name="arrowRight" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
