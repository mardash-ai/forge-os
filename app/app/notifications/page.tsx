import Link from 'next/link';
import { syncNotifications } from '@/lib/notification-inbox';
import { groupByKind } from '@/lib/notifications';
import { SiteNav } from '@/app/components/SiteNav';
import { DismissButton } from '@/app/components/DismissButton';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const notes = await syncNotifications(new Date());
  const groups = groupByKind(notes);

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="alerts" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">Attention</p>
          <h1>What needs a look</h1>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="all-clear">
          <span className="tick" aria-hidden="true">
            ✓
          </span>
          <span>All clear. Nothing&apos;s overdue, and every goal&apos;s been worked lately.</span>
        </div>
      ) : (
        <div className="inbox">
          {groups.map((group) => (
            <section className={`note-group ${group.kind === 'cold-goal' ? 'cold' : 'overdue'}`} key={group.kind}>
              <div className="group-head">
                <span className="label">{group.label}</span>
                <span className="count">{group.notes.length}</span>
                <span className="rule" />
              </div>
              <div className="notes">
                {group.notes.map((note) => (
                  <div className={`note ${note.kind === 'cold-goal' ? 'cold' : 'overdue'}`} key={note.key}>
                    <div className="note-top">
                      <span className="note-dot" aria-hidden="true" />
                      <span className="note-msg">{note.message}</span>
                    </div>
                    <div className="note-bot">
                      <Link className="note-goal" href={`/goals/${note.goalId}`}>
                        {note.goalTitle}
                      </Link>
                      <DismissButton notificationKey={note.key} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
