/* =====================================================================
   ClaimFlow.tsx — /claim/:id. Four steps:
     1. Confirm   — the listing as it stands today ("is this you?")
     2. Details   — name, role, work email → a 6-digit code is emailed
     3. Verify    — the 6-digit code
     4. Outcome   — linked: go set a password (new) or sign in (existing);
                    pending: a person reviews it, editing unlocks on approval.
   New reps get the platform's own set-password email right after verify:
   scripts can't write the system Password field, so the endpoint creates
   the login and BlueStep's login-trouble flow hands them the password step.
   The domain rule (email domain = program website) is decided server-side;
   the UI only previews it so the rep knows which email gets instant access.
   ===================================================================== */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  apiClaimStart,
  apiClaimVerify,
  apiPreviewProgram,
  PASSWORD_HELP_URL,
  requestPasswordEmail,
  type ClaimResult,
  type ClaimStart,
  type ProgramPreview,
} from './api';
import { ListingFacts, ListingHead } from './ListingFacts';
import { Icon, Shell, Spinner } from './ui';

type Step = 'confirm' | 'details' | 'verify' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'confirm', label: 'Confirm' },
  { key: 'details', label: 'Your details' },
  { key: 'verify', label: 'Verify' },
  { key: 'done', label: 'Done' },
];

