import Link from 'next/link';

// Primary nav between the Forge Floor (/) and the Forge Log (/timeline).
export function SiteNav({ current }: { current: 'floor' | 'log' }) {
  return (
    <nav className="site-nav" aria-label="Primary">
      <Link href="/" className={current === 'floor' ? 'on' : ''} aria-current={current === 'floor' ? 'page' : undefined}>
        Floor
      </Link>
      <span className="sep" aria-hidden="true">·</span>
      <Link href="/timeline" className={current === 'log' ? 'on' : ''} aria-current={current === 'log' ? 'page' : undefined}>
        Log
      </Link>
    </nav>
  );
}
