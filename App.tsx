import React, {
  ErrorInfo,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeIndianRupee,
  Building2,
  ChevronDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  X
} from 'lucide-react';
import { AppContext, AppContextType, AppStatus, useApp } from './appContext';
import { NewProjectInput, Project, ProjectStats, Transaction, Unit, UpdateProjectInput } from './types';
import {
  createProject as createProjectRecord,
  createTransaction as createTransactionRecord,
  createOrUpdateUnit as persistUnitRecord,
  deleteTransaction as removeTransaction,
  deleteUnit as removeUnit,
  fetchAllProjects,
  fetchProjectStats,
  fetchTransactions,
  fetchUnits,
  SUPABASE_RLS_SETUP_ERROR,
  SUPABASE_SCHEMA_SETUP_ERROR,
  updateProject as persistProjectRecord,
  updateTransaction as persistTransaction
} from './dataService';
import Dashboard from './components/Dashboard';
import ProjectForm from './components/ProjectForm';
import ProjectPicker from './components/ProjectPicker';
import TransactionList from './components/TransactionList';
import UnitDetail from './components/UnitDetail';
import UnitList from './components/UnitList';
import { isSupabaseConfigured, supabaseConfigError } from './supabaseClient';

const LAST_ACTIVE_PROJECT_KEY = 'property-finance:last-active-project';
const CUSTOM_LOGO_KEY = 'property-finance:custom-logo';
const DEFAULT_APP_NAME = 'Real Estate Finance Tracker';
const APP_NAME = (import.meta.env.VITE_APP_NAME || DEFAULT_APP_NAME).trim();
const ENV_LOGO_URL = (import.meta.env.VITE_APP_LOGO_URL || '').trim();

const App: React.FC = () => (
  <HashRouter>
    <WorkspaceApp />
  </HashRouter>
);

