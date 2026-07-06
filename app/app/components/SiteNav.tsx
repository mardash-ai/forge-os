import Link from 'next/link';

type Page = 'floor' | 'today' | 'log';

// Primary nav across the Forge Floor (/), Today (/today), and the Log (/timeline).
export function SiteNav({ current }: { current: Page }) {
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
      <Link href="/timeline" className={current === 'log' ? 'on' : ''} aria-current={current === 'log' ? 'page' : undefined}>
        Log
      </Link>
    </nav>
  );
}
