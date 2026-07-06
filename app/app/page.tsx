import Link from 'next/link';
import type { GoalWithProgress } from '@/lib/goals';
import { listGoals } from '@/lib/db';
import { HeatBar } from '@/app/components/HeatBar';
import { NewGoal } from '@/app/components/NewGoal';
import { SiteNav } from '@/app/components/SiteNav';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const goals = await listGoals();
  const active = goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => b.progress - a.progress);
  const forged = goals.filter((g) => g.status === 'achieved');
  const cold = goals.filter((g) => g.status === 'archived');
  const coldCount = active.filter((g) => g.progress === 0).length;

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="floor" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">The forge floor</p>
          <h1>What&apos;s hot right now</h1>
          <p className="floor-status">
            <span className="hot">{active.length} on the anvil</span> · {forged.length} forged ·{' '}
            {coldCount} cold
          </p>
        </div>
        <div className="head-actions">
          <NewGoal />
        </div>
      </div>

      <div className="key" aria-hidden="true">
        <span>Cold</span>
        <span className="key-ramp" />
        <span>Forged</span>
      </div>

      {active.length === 0 ? (
        <p className="empty">Nothing on the anvil yet. Name a goal and start working it.</p>
      ) : (
        <ul className="goals">
          {active.map((g, i) => (
            <li key={g.id} className="goal">
              <Link className="goal-link" href={`/goals/${g.id}`}>
                <div className="goal-top">
                  <h2 className="goal-title">{g.title}</h2>
                  <span className="chip active">
                    <span className="dot" />
                    Active
                  </span>
                </div>
                <HeatBar percent={g.progress} done={g.done} total={g.total} index={i} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {forged.length > 0 && (
        <section>
          <div className="subhead">
            Forged <span className="count">{forged.length}</span>
          </div>
          <ul className="goals quiet">
            {forged.map((g) => (
              <QuietCard key={g.id} goal={g} archived={false} />
            ))}
          </ul>
        </section>
      )}

      {cold.length > 0 && (
        <section>
          <div className="subhead">
            Cold storage <span className="count">{cold.length}</span>
          </div>
          <ul className="goals quiet">
            {cold.map((g) => (
              <QuietCard key={g.id} goal={g} archived />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function QuietCard({ goal, archived }: { goal: GoalWithProgress; archived: boolean }) {
  return (
    <li className={`goal${archived ? ' archived-goal' : ''}`}>
      <Link className="goal-link" href={`/goals/${goal.id}`}>
        <div className="goal-top">
          <h2 className="goal-title">{goal.title}</h2>
          <span className={`chip ${archived ? 'archived' : 'achieved'}`}>
            <span className="dot" />
            {archived ? 'Archived' : 'Forged'}
          </span>
        </div>
        <HeatBar percent={goal.progress} done={goal.done} total={goal.total} />
      </Link>
    </li>
  );
}