const WorkspaceApp: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<Record<string, ProjectStats>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [appStatus, setAppStatus] = useState<AppStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [customLogoUrl, setCustomLogoUrl] = useState(() => localStorage.getItem(CUSTOM_LOGO_KEY) || '');

  const activeProject = useMemo(
    () => projects.find(project => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const brandLogoUrl = customLogoUrl || ENV_LOGO_URL;

  const needsDatabaseSetup = loadError === SUPABASE_SCHEMA_SETUP_ERROR;
  const needsRlsSetup = loadError === SUPABASE_RLS_SETUP_ERROR;
  const canUseDataRoutes = isSupabaseConfigured && !needsDatabaseSetup && !needsRlsSetup;

  const refreshProjectStats = useCallback(async (targetProjects: Project[]) => {
    if (!targetProjects.length) {
      setProjectStats({});
      return;
    }

    const stats = await fetchProjectStats(targetProjects.map(project => project.id));
    setProjectStats(stats);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setAppStatus('error');
      setLoadError(supabaseConfigError?.message ?? 'Supabase configuration is missing.');
      return;
    }

    setAppStatus('loading');
    try {
      const loadedProjects = await fetchAllProjects();
      setProjects(loadedProjects);
      await refreshProjectStats(loadedProjects);
      setLoadError(null);
      setAppStatus('selecting');
    } catch (err) {
      console.error(err);
      setAppStatus('error');
      setLoadError(err instanceof Error ? err.message : 'Failed to load projects.');
    }
  }, [refreshProjectStats]);

  const loadProject = useCallback(async (projectId: string) => {
    if (supabaseConfigError) throw supabaseConfigError;
    setAppStatus('loading');
    try {
      // The selected project is loaded as one isolated working set so child
      // screens never keep units or transactions from another project in memory.
      const [loadedUnits, loadedTransactions] = await Promise.all([
        fetchUnits(projectId),
        fetchTransactions(projectId)
      ]);

      setUnits(loadedUnits);
      setTransactions(loadedTransactions);
      setActiveProjectId(projectId);
      localStorage.setItem(LAST_ACTIVE_PROJECT_KEY, projectId);
      setLoadError(null);
      setAppStatus('ready');
    } catch (err) {
      console.error(err);
      setAppStatus('error');
      setLoadError(err instanceof Error ? err.message : 'Failed to load project data.');
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  const updateCustomLogo = useCallback((logoUrl: string) => {
    setCustomLogoUrl(logoUrl);
    if (logoUrl) localStorage.setItem(CUSTOM_LOGO_KEY, logoUrl);
    else localStorage.removeItem(CUSTOM_LOGO_KEY);
  }, []);

  const switchProject = useCallback((id: string) => {
    // Preserve the current sub-page when switching projects, e.g.
    // /p/old/units -> /p/new/units.
    const nextPath = buildProjectPath(location.pathname, id);
    setAppStatus('loading');
    navigate(nextPath);
    setIsMobileMenuOpen(false);
  }, [location.pathname, navigate]);

  const createProject = useCallback(async (input: NewProjectInput) => {
    if (supabaseConfigError) throw supabaseConfigError;
    const createdProject = await createProjectRecord(input);
    const nextProjects = [...projects, createdProject];
    setProjects(nextProjects);
    setProjectStats(prev => ({
      ...prev,
      [createdProject.id]: { unitCount: 0, lastTransactionDate: null }
    }));
    navigate(`/p/${createdProject.id}`);
    return createdProject;
  }, [navigate, projects]);

  const updateProject = useCallback(async (id: string, input: UpdateProjectInput) => {
    if (supabaseConfigError) throw supabaseConfigError;
    const updatedProject = await persistProjectRecord(id, input);
    setProjects(prev => prev.map(project => project.id === id ? updatedProject : project));
    return updatedProject;
  }, []);

  const requireActiveProjectId = useCallback(() => {
    if (!activeProjectId) throw new Error('Select a project before changing project data.');
    return activeProjectId;
  }, [activeProjectId]);

  const refreshData = useCallback(async (projectId = activeProjectId) => {
    if (!projectId) return;
    await loadProject(projectId);
    void refreshProjectStats(projects);
  }, [activeProjectId, loadProject, projects, refreshProjectStats]);

  const addTransaction = async (t: Transaction) => {
    const projectId = requireActiveProjectId();
    await createTransactionRecord(projectId, t);
    await refreshData(projectId);
  };

  const updateTransaction = async (updatedT: Transaction) => {
    const projectId = requireActiveProjectId();
    if (!updatedT.id) throw new Error('Transaction id is required');
    await persistTransaction(projectId, updatedT.id, updatedT);
    await refreshData(projectId);
  };

  const deleteTransaction = async (id?: string, reason: string = 'User-requested deletion') => {
    const projectId = requireActiveProjectId();
    if (!id) throw new Error('Transaction id is required');
    await removeTransaction(projectId, id, reason);
    await refreshData(projectId);
  };

  const addUnit = async (u: Unit) => {
    const projectId = requireActiveProjectId();
    await persistUnitRecord(projectId, u);
    await refreshData(projectId);
  };

  const updateUnit = async (unit: Unit) => {
    const projectId = requireActiveProjectId();
    if (!unit.id) throw new Error('Unit id is required');
    await persistUnitRecord(projectId, unit);
    await refreshData(projectId);
  };

  const deleteUnit = async (id?: string, reason: string = 'User-requested deletion') => {
    const projectId = requireActiveProjectId();
    if (!id) throw new Error('Unit id is required');
    await removeUnit(projectId, id, reason);
    await refreshData(projectId);
  };

  const contextValue = useMemo<AppContextType>(() => ({
    project: activeProject,
    activeProject,
    projects,
    projectStats,
    units,
    transactions,
    appStatus,
    loadError,
    switchProject,
    loadProject,
    createProject,
    updateProject,
    refreshProjects,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addUnit,
    updateUnit,
    deleteUnit
  }), [
    activeProject,
    projects,
    projectStats,
    units,
    transactions,
    appStatus,
    loadError,
    switchProject,
    loadProject,
    createProject,
    updateProject,
    refreshProjects
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-shell min-h-screen text-slate-900">
        <div className="app-mobile-bar md:hidden px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <BrandMark compact project={activeProject} logoUrl={brandLogoUrl} />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="app-icon-button"
              aria-label="Toggle navigation"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className="app-layout mx-auto flex min-h-screen max-w-[1500px]">
          <aside className={`app-sidebar fixed inset-y-0 left-0 z-30 w-[17rem] px-4 py-4 transition-transform duration-300 md:sticky md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex h-full flex-col">
              <header className="app-sidebar-header">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Project</p>
                <div className="mt-3">
                  <BrandMark project={activeProject} logoUrl={brandLogoUrl} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{APP_NAME}</p>
              </header>

              <nav className="app-sidebar-nav mt-5 space-y-1" aria-label="Primary navigation">
                <NavLink to={activeProject ? `/p/${activeProject.id}` : '/'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setIsMobileMenuOpen(false)} />
                <NavLink to={activeProject ? `/p/${activeProject.id}/units` : '/'} icon={<Building2 size={18} />} label="Units List" onClick={() => setIsMobileMenuOpen(false)} />
                <NavLink to={activeProject ? `/p/${activeProject.id}/transactions` : '/'} icon={<FileText size={18} />} label="Transactions" onClick={() => setIsMobileMenuOpen(false)} />
              </nav>

              <div className="mt-auto space-y-4 pt-6">
                <BrandLogoControl hasCustomLogo={Boolean(customLogoUrl)} onLogoChange={updateCustomLogo} />
                <ProjectSwitcher canUseDataRoutes={canUseDataRoutes} />
              </div>
            </div>
          </aside>

          <main className="app-main min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6 xl:px-10">
            <div className="app-header mb-5 flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Workspace</p>
                <h2 className="mt-1 text-[1.65rem] font-semibold tracking-tight text-slate-950">
                  {activeProject ? activeProject.name : APP_NAME}
                </h2>
              </div>
              <div className="hidden text-right md:block">
                <p className="text-sm text-slate-500">{activeProject?.location || 'Live finance metrics.'}</p>
              </div>
            </div>

            {loadError && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-700">Data connection issue</p>
                <p className="mt-2 text-sm leading-6">{loadError}</p>
              </div>
            )}

            {!canUseDataRoutes ? (
              <SupabaseSetupPanel needsDatabaseSetup={needsDatabaseSetup} needsRlsSetup={needsRlsSetup} />
            ) : (
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<ProjectPicker />} />
                  <Route path="/admin/projects" element={<ProjectManager />} />
                  <Route path="/admin/projects/new" element={<ProjectFormPage mode="create" />} />
                  <Route path="/admin/projects/:projectId/edit" element={<ProjectFormPage mode="edit" />} />
                  <Route path="/p/:projectId" element={<ProjectGuard><Dashboard /></ProjectGuard>} />
                  <Route path="/p/:projectId/units" element={<ProjectGuard><UnitList /></ProjectGuard>} />
                  <Route path="/p/:projectId/units/:unitId" element={<ProjectGuard><UnitDetail /></ProjectGuard>} />
                  <Route path="/p/:projectId/transactions" element={<ProjectGuard><TransactionList /></ProjectGuard>} />
                  <Route path="/units" element={<LegacyRedirect target="units" />} />
                  <Route path="/units/:unitId" element={<LegacyRedirect target="units" />} />
                  <Route path="/transactions" element={<LegacyRedirect target="transactions" />} />
                  <Route path="*" element={<LegacyRedirect />} />
                </Routes>
              </ErrorBoundary>
            )}
          </main>
        </div>

        {isMobileMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-slate-950/35 md:hidden"
            aria-label="Close navigation"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </div>
    </AppContext.Provider>
  );
};

const buildProjectPath = (pathname: string, projectId: string) => {
  const projectRoute = pathname.match(/^\/p\/[^/]+(?<rest>\/.*)?$/);
  if (projectRoute?.groups?.rest) {
    // Unit detail UUIDs are project-scoped, so switching from a detail page
    // lands on the new project's unit list instead of carrying a stale UUID.
    if (/^\/units\/[^/]+$/.test(projectRoute.groups.rest)) return `/p/${projectId}/units`;
    return `/p/${projectId}${projectRoute.groups.rest}`;
  }
  if (pathname === '/transactions') return `/p/${projectId}/transactions`;
  if (pathname === '/units') return `/p/${projectId}/units`;
  if (pathname.startsWith('/units/')) return `/p/${projectId}/units`;
  return `/p/${projectId}`;
};

const SupabaseSetupPanel: React.FC<{ needsDatabaseSetup?: boolean; needsRlsSetup?: boolean }> = ({
  needsDatabaseSetup = false,
  needsRlsSetup = false
}) => (
  <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Setup required</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
      {needsDatabaseSetup ? 'Create the Supabase tables' : needsRlsSetup ? 'Allow local app access' : 'Connect Supabase to use project data'}
    </h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
      {needsDatabaseSetup
        ? 'The app is connected to Supabase, but this fresh project is missing the database tables. Run the setup SQL once, then refresh the app.'
        : needsRlsSetup
          ? 'The tables exist, but Supabase Row Level Security is blocking the frontend anon key. Run the local RLS fix once, then refresh the app.'
          : 'Create a local env file from the checked-in template, add the Supabase project URL and anon key, then restart the Vite dev server.'}
    </p>
    <pre className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-slate-950 px-4 py-3 text-sm text-slate-50"><code>{needsDatabaseSetup ? `Open Supabase > SQL Editor
Run: sql/supabase_setup.sql` : needsRlsSetup ? `Open Supabase > SQL Editor
Run: sql/supabase_local_rls_fix.sql` : `cp .env.example .env.local
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key`}</code></pre>
  </section>
);

const ProjectGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeProject, appStatus, loadProject, projects } = useApp();

  const projectExists = Boolean(projectId && projects.some(project => project.id === projectId));

  useEffect(() => {
    if (!projectId || !projectExists) return;
    // Project routes are authoritative. If the URL changes, load that project
    // before rendering children that consume useApp().
    if (activeProject?.id !== projectId || appStatus !== 'ready') {
      void loadProject(projectId);
    }
  }, [activeProject?.id, appStatus, loadProject, projectExists, projectId]);

  if (appStatus === 'loading' && projects.length === 0) {
    return <LoadingPanel label="Loading projects" />;
  }

  if (!projectId) {
    return <ProjectNotFound />;
  }

  if (appStatus === 'error') {
    return <ProjectLoadFailed projectId={projectId} />;
  }

  if (!projectExists) {
    return <ProjectNotFound />;
  }

  if (appStatus === 'loading' || activeProject?.id !== projectId) {
    return <LoadingPanel label="Loading project data" />;
  }

  return <>{children}</>;
};

const ProjectNotFound: React.FC = () => (
  <section className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center shadow-sm">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
      <AlertTriangle size={22} />
    </div>
    <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Project not found</h1>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">The project in this link does not exist or is not available from this workspace.</p>
    <Link to="/" className="dashboard-primary-button mt-5 inline-flex">Back to projects</Link>
  </section>
);

const ProjectLoadFailed: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { loadError, loadProject } = useApp();

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-900 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-rose-700">Project load failed</p>
          <p className="mt-2 text-sm leading-6">{loadError || 'The project data could not be loaded.'}</p>
          <button type="button" className="dashboard-secondary-button mt-4" onClick={() => void loadProject(projectId)}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    </section>
  );
};

const LoadingPanel: React.FC<{ label: string }> = ({ label }) => (
  <section className="rounded-xl border border-slate-200 bg-white px-5 py-8 shadow-sm">
    <div className="animate-pulse space-y-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <div className="h-8 w-64 rounded-md bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-28 rounded-md bg-slate-100" />
        <div className="h-28 rounded-md bg-slate-100" />
        <div className="h-28 rounded-md bg-slate-100" />
      </div>
    </div>
  </section>
);

const LegacyRedirect: React.FC<{ target?: 'units' | 'transactions' }> = ({ target }) => {
  const { unitId } = useParams<{ unitId: string }>();
  const storedProjectId = localStorage.getItem(LAST_ACTIVE_PROJECT_KEY);

  // Old hash links did not include a project. Route them through the last
  // successfully opened project so existing bookmarks still land somewhere useful.
  if (!storedProjectId) return <Navigate to="/" replace />;
  if (target === 'units') {
    return <Navigate to={unitId ? `/p/${storedProjectId}/units/${unitId}` : `/p/${storedProjectId}/units`} replace />;
  }
  if (target === 'transactions') return <Navigate to={`/p/${storedProjectId}/transactions`} replace />;
  return <Navigate to="/" replace />;
};

const ProjectSwitcher: React.FC<{ canUseDataRoutes: boolean }> = ({ canUseDataRoutes }) => {
  const { activeProject, projects, switchProject } = useApp();
  const [open, setOpen] = useState(false);

  // Switching projects only changes the URL; ProjectGuard performs the data
  // load for whichever project id the new route contains.
  return (
    <div className="app-sidebar-footer">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen(value => !value)}
        disabled={!canUseDataRoutes}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${canUseDataRoutes ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            <BadgeIndianRupee size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">Active project</p>
            <p className={`mt-1 truncate text-sm font-medium ${canUseDataRoutes ? 'text-emerald-700' : 'text-amber-700'}`}>
              {activeProject?.name || (canUseDataRoutes ? 'Choose project' : 'Setup required')}
            </p>
            {activeProject?.location && <p className="truncate text-xs text-slate-500">{activeProject.location}</p>}
          </div>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {projects.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">No projects yet.</p>
          ) : projects.map(project => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                switchProject(project.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${project.id === activeProject?.id ? 'border-slate-300 bg-slate-100 text-slate-950' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'}`}
            >
              <FolderOpen size={15} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          ))}
          <Link to="/admin/projects" className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Settings size={15} />
            Manage projects
          </Link>
        </div>
      )}
    </div>
  );
};

