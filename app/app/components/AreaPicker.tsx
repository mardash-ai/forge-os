'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AreaOption } from '@/lib/areas';

// Tag a resource (a Goal, Habit, or Project) to one of the owner's Areas — or clear it. A
// native <select> that PATCHes the resource route with { areaId } (or { areaId: null } to
// clear). `kind` is the plural API path segment (goals | habits | projects). Hidden when the
// owner has no areas yet, with a hint to create one.
export function AreaPicker({
  kind,
  resourceId,
  currentAreaId,
  areas,
}: {
  kind: 'goals' | 'habits' | 'projects';
  resourceId: string;
  currentAreaId: string | null;
  areas: AreaOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (areas.length === 0) {
    return (
      <span className="area-picker-empty">
        No areas yet — <a href="/areas">make one</a> to file this under a life domain.
      </span>
    );
  }

  async function set(value: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/${kind}/${resourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: value === '' ? null : value }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="area-picker">
      <span className="area-picker-label">Area</span>
      <select
        className="area-select"
        aria-label="Tag to an area"
        value={currentAreaId ?? ''}
        disabled={busy}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">No area</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
