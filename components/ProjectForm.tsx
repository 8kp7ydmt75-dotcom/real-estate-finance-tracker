import React, { useEffect, useState } from 'react';
import { NewProjectInput, Project } from '../types';

interface ProjectFormProps {
  project?: Project;
  onSubmit: (input: NewProjectInput) => Promise<void> | void;
  onCancel: () => void;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ project, onSubmit, onCancel }) => {
  const [name, setName] = useState(project?.name || '');
  const [code, setCode] = useState(project?.code || '');
  const [location, setLocation] = useState(project?.location || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(project);

  useEffect(() => {
    setError(null);
  }, [name, code, location]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedName) {
      setError('Project name is required.');
      return;
    }

    if (!normalizedCode) {
      setError('Project code is required.');
      return;
    }

    if (!/^[A-Z0-9_]+$/.test(normalizedCode)) {
      setError('Project code can only contain uppercase letters, numbers, and underscores.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        name: normalizedName,
        code: normalizedCode,
        location: location.trim() || null
      });
    } catch (submitError: any) {
      console.error('Error saving project', submitError);
      setError(submitError?.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="dashboard-surface space-y-5">
      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="form-field">
        <label htmlFor="project-name">Name *</label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="form-control"
          placeholder="e.g. Skyline Heights"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="project-code">Code *</label>
        <input
          id="project-code"
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
          className="form-control disabled:bg-slate-50 disabled:text-slate-500"
          placeholder="e.g. NA_RES"
          disabled={isEditing}
          required
        />
        {isEditing && <p className="form-hint">Project code is immutable after creation.</p>}
      </div>

      <div className="form-field">
        <label htmlFor="project-location">Location</label>
        <input
          id="project-location"
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="form-control"
          placeholder="e.g. Hyderabad"
        />
      </div>

      <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="dashboard-secondary-button justify-center sm:min-w-28">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="dashboard-primary-button justify-center sm:min-w-32 disabled:opacity-60">
          {saving ? 'Saving...' : isEditing ? 'Update Project' : 'Create Project'}
        </button>
      </footer>
    </form>
  );
};

export default ProjectForm;
