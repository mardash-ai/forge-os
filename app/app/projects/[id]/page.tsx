import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, listAddableGoals, listAreaOptions } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { HeatBar } from '@/app/components/HeatBar';
import { ProjectStatusControl } from '@/app/components/ProjectStatusControl';
import { EditProject } from '@/app/components/EditProject';
import { AddGoalToProject } from '@/app/components/AddGoalToProject';
import { RemoveGoalFromProject } from '@/app/components/RemoveGoalFromProject';
import { AreaChip } from '@/app/components/AreaChip';
import { AreaPicker } from '@/app/components/AreaPicker';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const owner = await requireOwner();
  // Owner-scoped: another user's project is absent → notFound() (a 404 page, never a 403).
  const project = await getProject(owner, params.id);
  if (!project) notFound();
  const [addable, areas] = await Promise.all([listAddableGoals(owner), listAreaOptions(owner)]);

  const goalWord = project.goalCount === 1 ? 'goal' : 'goals';

  return (
    <main className="wrap">
      <header className="masthead">
        <Link className="breadcrumb" href="/projects">
          ← Projects
        </Link>
        <span className="status-line">Resource · Project</span>
      </header>

      <div className="detail-head">
        <div className="detail-title-row">
          <h1 className="detail-title">{project.title}</h1>
          {project.areaId && project.areaName ? (
            <AreaChip name={project.areaName} color={project.areaColor} size="md" />
          ) : null}
          <EditProject id={project.id} title={project.title} description={project.description} />
        </div>
        <div className="detail-meta">
          <ProjectStatusControl id={project.id} status={project.status} />
          <AreaPicker kind="projects" resourceId={project.id} currentAreaId={project.areaId} areas={areas} />
          <span className="readout big-readout">
            {project.goalCount} {goalWord}
            <span className="pct"> · {project.doneTasks} / {project.totalTasks} tasks · {project.progress}%</span>
          </span>
        </div>
        <HeatBar
          percent={project.progress}
          done={project.doneTasks}
          total={project.totalTasks}
          big
          hideReadout
        />
      </div>

      {project.description ? <p className="description">{project.description}</p> : null}

      <p className="eyebrow section-eyebrow">Goals in this project</p>
      {project.goals.length === 0 ? (
        <p className="empty">No goals here yet. Add one below to start rolling up its heat.</p>
      ) : (
        <ul className="goals">
          {project.goals.map((g, i) => (
            <li key={g.id} className="goal project-goal">
              <Link className="goal-link" href={`/goals/${g.id}`}>
                <div className="goal-top">
                  <h2 className="goal-title">{g.title}</h2>
                  {g.areaId && g.areaName ? <AreaChip name={g.areaName} color={g.areaColor} /> : null}
                  <span className={`chip ${g.status}`}>
                    <span className="dot" />
                    {g.status === 'active' ? 'Active' : g.status === 'achieved' ? 'Forged' : 'Archived'}
                  </span>
                </div>
                <HeatBar percent={g.progress} done={g.done} total={g.total} index={i} />
              </Link>
              <RemoveGoalFromProject projectId={project.id} goalId={g.id} title={g.title} />
            </li>
          ))}
        </ul>
      )}

      <p className="eyebrow section-eyebrow">Add a goal</p>
      <AddGoalToProject projectId={project.id} addable={addable} />
    </main>
  );
}