export default function ClaimFlow() {
  const { id = '' } = useParams();

  const [program, setProgram] = useState<ProgramPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('confirm');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [started, setStarted] = useState<ClaimStart | null>(null);

  const [code, setCode] = useState('');
  const [result, setResult] = useState<ClaimResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiPreviewProgram(id)
      .then((p) => live && setProgram(p))
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'Could not load this program.'));
    return () => {
      live = false;
    };
  }, [id]);

  const domain = program?.domain || '';
  const emailDomain = email.includes('@') ? email.split('@').pop()!.trim().toLowerCase() : '';
  const looksMatched = !!domain && !!emailDomain && (emailDomain === domain || emailDomain.endsWith('.' + domain));

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!firstName.trim() || !lastName.trim()) return setError('Please enter your first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid work email.');
    setBusy(true);
    try {
      const s = await apiClaimStart({
        programId: id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role.trim(),
        email: email.trim(),
      });
      setStarted(s);
      setCode('');
      setStep('verify');
      if (step === 'verify') setNotice(`We sent a new code to ${s.emailMasked}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy || !started) return;
    setError(null);
    setNotice(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      const r = await apiClaimVerify(started.token, digits);
      if (!r.existingUser) await requestPasswordEmail(r.username);
      setResult(r);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Claim a listing">
      <main className="flow">
        <aside className="flow-rail">
          <p className="eyebrow">Claim a listing</p>
          <p className="flow-rail-title">{program ? program.name : loadError ? 'Program not found' : 'Loading…'}</p>
          {program?.location ? <p className="flow-rail-sub">{program.location}</p> : null}
          <Stepper current={step} />
          <p className="flow-rail-help">
            Stuck? <a href="mailto:bpayne@bluestep.net">Email us</a> and a person will help.
          </p>
        </aside>

        <div className="flow-body">
          {loadError ? (
            <div className="card claim-card">
              <h1 className="claim-title">We couldn&rsquo;t find that program</h1>
              <p className="muted">{loadError}</p>
              <Link className="btn btn-primary" to="/">
                Back to search
              </Link>
            </div>
          ) : !program ? (
            <div className="state-center">
              <Spinner label="Loading the listing…" />
            </div>
          ) : step === 'confirm' ? (
            <ConfirmStep program={program} onNext={() => setStep('details')} />
          ) : step === 'details' ? (
            <form className="card claim-card" onSubmit={sendCode} noValidate>
              <p className="eyebrow">Claiming {program.name}</p>
              <h1 className="claim-title">Tell us who you are</h1>
              <p className="muted">
                We&rsquo;ll email a 6-digit code to confirm the address. Your email becomes your sign-in.
              </p>

              {error ? <div className="form-error" role="alert">{error}</div> : null}

              <div className="field-row">
                <label className="field">
                  <span className="field-label">First name</span>
                  <input className="input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={busy} autoFocus />
                </label>
                <label className="field">
                  <span className="field-label">Last name</span>
                  <input className="input" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={busy} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Your role</span>
                <input className="input" placeholder="e.g. Admissions Director" autoComplete="organization-title" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span className="field-label">Work email</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={domain ? `you@${domain}` : 'you@yourprogram.org'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>

              {domain ? (
                <div className={`callout ${emailDomain ? (looksMatched ? 'callout-success' : 'callout-warning') : 'callout-info'}`}>
                  <Icon name={emailDomain && !looksMatched ? 'clock' : 'shield'} size={16} />
                  <span>
                    {!emailDomain ? (
                      <>An email ending in <strong>@{domain}</strong> gets instant access. Other addresses are reviewed by our team first.</>
                    ) : looksMatched ? (
                      <>That matches <strong>{domain}</strong>, so you&rsquo;ll get instant access.</>
                    ) : (
                      <>That doesn&rsquo;t match <strong>{domain}</strong>. You can still claim; our team will confirm it before editing unlocks, usually within a business day.</>
                    )}
                  </span>
                </div>
              ) : null}

              <div className="claim-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('confirm')} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Email me a code'}
                </button>
              </div>
            </form>
          ) : step === 'verify' && started ? (
            <form className="card claim-card" onSubmit={verify} noValidate>
              <p className="eyebrow">Claiming {program.name}</p>
              <h1 className="claim-title">Check your email</h1>
              <p className="muted">
                We sent a 6-digit code to <strong>{started.emailMasked}</strong>. It expires in 15 minutes.
              </p>

              {error ? <div className="form-error" role="alert">{error}</div> : null}
              {notice ? <div className="callout callout-info" role="status"><Icon name="mail" size={16} /><span>{notice}</span></div> : null}

              <label className="field">
                <span className="field-label">6-digit code</span>
                <input
                  className="input input-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                  disabled={busy}
                  autoFocus
                />
              </label>

              {started.existingUser ? (
                <div className="callout callout-info">
                  <Icon name="lock" size={16} />
                  <span>You already have an account with this email. After verifying, sign in with your existing password.</span>
                </div>
              ) : null}

              <div className="claim-actions">
                <button type="button" className="btn btn-ghost" onClick={() => sendCode()} disabled={busy}>
                  Send a new code
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Checking…' : started.existingUser ? 'Verify' : 'Verify and create my account'}
                </button>
              </div>
              <button type="button" className="link-btn" onClick={() => setStep('details')} disabled={busy}>
                Use a different email
              </button>
            </form>
          ) : result ? (
            <Outcome result={result} email={result.username} />
          ) : null}
        </div>
      </main>
    </Shell>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="stepper" aria-label="Claim progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className={i < idx ? 'is-done' : i === idx ? 'is-current' : ''} aria-current={i === idx ? 'step' : undefined}>
          <span className="stepper-dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="stepper-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ConfirmStep({ program, onNext }: { program: ProgramPreview; onNext: () => void }) {
  const crawled = /crawl/i.test(program.dataSource);

  return (
    <div className="card claim-card">
      <p className="eyebrow">Is this your program?</p>
      <ListingHead program={program} as="h1" />
      <ListingFacts program={program} />

      {program.state === 'managed' ? (
        <div className="callout callout-info">
          <Icon name="building" size={16} />
          <span>Someone at this program already manages the listing. You can still request access; colleagues at the same email domain get in right away.</span>
        </div>
      ) : program.state === 'pending' ? (
        <div className="callout callout-warning">
          <Icon name="clock" size={16} />
          <span>A claim on this listing is already under review. If that wasn&rsquo;t you, continue and we&rsquo;ll sort it out.</span>
        </div>
      ) : crawled ? (
        <div className="callout callout-info">
          <Icon name="search" size={16} />
          <span>We built this listing from public information on your website. Claim it to correct anything and earn the verified badge.</span>
        </div>
      ) : null}

      <div className="claim-actions">
        <Link className="btn btn-ghost" to="/">
          Not us
        </Link>
        <button className="btn btn-primary" onClick={onNext}>
          This is our program <Icon name="arrowRight" size={15} />
        </button>
      </div>
    </div>
  );
}

function Outcome({ result, email }: { result: ClaimResult; email: string }) {
  const passwordStep = !result.existingUser ? (
    <div className="callout callout-info outcome-next">
      <Icon name="mail" size={16} />
      <span>
        <strong>Next: set your password.</strong> We just emailed <strong>{email}</strong> a link to choose one. Your
        email is your username. No email in a few minutes?{' '}
        <a href={PASSWORD_HELP_URL}>Send it again</a>.
      </span>
    </div>
  ) : null;

  if (result.outcome === 'pending') {
    return (
      <div className="card claim-card claim-outcome">
        <span className="outcome-icon outcome-icon-warning"><Icon name="clock" size={22} /></span>
        <h1 className="claim-title">Thanks. We&rsquo;re confirming your claim.</h1>
        <p>
          Your email domain doesn&rsquo;t match the website we have for <strong>{result.programName}</strong>, so a
          person on our team will confirm it, usually within one business day. We&rsquo;ll email you the moment
          editing unlocks.
        </p>
        {passwordStep}
        <div className="claim-actions">
          <Link className="btn btn-outline" to="/">Back to the directory</Link>
          <Link className="btn btn-primary" to="/portal">Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card claim-card claim-outcome">
      <span className="outcome-icon outcome-icon-success"><Icon name="check" size={22} /></span>
      <h1 className="claim-title">{result.programName} is yours.</h1>
      <p>
        {result.existingUser
          ? <>Sign in with <strong>{email}</strong> to confirm your essentials and earn the verified badge.</>
          : <>Your work email matched, so you have instant access. Once your password is set, sign in to confirm your essentials and earn the verified badge.</>}
      </p>
      {passwordStep}
      <div className="claim-actions">
        <Link className="btn btn-primary" to="/portal">
          Sign in to your listing <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  );
}
