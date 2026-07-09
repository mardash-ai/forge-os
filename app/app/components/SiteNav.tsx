import Link from 'next/link';
import { syncNotifications } from '@/lib/notification-inbox';
import { getSession } from '@/lib/auth';
import { NavMenu } from './NavMenu';

type Page = 'floor' | 'projects' | 'areas' | 'today' | 'habits' | 'log' | 'alerts';

// Primary nav across the Forge Floor (/), Today (/today), Habits (/habits), the
// Log (/timeline), and Alerts (/notifications). Async: it reconciles the platform
// notifications store (C4) and shows the live non-dismissed count in the badge.
// The account tail links to the platform's HOSTED auth (C10) — sign in/out live
// there; we render no auth UI of our own.
//
// The links render inline on desktop; below the mobile breakpoint NavMenu (a thin
// client wrapper) collapses this row behind a tap-to-open "Menu" button so the nav
// never overflows the viewport.
export async function SiteNav({ current }: { current: Page }) {
  // The badge count is the caller's OWN live inbox (C11), so resolve the session first
  // and reconcile scoped to their owner id. (SiteNav only renders on gated pages, so a
  // session is always present; stay null-tolerant anyway — no session, no badge.)
  const session = await getSession();
  const count = session ? (await syncNotifications(session.userId, new Date())).length : 0;
  return (
    <NavMenu>
      <Link href="/" className={current === 'floor' ? 'on' : ''} aria-current={current === 'floor' ? 'page' : undefined}>
        Floor
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link
        href="/projects"
        className={current === 'projects' ? 'on' : ''}
        aria-current={current === 'projects' ? 'page' : undefined}
      >
        Projects
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link
        href="/areas"
        className={current === 'areas' ? 'on' : ''}
        aria-current={current === 'areas' ? 'page' : undefined}
      >
        Areas
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link href="/today" className={current === 'today' ? 'on' : ''} aria-current={current === 'today' ? 'page' : undefined}>
        Today
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link href="/habits" className={current === 'habits' ? 'on' : ''} aria-current={current === 'habits' ? 'page' : undefined}>
        Habits
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link href="/timeline" className={current === 'log' ? 'on' : ''} aria-current={current === 'log' ? 'page' : undefined}>
        Log
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link
        href="/notifications"
        className={current === 'alerts' ? 'on' : ''}
        aria-current={current === 'alerts' ? 'page' : undefined}
      >
        Alerts
      </Link>
      {count > 0 ? (
        <span className="nav-badge" aria-label={`${count} needing attention`}>
          {count}
        </span>
      ) : null}
      <span className="sep" aria-hidden="true">·</span>
      {session ? (
        <>
          <span className="nav-user" title={session.email}>
            {session.email}
          </span>
          {/* Hosted sign-out. A plain anchor (not next/link) — it leaves the app
              to the platform's /auth surface, proxied same-origin. */}
          <a href="/auth/logout">Sign out</a>
        </>
      ) : (
        <a href="/auth/login">Sign in</a>
      )}
    </NavMenu>
  );
}
