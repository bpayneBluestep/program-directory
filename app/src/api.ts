/* =====================================================================
   api.ts — the single seam between the SPA and the backend.

   Everything the portal reads or writes goes through the same-origin
   BlueStep endpoint at /b/portal as a JSON action envelope:
     request : GET  ?action=…            |  POST { action, … }
     reply   : { ok:true, data }         |  { ok:false, error }

   AUTH: reps are Program Directory accounts, not BlueStep users. /b/claim
   signs them in and hands back a session token (3 hours, no renewal); we
   keep it in localStorage and send it as the X-PD-Session header on every
   /b/portal and /b/claim call. A logged-out reply is { ok:false,
   loggedOut:true } and surfaces as LoggedOutError so the app shows the
   sign-in screen. BlueStep super users still reach /admin through a real
   BlueStep login (the cookie), which /b/portal also honours.

   Public writes (claim, sign-up, sign-in, reset, new-listing request) carry
   an invisible reCAPTCHA v3 token the server checks with Google.
   ===================================================================== */

const PORTAL_URL = '/b/portal';
const LOGIN_URL = '/shared/login/login.jsp';

/* ---- domain models ---- */

export interface Session {
  loggedIn: boolean;
  userId: string;
  fullName: string;
  isSuper: boolean;
  username?: string;
  expiresAt?: number; // epoch ms; present for directory-account sessions
}

export interface ProgramSummary {
  id: string;
  programName: string;
  portalStatus: string;
  location?: string;
  verified?: boolean;
  lastVerified?: string;
  pending?: boolean; // a claim under review — listed, not editable yet
}

export interface Contact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

// A program record is now the full profile schema (getMeta defines the fields),
// so values are heterogeneous: string | number | null | boolean | string[]. The
// named members below are the few the SPA references directly (preview, logo,
// contacts, status); everything else is reached generically by catalog key.
export interface Program {
  id: string;
  shortId?: string;
  programName: string;
  website: string;
  overview: string;
  admissionsContact: string;
  contactsJson: string;
  contacts: Contact[] | null;
  portalStatus: string;
  logoUrl: string;
  verified?: boolean;
  lastVerified?: string;
  dataSource?: string;
  [key: string]: unknown;
}

// A partial save — any subset of catalog keys, each in its typed shape
// (string | number | boolean | string[]); contacts ride as a JSON string.
export type FieldValue = string | number | boolean | string[] | null;
export type EditableFields = Record<string, FieldValue>;

/* ---- editor schema (from getMeta) ---- */

export type FieldType = 'text' | 'memo' | 'single' | 'multi' | 'boolean' | 'number' | 'date';

export interface FieldMeta {
  key: string;
  label: string;
  type: FieldType;
  section: string;
  widget: string | null; // e.g. "contacts" — a special control
}

export interface PortalMeta {
  sections: string[];                    // section order for the editor
  fields: FieldMeta[];                   // catalog order
  options: Record<string, string[]>;     // available options per single/multi key
}

export interface SaveResult extends Program {
  warnings?: string[];
}

/* ---- logged-out signal ---- */

// Thrown by any portal call when the response indicates the session is gone.
// The app catches this to swap in the login gate instead of an error toast.
export class LoggedOutError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'LoggedOutError';
  }
}

/* ---- directory-account session (localStorage) ---- */

const SESSION_KEY = 'pd.session';

interface StoredSession {
  token: string;
  expiresAt: number;
}

// Fallback when localStorage is unavailable (private browsing).
let memorySession: StoredSession | null = null;

// The live session, or null when absent, unreadable or past its expiry.
export function getStoredSession(): StoredSession | null {
  let s: StoredSession | null = memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) s = JSON.parse(raw);
  } catch (_e) {
    /* fall back to the in-memory copy */
  }
  if (!s || typeof s.token !== 'string' || typeof s.expiresAt !== 'number') return null;
  if (Date.now() >= s.expiresAt) {
    clearStoredSession();
    return null;
  }
  return s;
}

function storeSession(token: string, expiresAt: number): void {
  memorySession = { token, expiresAt };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(memorySession));
  } catch (_e) {
    /* private mode: the session lasts as long as this page */
  }
}

export function clearStoredSession(): void {
  memorySession = null;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch (_e) {
    /* nothing stored */
  }
}

function sessionHeaders(): Record<string, string> {
  const s = getStoredSession();
  return s ? { 'X-PD-Session': s.token } : {};
}

// A followed login redirect is the tell that we're logged out: the final URL
// lands on login.jsp, or fetch reports it followed a redirect. (/b/portalAdmin
// is still login-gated for supers.)
function looksLoggedOut(res: Response): boolean {
  return res.redirected || /login\.jsp/i.test(res.url);
}

