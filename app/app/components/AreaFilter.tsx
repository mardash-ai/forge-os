'use client';

import { useRouter, usePathname } from 'next/navigation';
import type { AreaOption } from '@/lib/areas';

// Filter a list view by Area. A native <select> that navigates to `?area=<id>` (or clears the
// query for "All areas"), so the server component re-reads owner-scoped, Area-filtered rows.
// `current` is the active area id from the page's searchParams. Hidden when there are no areas.
export function AreaFilter({ areas, current }: { areas: AreaOption[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();

  if (areas.length === 0) return null;

  function go(value: string) {
    const href = value === '' ? pathname : `${pathname}?area=${encodeURIComponent(value)}`;
    router.push(href);
  }

  return (
    <label className="area-filter">
      <span className="area-filter-label">Area</span>
      <select
        className="area-select"
        aria-label="Filter by area"
        value={current ?? ''}
        onChange={(e) => go(e.target.value)}
      >
        <option value="">All areas</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
