import Link from 'next/link';
import type { ProjectWithRollup } from '@/lib/projects';
import { listProjects } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { HeatBar } from '@/app/components/HeatBar';
import { NewProject } from '@/app/components/NewProject';
import { SiteNav } from '@/app/components/SiteNav';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const owner = await requireOwner();
  const projects = await listProjects(owner);
  const active = projects.filter((p) => p.status === 'active');
  const archived = projects.filter((p) => p.status === 'archived');

  return (
    <main className="wrap">
      <header className="masthead">
        <span className="wordmark">
          Forge<b>·</b>OS
        </span>
        <SiteNav current="projects" />
      </header>

      <div className="floor-head">
        <div className="head-text">
          <p className="eyebrow">The work, grouped</p>
          <h1>Projects</h1>
          <p className="floor-status">
            <span className="hot">{active.length} active</span> · {archived.length} archived
          </p>
        </div>
        <div className="head-actions">
          <NewProject />
        </div>
      </div>

      {active.length === 0 ? (
        <p className="empty">No projects yet. Group related goals under one to see their combined heat.</p>
      ) : (
        <ul className="goals">
          {active.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section>
          <div className="subhead">
            Archived <span className="count">{archived.length}</span>
          </div>
          <ul className="goals quiet">
            {archived.map((p) => (
              <ProjectCard key={p.id} project={p} quiet />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ProjectCard({
  project,
  index = 0,
  quiet = false,
}: {
  project: ProjectWithRollup;
  index?: number;
  quiet?: boolean;
}) {
  const goalWord = project.goalCount === 1 ? 'goal' : 'goals';
  return (
    <li className={`goal${quiet ? ' archived-goal' : ''}`}>
      <Link className="goal-link" href={`/projects/${project.id}`}>
        <div className="goal-top">
          <h2 className="goal-title">{project.title}</h2>
          <span className={`chip ${quiet ? 'archived' : 'active'}`}>
            <span className="dot" />
            {quiet ? 'Archived' : `${project.goalCount} ${goalWord}`}
          </span>
        </div>
        <HeatBar
          percent={project.progress}
          done={project.doneTasks}
          total={project.totalTasks}
          index={index}
        />
      </Link>
    </li>
  );
}
