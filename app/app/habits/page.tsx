import { listHabits } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { streakTier, unitLabel } from '@/lib/habits';
import { SiteNav } from '@/app/components/SiteNav';
import { NewHabit } from '@/app/components/NewHabit';
import { StokeControl } from '@/app/components/StokeControl';
import { DeleteHabit } from '@/app/components/DeleteHabit';

export const dynamic = 'force-dynamic';

export default async function HabitsPage() {
  const owner = await requireOwner();
  const habits = await listHabits(owner, new Date());
  const lit = habits.filter((h) => h.doneThisPeriod).length;

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="habits" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">Kept alight</p>
          <h1>Habits</h1>
        </div>
        {habits.length > 0 ? (
          <span className="readout big-readout">
            {lit} / {habits.length} <span className="pct">· lit today</span>
          </span>
        ) : null}
      </div>

      <NewHabit />

      {habits.length === 0 ? (
        <p className="empty">No habits yet. Light your first one and keep it lit.</p>
      ) : (
        <ul className="habits">
          {habits.map((h) => {
            const tier = streakTier(h.streak, h.cadence);
            return (
              <li className="habit" key={h.id}>
                <span
                  className={`ember ember-${tier}${h.doneThisPeriod ? ' lit' : ' guttering'}`}
                  aria-hidden="true"
                />
                <div className="habit-main">
                  <span className="habit-title">{h.title}</span>
                  <span className="habit-meta">
                    {h.cadence} · best {h.longestStreak}
                  </span>
                </div>
                <div className={`habit-streak heat-${tier}`}>
                  <span className="streak-num">{h.streak}</span>
                  <span className="streak-unit">
                    {h.streak === 0 ? 'cold' : unitLabel(h.cadence, h.streak)}
                  </span>
                </div>
                <StokeControl id={h.id} done={h.doneThisPeriod} />
                <DeleteHabit id={h.id} title={h.title} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
