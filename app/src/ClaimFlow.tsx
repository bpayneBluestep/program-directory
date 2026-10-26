/* =====================================================================
   ClaimFlow.tsx — /claim/:id. Four steps:
     1. Confirm   — the listing as it stands today ("is this you?")
     2. Details   — name, role, work email
     3. Verify    — the 6-digit code we email to that address
     4. Sign-in   — a new email chooses a password (the email is the sign-in) and lands in
                    the portal signed in; an email that already has an
                    account gets the program added to it and signs in.
   Reps are Program Directory accounts (not BlueStep users), created here
   by /b/claim createAccount once the code proves the inbox.
   The domain rule (email domain = program website) is decided server-side;
   the UI only previews it so the rep knows which email gets instant access.
   ===================================================================== */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  apiClaimStart,
  apiClaimVerify,
  apiCreateAccount,
  apiPreviewProgram,
  type ClaimResult,
  type ClaimStart,
  type ProgramPreview,
} from './api';
import { prettyHost } from './Landing';
import { Icon, Spinner, TopBar, VerifiedBadge } from './ui';

type Step = 'confirm' | 'details' | 'verify' | 'account' | 'done';
type NeedsAccount = Extract<ClaimResult, { outcome: 'needsAccount' }>;
type Linked = Exclude<ClaimResult, { outcome: 'needsAccount' }>;
const STEPS: { key: Step; label: string }[] = [
  { key: 'confirm', label: 'Confirm' },
  { key: 'details', label: 'Your details' },
  { key: 'verify', label: 'Verify' },
  { key: 'account', label: 'Sign in' },
];
const MIN_PASSWORD = 10;

export default function ClaimFlow() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [program, setProgram] = useState<ProgramPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('confirm');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [started, setStarted] = useState<ClaimStart | null>(null);

  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<NeedsAccount | null>(null);
  const [linked, setLinked] = useState<Linked | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

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
      if (step === 'verify') setNotice(`We sent a new code to ${s.emailMasked}.`);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.');
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
      if (r.outcome === 'needsAccount') {
        setSetup(r);
        setUsername(r.suggestedUsername);
        setStep('account');
      } else {
        setLinked(r);
        setStep('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    if (busy || !setup) return;
    setError(null);
    const u = username.trim().toLowerCase(); // the verified email
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await apiCreateAccount(setup.setupToken, u, password);
      navigate('/portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <TopBar>
        <Link className="btn btn-ghost btn-sm" to="/">
          <Icon name="arrowLeft" size={15} /> Search
        </Link>
        <Link className="btn btn-outline btn-sm" to="/portal">
          Sign in
        </Link>
      </TopBar>

      <main className="claim">
        <Stepper current={step} />

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
            <p className="muted">We&rsquo;ll email you a code to confirm the address.</p>

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
                {busy ? 'Sending…' : 'Continue'}
              </button>
            </div>
            <RecaptchaNote />
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

            <div className="claim-actions">
              <button type="button" className="btn btn-ghost" onClick={() => sendCode()} disabled={busy}>
                Send a new code
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Checking…' : 'Verify'}
              </button>
            </div>
            <button type="button" className="link-btn" onClick={() => setStep('details')} disabled={busy}>
              Use a different email
            </button>
          </form>
        ) : step === 'account' && setup ? (
          <form className="card claim-card" onSubmit={createAccount} noValidate>
            <p className="eyebrow">Claiming {program.name}</p>
            <h1 className="claim-title">Create your sign-in</h1>
            <p className="muted">Choose a password. You&rsquo;ll sign in with your email from now on.</p>

            {error ? <div className="form-error" role="alert">{error}</div> : null}

            <label className="field">
              <span className="field-label">Email</span>
              {/* Read-only, but a real field so password managers save the pair. */}
              <input className="input" type="email" autoComplete="username" value={username} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <span className="field-help">At least {MIN_PASSWORD} characters. A few unrelated words work well.</span>
            </label>
            <label className="field">
              <span className="field-label">Confirm password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>

            <div className={`callout ${setup.domainMatch ? 'callout-success' : 'callout-warning'}`}>
              <Icon name={setup.domainMatch ? 'shield' : 'clock'} size={16} />
              <span>
                {setup.domainMatch
                  ? <>Your email matches {prettyHost(program.website)}, so you can edit the listing as soon as you&rsquo;re in.</>
                  : <>Your email doesn&rsquo;t match the program&rsquo;s website, so our team will confirm the claim first, usually within one business day. We&rsquo;ll email you when editing unlocks.</>}
              </span>
            </div>

            <div className="claim-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creating your account…' : 'Create account and continue'}
              </button>
            </div>
            <RecaptchaNote />
          </form>
        ) : linked ? (
          <Outcome result={linked} />
        ) : null}
      </main>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === current);
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

// Google's terms allow hiding the badge only when this text is shown instead;
// we keep the badge and add the line where a protected form submits.
export function RecaptchaNote() {
  return (
    <p className="recaptcha-note">
      Protected by reCAPTCHA. Google&rsquo;s{' '}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and{' '}
      <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms of Service</a> apply.
    </p>
  );
}

function ConfirmStep({ program, onNext }: { program: ProgramPreview; onNext: () => void }) {
  const ages =
    program.ageMin != null || program.ageMax != null
      ? `Ages ${program.ageMin ?? '?'}–${program.ageMax ?? '?'}`
      : '';
  const facts = [...program.programType, ...program.levelOfCare].filter((v, i, a) => a.indexOf(v) === i);
  const crawled = /crawl/i.test(program.dataSource);

  return (
    <div className="card claim-card">
      <p className="eyebrow">Is this your program?</p>
      <div className="listing-head">
        <span className="result-mark result-mark-lg" aria-hidden="true">
          {program.name.trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="claim-title">{program.name}</h1>
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

      <dl className="facts">
        {facts.length ? (
          <div>
            <dt>Type of care</dt>
            <dd>{facts.join(' · ')}</dd>
          </div>
        ) : null}
        {ages || program.genderServed.length ? (
          <div>
            <dt>Who you serve</dt>
            <dd>{[ages, program.genderServed.join(', ')].filter(Boolean).join(' · ')}</dd>
          </div>
        ) : null}
        {program.specialties.length ? (
          <div>
            <dt>Specialties</dt>
            <dd>{program.specialties.join(' · ')}</dd>
          </div>
        ) : null}
        <div>
          <dt>Admissions contact</dt>
          <dd>{program.hasAdmissions ? 'On file' : <span className="muted">Missing</span>}</dd>
        </div>
      </dl>

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

// The email already had an account: the program was added to it (or queued for
// review), and they sign in with their email and existing password.
function Outcome({ result }: { result: Linked }) {
  const signIn = `/portal?u=${encodeURIComponent(result.username)}`;
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
        <div className="claim-actions">
          <Link className="btn btn-outline" to="/">Back to the directory</Link>
          <Link className="btn btn-primary" to={signIn}>Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card claim-card claim-outcome">
      <span className="outcome-icon outcome-icon-success"><Icon name="check" size={22} /></span>
      <h1 className="claim-title">{result.programName} is yours.</h1>
      <p>
        You already have an account, so we added it there. Sign in with <strong>{result.username}</strong> to confirm
        your essentials and earn the verified badge.
      </p>
      <div className="claim-actions">
        <Link className="btn btn-primary" to={signIn}>
          Sign in to your listing <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  );
}
