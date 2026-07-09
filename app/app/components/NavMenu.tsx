'use client';

import { useEffect, useId, useRef, useState } from 'react';

// Responsive shell for the primary nav. On desktop the full row of links (the
// server-rendered `children`) renders inline, exactly as before. Below the mobile
// breakpoint (see `.nav-toggle` / `.nav-items` in globals.css) the row is hidden and
// collapsed behind a single "Menu" toggle so nothing overflows the viewport; tapping
// the toggle reveals the same links as a dropdown. The menu closes on: a second tap,
// choosing a link, pressing Escape, or a pointer press outside the nav.
//
// This is a thin client wrapper so SiteNav can stay an async server component (it
// fetches the session + the live alert count). The children are rendered on the
// server and passed straight through — no app data crosses into the client beyond
// what the markup already shows.
export function NavMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <nav className="site-nav" aria-label="Primary" ref={navRef}>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="nav-toggle-text">Menu</span>
      </button>
      <div
        id={panelId}
        className={`nav-items${open ? ' open' : ''}`}
        // A tap on any link collapses the dropdown. A hard navigation unmounts this
        // anyway; this also covers soft/same-page navigations so the menu never
        // lingers open over the new page.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {children}
      </div>
    </nav>
  );
}
