import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Play, Loader2, Plus, FolderOpen, ChevronRight, ArrowUp, Trash2, X, Bot, Pencil, Save, TerminalSquare } from 'lucide-react';
import { AgentGuideModal } from './AgentGuide';

interface NewTaskFormProps {
  onSessionCreated?: (sessionId: string, projectName?: string, mode?: 'session' | 'terminal') => void;
}

function FolderBrowser({ onSelect }: { onSelect: (path: string, folderName: string) => void }) {
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['browse', browsePath],
    queryFn: () => api.projects.browse(browsePath),
  });

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
    >
      {/* Current path header */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
      >
        {data?.parent && (
          <button
            onClick={() => setBrowsePath(data.parent!)}
            className="p-0.5 rounded hover:bg-white/10"
            title="Go up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="truncate font-mono">{data?.path || '~'}</span>
        <button
          onClick={() => {
            if (data?.path) onSelect(data.path, data.folderName);
          }}
          className="ml-auto px-2 py-1 rounded text-xs font-medium shrink-0"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Select This Folder
        </button>
      </div>

      {/* Directory listing */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : data?.dirs.length === 0 ? (
          <div className="py-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            No subdirectories
          </div>
        ) : (
          data?.dirs.map((dir) => (
            <button
              key={dir.path}
              onClick={() => setBrowsePath(dir.path)}
              onDoubleClick={() => onSelect(dir.path, dir.name)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/5 text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="truncate">{dir.name}</span>
              {dir.hasChildren && (
                <ChevronRight className="w-3 h-3 ml-auto shrink-0" style={{ color: 'var(--text-secondary)' }} />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function NewTaskForm({ onSessionCreated }: NewTaskFormProps) {
  const [projectId, setProjectId] = useState('');
  const [task, setTask] = useState('');
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '', description: '', session_prompt: '', openclaw_prompt: '' });
  const [showBrowser, setShowBrowser] = useState(false);
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  // Session-level prompt overrides (reset when project changes, not saved)
  const [sessionPrompt, setSessionPrompt] = useState<string | null>(null);
  const [sessionOpenclawPrompt, setSessionOpenclawPrompt] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  });

  const projects = projectsData?.projects || [];

  const addProjectMutation = useMutation({
    mutationFn: () => api.projects.create(newProject),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowAddProject(false);
      setShowBrowser(false);
      setNewProject({ name: '', path: '', description: '', session_prompt: '', openclaw_prompt: '' });
      if (data.project?.id) setProjectId(data.project.id);
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: (data: { id: string; session_prompt?: string | null; openclaw_prompt?: string | null; name?: string; description?: string }) => {
      const { id, ...fields } = data;
      return api.projects.update(id, fields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingProject(false);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectId('');
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) throw new Error('Select a project');
      const baseTask = task.trim() || 'Start up and ask me what I want you to do and NOTHING ELSE';
      const sessionPromptVal = (sessionPrompt ?? proj.session_prompt ?? '').trim();
      const effectiveTask = sessionPromptVal
        ? `${baseTask}\n\n---\nAdditional Instructions:\n${sessionPromptVal}`
        : baseTask;
      return api.sessions.create({ project_path: proj.path, task: effectiveTask, project_id: proj.id });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      const proj = projects.find((p) => p.id === projectId);
      setTask('');
      if (data.session?.id) {
        onSessionCreated?.(data.session.id, proj?.name, 'session');
      }
    },
  });

  const terminalMutation = useMutation({
    mutationFn: () => {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) throw new Error('Select a project');
      return api.sessions.create({ project_path: proj.path, mode: 'terminal', project_id: proj.id });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      const proj = projects.find((p) => p.id === projectId);
      if (data.session?.id) {
        onSessionCreated?.(data.session.id, proj?.name, 'terminal');
      }
    },
  });

  // Auto-select first project
  if (projects.length > 0 && !projectId) {
    setProjectId(projects[0].id);
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  // Reset session overrides when project changes
  const handleProjectChange = (id: string) => {
    setProjectId(id);
    setSessionPrompt(null);
    setSessionOpenclawPrompt(null);
    setEditingProject(false);
  };

  const handleFolderSelect = (path: string, folderName: string) => {
    setNewProject((p) => ({
      ...p,
      path,
      name: p.name || folderName,
    }));
    setShowBrowser(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Main task form */}
      <div
        className="rounded-xl border p-8"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
          Launch Task
        </h2>

        <div className="space-y-5">
          {/* Project selector */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Project
            </label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</span>
              </div>
            ) : projects.length === 0 && !showAddProject ? (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No projects registered yet. Add a project folder to get started.
                </p>
                <button
                  onClick={() => setShowAddProject(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  <Plus className="w-4 h-4" />
                  Add Project
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg border text-sm outline-none"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {projects.length === 0 && (
                    <option value="">Add a project below...</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.path}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowAddProject(!showAddProject)}
                  className="px-3 py-3 rounded-lg border text-sm"
                  style={{
                    background: showAddProject ? 'var(--accent)' : 'var(--bg-tertiary)',
                    borderColor: 'var(--border)',
                    color: showAddProject ? 'white' : 'var(--text-secondary)',
                  }}
                  title="Add project"
                >
                  <Plus className="w-4 h-4" />
                </button>
                {projectId && (
                  <>
                    <button
                      onClick={() => setEditingProject(!editingProject)}
                      className="px-3 py-3 rounded-lg border text-sm"
                      style={{
                        background: editingProject ? 'var(--accent)' : 'var(--bg-tertiary)',
                        borderColor: 'var(--border)',
                        color: editingProject ? 'white' : 'var(--text-secondary)',
                      }}
                      title="Edit project"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Remove this project from the list?')) {
                          deleteProjectMutation.mutate(projectId);
                        }
                      }}
                      className="px-3 py-3 rounded-lg border text-sm"
                      style={{
                        background: 'var(--bg-tertiary)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                      title="Remove project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Session prompts (from project defaults, editable per-session) */}
          {selectedProject && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Session Prompt
                  </label>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Prepended to task when launching
                  </span>
                </div>
                <textarea
                  value={sessionPrompt ?? selectedProject.session_prompt ?? ''}
                  onChange={(e) => setSessionPrompt(e.target.value)}
                  placeholder="System instructions prepended to every task for this project..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm" style={{ color: 'var(--text-secondary)' }}>
                    OpenClaw Session Prompt
                  </label>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Included in OpenClaw modal only
                  </span>
                </div>
                <textarea
                  value={sessionOpenclawPrompt ?? selectedProject.openclaw_prompt ?? ''}
                  onChange={(e) => setSessionOpenclawPrompt(e.target.value)}
                  placeholder="Additional instructions included when running via OpenClaw..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              {(sessionPrompt !== null || sessionOpenclawPrompt !== null) && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  Prompts modified for this session only. Use the edit button to save as project defaults.
                </p>
              )}
            </div>
          )}

          {/* Task input */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Task / Objective
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want Claude to do...&#10;&#10;Be specific about the changes you want. Include file paths, feature descriptions, and acceptance criteria."
              rows={10}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                minHeight: '200px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (projectId) createMutation.mutate();
                }
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Cmd+Enter / Ctrl+Enter to launch
            </p>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!projectId || createMutation.isPending}
              className="flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Launch Session
            </button>
            <button
              onClick={() => setShowOpenClaw(true)}
              disabled={!projectId}
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              title="Get API command for OpenClaw or other bot agents"
            >
              <Bot className="w-4 h-4" />
              Run with OpenClaw
            </button>
            <button
              onClick={() => terminalMutation.mutate()}
              disabled={!projectId || terminalMutation.isPending}
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              title="Open a plain terminal in the project directory"
            >
              {terminalMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TerminalSquare className="w-4 h-4" />
              )}
              Launch Terminal
            </button>
          </div>

          {(createMutation.isError || terminalMutation.isError) && (
            <p className="text-sm" style={{ color: 'var(--error)' }}>
              {((createMutation.error || terminalMutation.error) as Error).message}
            </p>
          )}
        </div>
      </div>

      {/* OpenClaw modal */}
      {showOpenClaw && (() => {
        const proj = projects.find((p) => p.id === projectId);
        if (!proj) return null;
        const sessionPromptVal = (sessionPrompt ?? proj.session_prompt ?? '').trim();
        const ocPrompt = (sessionOpenclawPrompt ?? proj.openclaw_prompt ?? '').trim();
        const instructions = [sessionPromptVal, ocPrompt].filter(Boolean).join('\n\n') || undefined;
        return (
          <AgentGuideModal
            onClose={() => setShowOpenClaw(false)}
            projectName={proj.name}
            projectPath={proj.path}
            task={task.trim() || undefined}
            additionalInstructions={instructions}
          />
        );
      })()}

      {/* Edit project form */}
      {editingProject && selectedProject && (
        <EditProjectPanel
          project={selectedProject}
          onSave={(data) => updateProjectMutation.mutate({ id: selectedProject.id, ...data })}
          onClose={() => setEditingProject(false)}
          isPending={updateProjectMutation.isPending}
          error={updateProjectMutation.isError ? (updateProjectMutation.error as Error).message : undefined}
        />
      )}

      {/* Add project form */}
      {showAddProject && (
        <div
          className="rounded-xl border p-6"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Add Project
            </h3>
            <button
              onClick={() => { setShowAddProject(false); setShowBrowser(false); setNewProject({ name: '', path: '', description: '', session_prompt: '', openclaw_prompt: '' }); }}
              className="p-1 rounded hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {/* Path input with browse button */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Folder Path
              </label>
              <div className="flex gap-2">
                <input
                  value={newProject.path}
                  onChange={(e) => {
                    const val = e.target.value;
                    const folderName = prevFolderName(val);
                    setNewProject((prev) => ({
                      ...prev,
                      path: val,
                      // Auto-set name if it's empty or matches the previous folder name
                      name: (!prev.name || prev.name === prevFolderName(prev.path)) ? folderName : prev.name,
                    }));
                  }}
                  placeholder="/home/user/projects/myapp"
                  className="flex-1 px-4 py-2.5 rounded-lg border text-sm outline-none font-mono"
                  style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={() => setShowBrowser(!showBrowser)}
                  className="px-3 py-2.5 rounded-lg border text-sm flex items-center gap-1.5"
                  style={{
                    background: showBrowser ? 'var(--accent)' : 'var(--bg-tertiary)',
                    borderColor: 'var(--border)',
                    color: showBrowser ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
            </div>

            {/* Folder browser */}
            {showBrowser && (
              <FolderBrowser onSelect={handleFolderSelect} />
            )}

            {/* Name input */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Project Name
              </label>
              <input
                value={newProject.name}
                onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                placeholder="My Project"
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Description (optional)
              </label>
              <input
                value={newProject.description}
                onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this project"
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Session prompt */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Session Prompt (optional)
              </label>
              <textarea
                value={newProject.session_prompt}
                onChange={(e) => setNewProject((p) => ({ ...p, session_prompt: e.target.value }))}
                placeholder="System instructions prepended to every task for this project..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* OpenClaw prompt */}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                OpenClaw Session Prompt (optional)
              </label>
              <textarea
                value={newProject.openclaw_prompt}
                onChange={(e) => setNewProject((p) => ({ ...p, openclaw_prompt: e.target.value }))}
                placeholder="Additional instructions included when running via OpenClaw..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Error display */}
            {addProjectMutation.isError && (
              <p className="text-xs" style={{ color: 'var(--error)' }}>
                {(addProjectMutation.error as Error).message}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={() => addProjectMutation.mutate()}
              disabled={!newProject.name || !newProject.path || addProjectMutation.isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {addProjectMutation.isPending ? 'Adding...' : 'Add Project'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper to extract folder name from a path (for auto-name detection) */
function prevFolderName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

import type { Project } from '../lib/api';

function EditProjectPanel({
  project,
  onSave,
  onClose,
  isPending,
  error,
}: {
  project: Project;
  onSave: (data: { name?: string; description?: string; session_prompt?: string | null; openclaw_prompt?: string | null }) => void;
  onClose: () => void;
  isPending: boolean;
  error?: string;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [sessionPromptEdit, setSessionPromptEdit] = useState(project.session_prompt || '');
  const [openclawPrompt, setOpenclawPrompt] = useState(project.openclaw_prompt || '');

  return (
    <div
      className="rounded-xl border p-6"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Edit Project — {project.name}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            Project Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            Path
          </label>
          <div
            className="px-4 py-2.5 rounded-lg border text-sm font-mono"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {project.path}
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            Description
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this project"
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            Session Prompt
          </label>
          <textarea
            value={sessionPromptEdit}
            onChange={(e) => setSessionPromptEdit(e.target.value)}
            placeholder="System instructions prepended to every task for this project..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            OpenClaw Session Prompt
          </label>
          <textarea
            value={openclawPrompt}
            onChange={(e) => setOpenclawPrompt(e.target.value)}
            placeholder="Additional instructions included when running via OpenClaw..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-y"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        <button
          onClick={() => onSave({
            name: name !== project.name ? name : undefined,
            description: description !== (project.description || '') ? description : undefined,
            session_prompt: sessionPromptEdit !== (project.session_prompt || '') ? (sessionPromptEdit || null) : undefined,
            openclaw_prompt: openclawPrompt !== (project.openclaw_prompt || '') ? (openclawPrompt || null) : undefined,
          })}
          disabled={isPending || !name}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
