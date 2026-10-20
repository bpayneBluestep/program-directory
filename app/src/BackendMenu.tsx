/* =====================================================================
   BackendMenu.tsx — the admin top bar's "Backend" dropdown: native BlueStep
   tools plus this directory's own endpoints. Same groups as the Cobalt
   GitSite's ToolsMenu, minus its in-app items. Rendered only on /admin.

   Every href is root-relative, so it resolves against the directory host,
   and opens in a new tab. BlueStep enforces access, not this menu.
   ===================================================================== */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

interface Tool {
  label: string;
  href: string;
  note?: string;
}

interface Group {
  heading: string;
  tools: Tool[];
}

const editScript = (id: string) => `/shared/admin/applications/relate/editScript.jsp?_event=edit&_id=${id}`;

// The Relate / Organization Admin ids are global (`___`, no U segment), the same
// ones the Cobalt menu uses.
const GROUPS: Group[] = [
  {
    heading: 'Platform',
    tools: [
      { label: 'Relate', href: '/shared/home.jsp?_a=530002___131263' },
      { label: 'Organization Admin', href: '/shared/home.jsp?_a=111020___151457' },
    ],
  },
  {
    heading: 'Inspect',
    tools: [
      { label: 'GraphQL', href: '/shared/graphql.jsp' },
      { label: 'Organization Chart', href: '/shared/admin/organization/orgpop.jsp' },
      { label: 'Organization Tree', href: '/shared/admin/organization/orgpop.jsp?_showAll=true&_hideAdminLinks=true' },
      { label: 'Cache Stats', href: '/admin/cachestatsnew.jsp' },
    ],
  },
  {
    heading: 'This directory',
    tools: [
      { label: 'Portal API', href: editScript('363769__FID_portalApi'), note: '/b/portal' },
      { label: 'Portal Admin API', href: editScript('363769__FID_portalAdminApi'), note: '/b/portalAdmin' },
      { label: 'Program Claim API', href: editScript('363769__FID_programClaimApi'), note: '/b/claim' },
      { label: 'GitSite repo', href: 'https://github.com/bpayneBluestep/program-directory', note: 'GitHub' },
    ],
  },
  {
    heading: 'Session',
    tools: [{ label: 'Temporary Login', href: '/shared/login/templogin.jsp' }],
  },
];

export default function BackendMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="backend" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="btn btn-outline btn-sm backend-btn"
        data-open={open || undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Backend
        <span className="backend-chev" aria-hidden="true" />
      </button>

      {open ? (
        <div className="backend-menu" role="menu">
          {GROUPS.map((group) => (
            <div className="backend-group" key={group.heading}>
              <p className="backend-heading">{group.heading}</p>
              {group.tools.map((tool) => (
                <a
                  key={tool.label}
                  className="backend-item"
                  role="menuitem"
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <span>{tool.label}</span>
                  {tool.note ? <span className="backend-note">{tool.note}</span> : <Icon name="external" size={13} />}
                </a>
              ))}
            </div>
          ))}
          <p className="backend-foot">Opens in a new tab. BlueStep enforces access.</p>
        </div>
      ) : null}
    </div>
  );
}
