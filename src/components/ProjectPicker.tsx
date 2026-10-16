import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FolderOpen, Plus } from 'lucide-react';
import { useApp } from '../context/appContext';
import ProjectForm from './ProjectForm';

const ProjectPicker: React.FC = () => {
  const { appStatus, createProject, projectStats, projects, switchProject } = useApp();
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (appStatus === 'selecting' && projects.length === 0) setShowCreateForm(true);
    if (projects.length > 0) setShowCreateForm(false);
  }, [appStatus, projects.length]);

  if (appStatus === 'loading') {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded-md bg-slate-100" />
          <div className="h-9 w-72 rounded-md bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-36 rounded-md bg-slate-100" />
            <div className="h-36 rounded-md bg-slate-100" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Project selection
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Choose a project
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Open a project workspace or create a new project before working with units and
            transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="dashboard-primary-button"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {showCreateForm && (
        <div className="max-w-2xl">
          <ProjectForm
            onCancel={() => setShowCreateForm(false)}
            onSubmit={async (input) => {
              await createProject(input);
              setShowCreateForm(false);
            }}
          />
        </div>
      )}

      {projects.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
            <Building2 size={22} />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-950">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Create the first project to start loading units, transactions, and finance metrics.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const stats = projectStats[project.id];
            return (
              <article key={project.id} className="dashboard-surface flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {project.code}
                    </p>
                    <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-950">
                      {project.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {project.location || 'No location set'}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                    <FolderOpen size={19} />
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      Units
                    </dt>
                    <dd className="mt-2 text-lg font-semibold text-slate-950">
                      {stats?.unitCount ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      Last Tx
                    </dt>
                    <dd className="mt-2 text-sm font-semibold text-slate-950">
                      {stats?.lastTransactionDate || '-'}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => switchProject(project.id)}
                  className="dashboard-primary-button mt-auto justify-center"
                >
                  Open Project
                </button>
              </article>
            );
          })}
        </section>
      )}

      {projects.length > 0 && (
        <Link
          to="/admin/projects"
          className="inline-flex text-sm font-medium text-slate-700 underline"
        >
          Manage project details
        </Link>
      )}
    </div>
  );
};

export default ProjectPicker;