const ProjectManager: React.FC = () => {
  const { projects, projectStats, switchProject } = useApp();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Projects</h1>
        </div>
        <Link to="/admin/projects/new" className="dashboard-primary-button">
          <Plus size={16} />
          New Project
        </Link>
      </div>

      <div className="dashboard-surface overflow-hidden p-0">
        <table className="dashboard-table min-w-full text-left">
          <thead>
            <tr>
              <th>Project</th>
              <th>Code</th>
              <th>Units</th>
              <th>Last transaction</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan={5} className="empty-state-cell">No projects yet.</td></tr>
            ) : projects.map(project => (
              <tr key={project.id}>
                <td>
                  <p className="font-semibold text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">{project.location || 'No location'}</p>
                </td>
                <td className="font-mono text-xs text-slate-600">{project.code}</td>
                <td>{projectStats[project.id]?.unitCount ?? 0}</td>
                <td>{projectStats[project.id]?.lastTransactionDate || '-'}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => switchProject(project.id)} className="dashboard-secondary-button">Open</button>
                    <Link to={`/admin/projects/${project.id}/edit`} className="dashboard-secondary-button">Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ProjectFormPage: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { createProject, projects, updateProject } = useApp();
  const project = projects.find(candidate => candidate.id === projectId);

  if (mode === 'edit' && !project) return <ProjectNotFound />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{mode === 'create' ? 'New Project' : 'Edit Project'}</h1>
      </div>
      <ProjectForm
        project={project}
        onCancel={() => navigate('/admin/projects')}
        onSubmit={async (input) => {
          if (mode === 'create') {
            const createdProject = await createProject(input);
            navigate(`/p/${createdProject.id}`);
          } else if (project) {
            await updateProject(project.id, input);
            navigate('/admin/projects');
          }
        }}
      />
    </div>
  );
};

