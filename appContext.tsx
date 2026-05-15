import React, { createContext, useContext } from 'react';
import { NewProjectInput, Project, ProjectStats, Transaction, Unit, UpdateProjectInput } from './types';

export type AppStatus = 'loading' | 'selecting' | 'ready' | 'error';

// Routes choose the project; AppContext exposes the loaded project-scoped rows
// and write helpers to screens under that route.
export interface AppContextType {
  project: Project | null;
  activeProject: Project | null;
  projects: Project[];
  projectStats: Record<string, ProjectStats>;
  units: Unit[];
  transactions: Transaction[];
  appStatus: AppStatus;
  loadError: string | null;
  switchProject: (id: string) => void;
  loadProject: (id: string) => Promise<void>;
  createProject: (input: NewProjectInput) => Promise<Project>;
  updateProject: (id: string, input: UpdateProjectInput) => Promise<Project>;
  refreshProjects: () => Promise<void>;
  addTransaction: (t: Transaction) => Promise<void>;
  updateTransaction: (t: Transaction) => Promise<void>;
  deleteTransaction: (id?: string, reason?: string) => Promise<void>;
  addUnit: (u: Unit) => Promise<void>;
  updateUnit: (u: Unit) => Promise<void>;
  deleteUnit: (id?: string, reason?: string) => Promise<void>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