// Parse a /b/portal response into its `data`, or throw. { loggedOut:true } or a
// non-JSON body (a login page) is treated as logged out.
async function parsePortal(res: Response): Promise<any> {
  if (looksLoggedOut(res)) throw new LoggedOutError();
  let json: any = null;
  try {
    json = await res.json();
  } catch (_e) {
    throw new LoggedOutError();
  }
  if (json && json.loggedOut === true) throw new LoggedOutError();
  if (!json || json.ok !== true) {
    throw new Error(json && json.error ? String(json.error) : `Request failed (HTTP ${res.status}).`);
  }
  return json.data;
}

async function portalGet(action: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${PORTAL_URL}?action=${encodeURIComponent(action)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...sessionHeaders() },
    });
  } catch (_e) {
    throw new Error('Could not reach the portal. Check your connection and try again.');
  }
  return parsePortal(res);
}

async function portalPost(action: string, payload: Record<string, unknown> = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(PORTAL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...sessionHeaders() },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (_e) {
    throw new Error('Could not reach the portal. Check your connection and try again.');
  }
  return parsePortal(res);
}

/* ---- portal actions ---- */

// Cheap liveness probe (unused by the UI today, handy for debugging).
export function apiPing(): Promise<any> {
  return portalGet('ping');
}

// Who's signed in. Drives the header chrome and the auth gate.
export function apiSession(): Promise<Session> {
  return portalGet('session');
}

// The editor schema: sections, ordered fields, and option lists. Fetched once.
export function apiGetMeta(): Promise<PortalMeta> {
  return portalGet('getMeta');
}

// ONLY the caller's own programs (many-to-many; 0, 1, or several).
export function apiGetMyPrograms(): Promise<ProgramSummary[]> {
  return portalGet('getMyPrograms');
}

// The full editable profile for one program.
export function apiGetProgram(programId: string): Promise<Program> {
  return portalPost('getProgram', { programId });
}

// Partial save — writes only the provided fields. May return warnings[].
export function apiSaveProgram(programId: string, fields: EditableFields): Promise<SaveResult> {
  return portalPost('saveProgram', { programId, fields });
}

// Set (or clear) the program logo. `dataBase64` is RAW base64 (no data: prefix);
// pass '' to clear the logo. Resolves to { logoUrl }.
export function apiUploadLogo(
  programId: string,
  dataBase64: string,
  filename?: string,
  contentType?: string,
): Promise<{ logoUrl: string }> {
  return portalPost('uploadLogo', { programId, dataBase64, filename, contentType });
}

/* ---- helpers ---- */

// Read a File into RAW base64 (no `data:...;base64,` prefix) for uploadLogo.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read that file. Try a different image.'));
    reader.readAsDataURL(file);
  });
}

// Best-effort parse of a program's contacts into an array of Contact rows.
// Prefers the server-parsed `contacts`; falls back to parsing `contactsJson`.
export function parseContacts(program: Pick<Program, 'contacts' | 'contactsJson'>): Contact[] {
  if (Array.isArray(program.contacts)) return program.contacts.filter(isContactish).map(normalizeContact);
  const raw = (program.contactsJson || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(isContactish).map(normalizeContact);
  } catch (_e) {
    /* malformed JSON — start from an empty list rather than blocking the editor */
  }
  return [];
}

function isContactish(v: any): boolean {
  return !!v && typeof v === 'object';
}

function normalizeContact(v: any): Contact {
  return {
    name: typeof v.name === 'string' ? v.name : '',
    role: typeof v.role === 'string' ? v.role : '',
    phone: typeof v.phone === 'string' ? v.phone : '',
    email: typeof v.email === 'string' ? v.email : '',
  };
}

// Serialize contact rows back to the JSON shape the backend stores (array of
// objects), dropping fully-empty rows so blank trailing rows don't persist.
export function serializeContacts(contacts: Contact[]): string {
  const cleaned = contacts
    .map((c) => ({
      name: (c.name || '').trim(),
      role: (c.role || '').trim(),
      phone: (c.phone || '').trim(),
      email: (c.email || '').trim(),
    }))
    .filter((c) => c.name || c.role || c.phone || c.email);
  return JSON.stringify(cleaned);
}

/* =====================================================================
   /b/claim — the public self-serve claim flow (no session needed).
   Same { ok, data } | { ok:false, error } envelope as /b/portal.
   ===================================================================== */

const CLAIM_URL = '/b/claim';

export type ClaimState = 'unclaimed' | 'managed' | 'pending';

