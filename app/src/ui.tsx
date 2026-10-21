/* =====================================================================
   ui.tsx — small shared primitives: icons, spinner, status badge, and the
   toast system (context + provider + on-screen stack). Kept deliberately
   lightweight — no component library, no external assets.
   ===================================================================== */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { monthYear } from './api';

/* ---- icons (inline SVG, currentColor) ---- */

type IconName =
  | 'check' | 'upload' | 'logout' | 'plus' | 'trash' | 'external' | 'switch' | 'alert' | 'x'
  | 'search' | 'shield' | 'clock' | 'arrowRight' | 'arrowLeft' | 'mail' | 'map' | 'building' | 'lock';

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  upload: <><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  switch: <><path d="m18 8 4 4-4 4" /><path d="M2 12h20" /><path d="m6 16-4-4 4-4" /></>,
  alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  map: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /><path d="M10 21v-3h4v3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---- spinner ---- */

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-ring" aria-hidden="true" />
      {label ? <span className="spinner-label">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

/* ---- status badge ---- */

// Maps a free-text portalStatus into a small stable set of visual tones.
function statusTone(status: string): 'live' | 'review' | 'draft' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (/(publish|live|active|approved)/.test(s)) return 'live';
  if (/(review|pending|submitted|awaiting)/.test(s)) return 'review';
  if (/(draft|unpublish|hidden|inactive)/.test(s)) return 'draft';
  return 'neutral';
}

export function StatusBadge({ status }: { status: string }) {
  const label = (status || '').trim() || 'Unknown';
  return (
    <span className={`badge badge-${statusTone(status)}`} title={`Listing status: ${label}`}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/* ---- verified badge (a rep signed in and saved; never expires for now) ---- */

export function VerifiedBadge({ lastVerified, compact = false }: { lastVerified?: string; compact?: boolean }) {
  const when = monthYear(lastVerified);
  return (
    <span className="badge badge-verified" title={when ? `Verified by the program · ${when}` : 'Verified by the program'}>
      <Icon name="shield" size={13} />
      {compact || !when ? 'Verified' : `Verified · ${when}`}
    </span>
  );
}

/* ---- brand chrome ---- */

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="wordmark" aria-label="BlueStep Program Directory home">
      <span className="wordmark-mark" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}images/mark.png`} alt="" />
      </span>
      <span className="wordmark-text">
        <span className="wordmark-name">Program Directory</span>
        <span className="wordmark-by">by BlueStep</span>
      </span>
    </Link>
  );
}

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar">
      <Wordmark />
      <div className="topbar-spacer" />
      {children}
    </header>
  );
}

/* ---- toasts ---- */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, kind, message }]);
      // Errors linger; success/info clear themselves.
      const ttl = kind === 'error' ? 7000 : 4000;
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">
              <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'external'} size={16} />
            </span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
