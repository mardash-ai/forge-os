import Link from 'next/link';
import { listEvents } from '@/lib/db';
import { describeEvent, formatTime, groupByDay, isWarm, sparkKind } from '@/lib/timeline';
import { SiteNav } from '@/app/components/SiteNav';

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const events = await listEvents({ limit: 100 });
  const groups = groupByDay(events, new Date());

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="log" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">The forge log</p>
          <h1>What&apos;s been forged lately</h1>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="empty">
          Nothing in the log yet. Work a goal on the <Link href="/">forge floor</Link> — every
          stroke you make shows up here.
        </p>
      ) : (
        <div className="log">
          {groups.map((group) => {
            const warm = group.events.filter(isWarm).length;
            return (
              <section className="day" key={group.key}>
                <div className="day-head">
                  <span className="label">{group.label}</span>
                  <span className="rule" />
                  <span className="heat">{warm} warm</span>
                </div>
                <div className="events">
                  {group.events.map((event, i) => (
                    <Link
                      key={event.id}
                      className="event"
                      href={event.goalId ? `/goals/${event.goalId}` : '/'}
                      style={{ animationDelay: `${i * 45 + 120}ms` }}
                    >
                      <span className="rail-cell">
                        <span className={`spark k-${sparkKind(event)}`} aria-hidden="true" />
                      </span>
                      <span className="summary">{describeEvent(event)}</span>
                      <span className="time">{formatTime(event.createdAt)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
