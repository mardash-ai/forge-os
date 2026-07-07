import Link from 'next/link';
import { syncNotifications } from '@/lib/notification-inbox';

type Page = 'floor' | 'today' | 'habits' | 'log' | 'alerts';

// Primary nav across the Forge Floor (/), Today (/today), Habits (/habits), the
// Log (/timeline), and Alerts (/notifications). Async: it reconciles the platform
// notifications store (C4) and shows the live non-dismissed count in the badge.
export async function SiteNav({ current }: { current: Page }) {
  const count = (await syncNotifications(new Date())).length;
  return (
    <nav className="site-nav" aria-label="Primary">
      <Link href="/" className={current === 'floor' ? 'on' : ''} aria-current={current === 'floor' ? 'page' : undefined}>
        Floor
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
    </nav>
  );
}
