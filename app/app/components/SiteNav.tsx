import Link from 'next/link';
import { listActiveNotifications } from '@/lib/db';

type Page = 'floor' | 'today' | 'habits' | 'log' | 'alerts';

// Primary nav across the Forge Floor (/), Today (/today), Habits (/habits), the
// Log (/timeline), and Alerts (/notifications). Async: it fetches the live alert
// count for the badge.
export async function SiteNav({ current }: { current: Page }) {
  const count = (await listActiveNotifications(new Date())).length;
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