export interface ProgramHit {
  id: string;
  name: string;
  location: string;
  website: string;
  state: ClaimState;
}

export interface ProgramPreview {
  id: string;
  name: string;
  website: string;
  domain: string;
  location: string;
  programType: string[];
  levelOfCare: string[];
  ageMin: number | null;
  ageMax: number | null;
  genderServed: string[];
  specialties: string[];
  hasAdmissions: boolean;
  dataSource: string;
  verified: boolean;
  lastVerified: string;
  state: ClaimState;
}

// `start` always emails a 6-digit code; the token carries the claim.
export interface ClaimStart {
  mode: 'code';
  token: string;
  emailMasked: string;
  domainMatch: boolean;
}

// After the code: an email with an account gets the program linked (or queued
// for review) and signs in; a new email gets a setup token for createAccount.
export type ClaimResult =
  | { outcome: 'linked' | 'pending'; existingAccount: true; username: string; programId: string; programName: string }
  | { outcome: 'needsAccount'; setupToken: string; suggestedUsername: string; domainMatch: boolean; programId: string; programName: string };

export interface AccountSummary {
  accountId: string;
  username: string;
  email: string;
  fullName: string;
}

// Any call that signs the rep in (createAccount, login, resetFinish).
export interface AuthResult {
  token: string;
  expiresAt: number;
  account: AccountSummary;
  outcome?: 'linked' | 'pending';
  programId?: string;
  programName?: string;
}

async function parseClaim(res: Response): Promise<any> {
  let json: any = null;
  try {
    json = await res.json();
  } catch (_e) {
    throw new Error(`The directory didn't answer as expected (HTTP ${res.status}). Please try again.`);
  }
  if (!json || json.ok !== true) throw new Error(json && json.error ? String(json.error) : 'Request failed.');
  return json.data;
}

async function claimGet(params: Record<string, string>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${CLAIM_URL}?${new URLSearchParams(params).toString()}`, { headers: { Accept: 'application/json', ...sessionHeaders() } });
  } catch (_e) {
    throw new Error('Could not reach the directory. Check your connection and try again.');
  }
  return parseClaim(res);
}

async function claimPost(action: string, payload: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(CLAIM_URL, {
      method: 'POST',
      credentials: 'include', // the wrong-guess counters live in the session
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...sessionHeaders() },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (_e) {
    throw new Error('Could not reach the directory. Check your connection and try again.');
  }
  return parseClaim(res);
}

export function apiSearchPrograms(q: string): Promise<ProgramHit[]> {
  return claimGet({ action: 'search', q });
}

export function apiPreviewProgram(programId: string): Promise<ProgramPreview> {
  return claimGet({ action: 'preview', programId });
}

export async function apiClaimStart(input: {
  programId: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
}): Promise<ClaimStart> {
  return claimPost('start', { ...input, recaptchaToken: await recaptcha('claim_start') });
}

export function apiClaimVerify(token: string, code: string): Promise<ClaimResult> {
  return claimPost('verify', { token, code });
}

/* ---- directory accounts: sign-up, sign-in, sign-out, reset ---- */

// Every successful sign-in stores its session before resolving.
async function signedIn(p: Promise<AuthResult>): Promise<AuthResult> {
  const r = await p;
  storeSession(r.token, r.expiresAt);
  return r;
}

export async function apiCreateAccount(setupToken: string, username: string, password: string): Promise<AuthResult> {
  const recaptchaToken = await recaptcha('create_account');
  return signedIn(claimPost('createAccount', { setupToken, username, password, recaptchaToken }));
}

export async function apiLogin(username: string, password: string): Promise<AuthResult> {
  const recaptchaToken = await recaptcha('login');
  return signedIn(claimPost('login', { username, password, recaptchaToken }));
}

// Ends the session server-side; the local copy is dropped even if that fails.
export async function apiLogout(): Promise<void> {
  try {
    await claimPost('logout', {});
  } catch (_e) {
    /* the token dies at its expiry anyway */
  }
  clearStoredSession();
}

// Always answers { sent:true } so it never reveals whether an account exists.
export async function apiResetStart(identifier: string): Promise<{ sent: boolean; token: string }> {
  return claimPost('resetStart', { identifier, recaptchaToken: await recaptcha('reset_start') });
}

export function apiResetFinish(token: string, code: string, password: string): Promise<AuthResult> {
  return signedIn(claimPost('resetFinish', { token, code, password }));
}

/* ---- reCAPTCHA v3 (invisible) ---- */

const RECAPTCHA_SITE_KEY = '6LdQMwIuAAAAAIeHWXP1jrVNO7F7_WkOndyInVyI';
let recaptchaReady: Promise<any> | null = null;

// Load Google's script once, on the first protected action.
function loadRecaptcha(): Promise<any> {
  if (recaptchaReady) return recaptchaReady;
  recaptchaReady = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.grecaptcha && w.grecaptcha.execute) {
      w.grecaptcha.ready(() => resolve(w.grecaptcha));
      return;
    }
    const el = document.createElement('script');
    el.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
    el.async = true;
    el.onload = () => w.grecaptcha.ready(() => resolve(w.grecaptcha));
    el.onerror = () => {
      recaptchaReady = null;
      reject(new Error("We couldn't load the bot check. Check your connection or ad blocker and try again."));
    };
    document.head.appendChild(el);
  });
  return recaptchaReady;
}

async function recaptcha(action: string): Promise<string> {
  const g = await loadRecaptcha();
  try {
    return await g.execute(RECAPTCHA_SITE_KEY, { action });
  } catch (_e) {
    throw new Error("We couldn't run the bot check. Please try again.");
  }
}

/* ---- new-listing requests (a program that isn't in the directory yet) ---- */

export interface ListingMeta {
  programType: string[];
  levelOfCare: string[];
  genderServed: string[];
  specialties: string[];
  locationState: string[];
}

export interface ListingRequest {
  program: {
    programName: string;
    website: string;
    locationCity: string;
    locationState: string;
    programType: string[];
    levelOfCare: string[];
    genderServed: string[];
    specialties: string[];
    ageMin: string;
    ageMax: string;
    overview: string;
    admissionsContact: string;
  };
  contact: { firstName: string; lastName: string; role: string; email: string; phone: string };
  notes: string;
}

export function apiListingMeta(): Promise<ListingMeta> {
  return claimGet({ action: 'listingMeta' });
}

// Emails the request to the BlueStep reviewer; nothing is listed until they approve.
export async function apiRequestListing(req: ListingRequest): Promise<{ received: boolean; emailMasked: string }> {
  return claimPost('requestListing', { ...req, recaptchaToken: await recaptcha('request_listing') });
}


/* ---- display helpers ---- */

// "Oct 2026" from an ISO date (or '' when unset/unparseable).
export function monthYear(iso?: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return '';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m[2]) - 1] || ''} ${m[1]}`.trim();
}