const BrandMark: React.FC<{ compact?: boolean; project?: Project | null; logoUrl?: string }> = ({ compact = false, project, logoUrl }) => (
  <div className={`brand-mark ${compact ? 'brand-mark-compact' : ''}`}>
    {logoUrl ? (
      <img src={logoUrl} alt={`${APP_NAME} logo`} className="brand-mark-image brand-mark-logo" />
    ) : (
      <div className="brand-mark-image" aria-hidden="true">
        <Building2 size={compact ? 20 : 34} />
      </div>
    )}
    {compact && (
      <div className="brand-mark-copy">
        <p className="brand-mark-kicker">{project?.code || 'Projects'}</p>
        <p className="brand-mark-title">Operations</p>
      </div>
    )}
  </div>
);

const BrandLogoControl: React.FC<{ hasCustomLogo: boolean; onLogoChange: (logoUrl: string) => void }> = ({ hasCustomLogo, onLogoChange }) => {
  const [logoError, setLogoError] = useState<string | null>(null);

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setLogoError(null);

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Choose an image file.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setLogoError('Use an image under 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onLogoChange(reader.result);
    };
    reader.onerror = () => setLogoError('Could not read that logo.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="brand-logo-control">
      <label className="dashboard-secondary-button justify-center">
        Upload logo
        <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
      </label>
      {hasCustomLogo && (
        <button type="button" className="dashboard-secondary-button justify-center" onClick={() => onLogoChange('')}>
          Reset logo
        </button>
      )}
      {logoError && <p className="text-xs text-rose-600">{logoError}</p>}
    </div>
  );
};

const NavLink: React.FC<{ to: string; icon: React.ReactNode; label: string; onClick: () => void }> = ({ to, icon, label, onClick }) => {
  const location = useLocation();
  const isProjectRoot = /^\/p\/[^/]+$/.test(to);
  const isActive = location.pathname === to || (!isProjectRoot && to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`app-nav-link ${isActive ? 'is-active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  declare props: Readonly<{ children: React.ReactNode }>;
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route render failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-rose-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-rose-700">Something went wrong</p>
              <p className="mt-2 text-sm leading-6">{this.state.error.message}</p>
              <button type="button" className="dashboard-secondary-button mt-4" onClick={() => window.location.reload()}>
                <RefreshCw size={16} />
                Retry
              </button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

export default App;
