import { listAreas } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { SiteNav } from '@/app/components/SiteNav';
import { NewArea } from '@/app/components/NewArea';
import { EditArea } from '@/app/components/EditArea';
import type { AreaWithCounts } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export default async function AreasPage() {
  const owner = await requireOwner();
  const areas = await listAreas(owner);

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="areas" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">Your life, in domains</p>
          <h1>Areas</h1>
          <p className="floor-status">
            <span className="hot">{areas.length}</span> {areas.length === 1 ? 'area' : 'areas'} · tag goals,
            habits &amp; projects to one, then filter by it
          </p>
        </div>
        <div className="head-actions">
          <NewArea />
        </div>
      </div>

      {areas.length === 0 ? (
        <p className="empty">
          No areas yet. Name a life domain — Health, Career, Finance, Relationships — and file your goals,
          habits, and projects under it.
        </p>
      ) : (
        <ul className="areas">
          {areas.map((a) => (
            <AreaRow key={a.id} area={a} />
          ))}
        </ul>
      )}
    </main>
  );
}

function AreaRow({ area }: { area: AreaWithCounts }) {
  const bits = [
    `${area.goalCount} ${area.goalCount === 1 ? 'goal' : 'goals'}`,
    `${area.habitCount} ${area.habitCount === 1 ? 'habit' : 'habits'}`,
    `${area.projectCount} ${area.projectCount === 1 ? 'project' : 'projects'}`,
  ];
  return (
    <li className="area-row">
      <span
        className="area-swatch"
        style={area.color ? { background: area.color, boxShadow: `0 0 8px ${area.color}` } : undefined}
        aria-hidden="true"
      />
      <div className="area-main">
        <span className="area-name">{area.name}</span>
        <span className="area-meta">{bits.join(' · ')}</span>
      </div>
      <EditArea id={area.id} name={area.name} color={area.color} />
    </li>
  );
}