/* =====================================================================
   /b/portalAdmin — the super-user dashboard behind /admin.
   Login-gated like /b/portal, so a signed-out call bounces to login.jsp
   (surfaced as LoggedOutError by parsePortal).
   ===================================================================== */

export interface AdminSession {
  loggedIn: boolean;
  isSuper: boolean;
  fullName: string;
}

export interface AdminPerson {
  name: string;
  email: string;
  username?: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

export interface AdminDashboard {
  totals: { programs: number; managed: number; pending: number; unclaimed: number; verified: number; reps: number };
  claimed: {
    id: string;
    name: string;
    location: string;
    status: string;
    verified: boolean;
    lastVerified: string;
    lastEditedAt: string;
    managers: AdminPerson[];
  }[];
  pending: { programId: string; programName: string; rep: AdminPerson }[];
  recent: { id: string; name: string; lastEditedAt: string; lastEditedBy: string }[];
  generatedAt: string;
}

async function adminGet(action: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`/b/portalAdmin?action=${encodeURIComponent(action)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (_e) {
    throw new Error('Could not reach the directory. Check your connection and try again.');
  }
  return parsePortal(res);
}

export function apiAdminSession(): Promise<AdminSession> {
  return adminGet('session');
}

export function apiAdminDashboard(): Promise<AdminDashboard> {
  return adminGet('dashboard');
}

export interface AdminProgram {
  id: string;
  name: string;
  location: string;
  website: string;
  status: string;
  verified: boolean;
  lastEditedAt: string;
  managers: number;
}

// Every program, sorted by name. Editing one goes through /b/portal, which lets a
// global super into any program (apiGetProgram / apiSaveProgram as usual).
export function apiAdminPrograms(): Promise<AdminProgram[]> {
  return adminGet('programs');
}

// Microsoft sign-in straight through BlueStep's OAuth service (the same call the
// global login page's "Sign in with Microsoft" button makes), landing back on dest.
export function microsoftLoginUrl(dest: string): string {
  const host = window.location.host;
  return `https://oauth2.bluestep.net/v1/login/initiate/microsoft?host=${encodeURIComponent(host)}&destUrl=${encodeURIComponent(dest)}`;
}

export function globalLoginUrl(dest: string): string {
  return `${LOGIN_URL}?step=two&_globalLogin=true&desturl=${encodeURIComponent(dest)}`;
}
