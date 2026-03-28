import type { Project } from '../lib/api';

export interface ProjectFormValues {
  name: string;
  path: string;
  description: string;
  defaultWebUrl: string;
  rufloPrompt: string;
  openclawPrompt: string;
}

export function buildProjectCreatePayload(values: ProjectFormValues) {
  return {
    name: values.name,
    path: values.path,
    description: values.description,
    ruflo_prompt: values.rufloPrompt,
    openclaw_prompt: values.openclawPrompt,
    default_web_url: values.defaultWebUrl || undefined,
  };
}

export function buildProjectUpdatePayload(project: Project, values: ProjectFormValues) {
  const fields: {
    name?: string;
    description?: string;
    ruflo_prompt?: string | null;
    openclaw_prompt?: string | null;
    default_web_url?: string | null;
  } = {};

  if (values.name !== project.name) fields.name = values.name;
  if (values.description !== (project.description || '')) fields.description = values.description;
  if (values.defaultWebUrl !== (project.default_web_url || '')) {
    fields.default_web_url = values.defaultWebUrl || null;
  }
  if (values.rufloPrompt !== (project.ruflo_prompt || '')) {
    fields.ruflo_prompt = values.rufloPrompt || null;
  }
  if (values.openclawPrompt !== (project.openclaw_prompt || '')) {
    fields.openclaw_prompt = values.openclawPrompt || null;
  }

  return fields;
}
