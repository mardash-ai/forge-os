import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGoal } from '@/lib/db';
import { HeatBar } from '@/app/components/HeatBar';
import { AddTaskForm } from '@/app/components/AddTaskForm';
import { CompleteButton } from '@/app/components/CompleteButton';
import { StatusControl } from '@/app/components/StatusControl';
import { DueDate } from '@/app/components/DueDate';
import { PlanTasks } from '@/app/components/PlanTasks';

export const dynamic = 'force-dynamic';

export default async function GoalPage({ params }: { params: { id: string } }) {
  const goal = await getGoal(params.id);
  if (!goal) notFound();

  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/">
          ← The forge floor
        </Link>
        <span className="status-line">Resource · Goal</span>
      </header>

      <div className="detail-head">
        <h1 className="detail-title">{goal.title}</h1>
        <div className="detail-meta">
          <StatusControl id={goal.id} status={goal.status} />
          <span className="readout big-readout">
            {goal.done} / {goal.total} <span className="pct">· {goal.progress}%</span>
          </span>
        </div>
        <HeatBar percent={goal.progress} done={goal.done} total={goal.total} big hideReadout />
      </div>

      {goal.description ? <p className="description">{goal.description}</p> : null}

      <p className="eyebrow section-eyebrow">Hammer strokes</p>
      {goal.tasks.length === 0 ? (
        <p className="empty">No strokes yet. Add the first task to start heating this goal.</p>
      ) : (
        <ul className="tasks">
          {goal.tasks.map((t) => (
            <li key={t.id} className={`task${t.done ? ' done' : ''}`}>
              <span className="task-mark" aria-hidden="true">
                {t.done ? '✓' : '○'}
              </span>
              <span className="task-title">{t.title}</span>
              {t.done ? (
                <span className="task-state">Struck</span>
              ) : (
                <>
                  <DueDate taskId={t.id} dueDate={t.dueDate} />
                  <CompleteButton id={t.id} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddTaskForm goalId={goal.id} />
      <PlanTasks goalId={goal.id} />
    </main>
  );
}
