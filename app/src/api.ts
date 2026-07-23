/* =====================================================================
   api.ts — the single seam between the SPA and the backend.

   Everything the portal reads or writes goes through the same-origin
   BlueStep endpoint at /b/portal as a JSON action envelope:
     request : GET  ?action=…            |  POST { action, … }
     reply   : { ok:true, data }         |  { ok:false, error }
   Same-origin fetch — the BlueStep session cookie rides along.

   AUTH NUANCE: /b/portal is gated with basicPermissionOption:Login, so a
   logged-OUT request 302s to /shared/login/login.jsp and fetch FOLLOWS the
   redirect, handing back the login HTML page (HTTP 200) — not our JSON. We
   detect that (redirected / login.jsp in the final URL / a non-JSON body)
   and surface it as LoggedOutError so the app can show the login gate. We
   never assume a clean 401.
   ===================================================================== */

const PORTAL_URL = '/b/portal';
const LOGIN_URL = '/shared/login/login.jsp';

/* ---- domain models ---- */

export interface Session {
  loggedIn: boolean;
  userId: string;
  fullName: string;
  isSuper: boolean;
}

export interface ProgramSummary {
  id: string;
  programName: string;
  portalStatus: string;
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

// A followed login redirect is the tell that we're logged out: the final URL
// lands on login.jsp, or fetch reports it followed a redirect.
function looksLoggedOut(res: Response): boolean {
  return res.redirected || /login\.jsp/i.test(res.url);
}

// Parse a /b/portal response into its `data`, or throw. A non-JSON body (the
// login HTML) is treated as logged out, per the auth nuance above.
async function parsePortal(res: Response): Promise<any> {
  if (looksLoggedOut(res)) throw new LoggedOutError();
  let json: any = null;
  try {
    json = await res.json();
  } catch (_e) {
    // The endpoint always answers JSON when authenticated; a non-JSON body
    // means we were bounced to the login page.
    throw new LoggedOutError();
  }
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
      headers: { Accept: 'application/json' },
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
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

/* ---- in-app login (POST credentials to the tenant login handler) ----
   BlueStep login is a WebView FORM post (application/x-www-form-urlencoded),
   not a JSON API. We post same-origin so the session cookie is authenticated
   on THIS host, then re-probe /session to confirm. The password only ever
   goes to this same-origin BlueStep host. Mechanism mirrors the proven flow
   in gitsite-spa-starter/src/api.ts. */

function loginFormBody(username: string, password: string): URLSearchParams {
  const b = new URLSearchParams();
  b.set('_postEvent', 'commit');
  b.set('_postFormClass', 'myassn.user.UserLoginWebView');
  b.set('step', 'two'); // != "one" -> doLogin() runs now (skip the step-1 round-trip)
  b.set('myUserName', username);
  b.set('myPassword', password);
  b.set('rememberMe', 'false');
  return b;
}

// Try an in-app password login. Resolves to:
//   { ok:true }                  — session is now authenticated
//   { ok:false, twoFactor:true } — global-user email 2FA; caller hands off
//   { ok:false, error }          — bad credentials / locked / needs captcha
export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; twoFactor?: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch(LOGIN_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginFormBody(username, password).toString(),
    });
  } catch (_e) {
    return { ok: false, error: 'Could not reach the sign-in service. Check your connection and try again.' };
  }
  // Global users are bounced to email 2FA (doLogin 302s to the verify page).
  if (res.redirected && /\/oauth2\/v1\/login\/verify/.test(res.url)) {
    return { ok: false, twoFactor: true };
  }
  // Authoritative check: did the session actually become authenticated?
  try {
    const sess = await apiSession();
    if (sess && sess.loggedIn) return { ok: true };
  } catch (_e) {
    /* fall through to the generic failure below */
  }
  return { ok: false, error: 'The username or password you entered is invalid.' };
}

// Full-page native POST to the login handler with a desturl back into the SPA.
// Used for paths an in-app fetch can't finish (global-user email 2FA): the
// platform renders its own verify page, then returns us to `dest`.
export function nativeLoginSubmit(username: string, password: string, dest: string): void {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = `${LOGIN_URL}?desturl=${encodeURIComponent(dest)}`;
  f.style.display = 'none';
  const add = (n: string, v: string) => {
    const i = document.createElement('input');
    i.type = 'hidden';
    i.name = n;
    i.value = v;
    f.appendChild(i);
  };
  add('_postEvent', 'commit');
  add('_postFormClass', 'myassn.user.UserLoginWebView');
  add('step', 'two');
  add('myUserName', username);
  add('myPassword', password);
  add('rememberMe', 'false');
  document.body.appendChild(f);
  f.submit();
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
