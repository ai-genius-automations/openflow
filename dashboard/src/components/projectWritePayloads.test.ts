import { describe, expect, test } from 'bun:test';
import type { Project } from '../lib/api';
import {
  buildProjectCreatePayload,
  buildProjectUpdatePayload,
  type ProjectFormValues,
} from './projectWritePayloads';

const baseValues: ProjectFormValues = {
  name: 'OpenClaw Bridge',
  path: '/tmp/openclaw-bridge',
  description: 'Session bridge project',
  defaultWebUrl: '',
  rufloPrompt: 'Always use TDD',
  openclawPrompt: 'Confirm destructive actions',
};

const existingProject: Project = {
  id: 'proj-1',
  name: 'OpenClaw Bridge',
  path: '/tmp/openclaw-bridge',
  description: 'Session bridge project',
  ruflo_prompt: 'Always use TDD',
  openclaw_prompt: 'Confirm destructive actions',
  default_web_url: 'http://localhost:3000',
  created_at: '2026-03-27T00:00:00Z',
};

describe('project write payloads', () => {
  test('buildProjectCreatePayload includes both prompt fields', () => {
    const payload = buildProjectCreatePayload(baseValues);

    expect(payload).toEqual({
      name: 'OpenClaw Bridge',
      path: '/tmp/openclaw-bridge',
      description: 'Session bridge project',
      ruflo_prompt: 'Always use TDD',
      openclaw_prompt: 'Confirm destructive actions',
      default_web_url: undefined,
    });
  });

  test('buildProjectCreatePayload keeps prompt keys even when prompts are empty', () => {
    const payload = buildProjectCreatePayload({
      ...baseValues,
      rufloPrompt: '',
      openclawPrompt: '',
    });

    expect(payload).toHaveProperty('ruflo_prompt', '');
    expect(payload).toHaveProperty('openclaw_prompt', '');
  });

  test('buildProjectUpdatePayload includes changed prompt fields', () => {
    const payload = buildProjectUpdatePayload(existingProject, {
      ...baseValues,
      defaultWebUrl: 'http://localhost:3000',
      rufloPrompt: 'Always use TDD and London School mocks',
      openclawPrompt: 'Confirm destructive actions',
    });

    expect(payload).toEqual({
      ruflo_prompt: 'Always use TDD and London School mocks',
    });
  });

  test('buildProjectUpdatePayload clears prompts with null when user empties them', () => {
    const payload = buildProjectUpdatePayload(existingProject, {
      ...baseValues,
      defaultWebUrl: 'http://localhost:3000',
      rufloPrompt: '',
      openclawPrompt: '',
    });

    expect(payload).toEqual({
      ruflo_prompt: null,
      openclaw_prompt: null,
    });
  });
});
