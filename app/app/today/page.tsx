import Link from 'next/link';
import { listDueTasks } from '@/lib/db';
import { groupByBucket, relativeDueLabel } from '@/lib/schedule';
import { SiteNav } from '@/app/components/SiteNav';
import { StrikeTask } from '@/app/components/StrikeTask';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const now = new Date();
  const tasks = await listDueTasks();
  const groups = groupByBucket(tasks, now);

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="today" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">On the anvil</p>
          <h1>What needs working</h1>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="empty">
          Nothing due. Give a task a date from its goal and it&apos;ll show up here when it&apos;s
          time to work it. <Link href="/">Head to the forge floor</Link>.
        </p>
      ) : (
        <div className="board">
          {groups.map((group) => (
            <section className={`bucket ${group.key}`} key={group.key}>
              <div className="bucket-head">
                <span className="label">{group.label}</span>
                <span className="count">{group.tasks.length}</span>
                <span className="rule" />
              </div>
              <div className="rows">
                {group.tasks.map((task) => (
                  <div className={`row ${group.key}`} key={task.id}>
                    <StrikeTask id={task.id} title={task.title} />
                    <span className="main">
                      <span className="title">{task.title}</span>
                      <Link className="row-goal" href={`/goals/${task.goalId}`}>
                        {task.goalTitle}
                      </Link>
                    </span>
                    <span className={`due-chip ${group.key}`}>{relativeDueLabel(task.dueDate, now)}</span>
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
