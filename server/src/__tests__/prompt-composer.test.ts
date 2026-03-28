/**
 * T007: Prompt composer service tests
 */
import { describe, test, expect } from 'bun:test';
import { composeSessionTask } from '../services/prompt-composer.js';

describe('T007: composeSessionTask', () => {
  test('returns userGoal alone when no prompts provided', () => {
    const result = composeSessionTask('Fix the login bug');
    expect(result).toBe('Fix the login bug');
  });

  test('appends ruflo prompt when provided', () => {
    const result = composeSessionTask('Fix the login bug', 'Always use TDD');
    expect(result).toBe(
      'Fix the login bug\n\n---\nAdditional Instructions (Ruflo):\nAlways use TDD'
    );
  });

  test('omits ruflo prompt when empty string', () => {
    const result = composeSessionTask('Fix the login bug', '');
    expect(result).toBe('Fix the login bug');
  });

  test('omits ruflo prompt when only whitespace', () => {
    const result = composeSessionTask('Fix the login bug', '   ');
    expect(result).toBe('Fix the login bug');
  });

  test('does NOT include openclaw prompt when promptContext is not "openclaw"', () => {
    const result = composeSessionTask('Fix the login bug', undefined, 'OpenClaw rules', 'ui');
    expect(result).toBe('Fix the login bug');
    expect(result).not.toContain('OpenClaw');
  });

  test('does NOT include openclaw prompt when promptContext is undefined', () => {
    const result = composeSessionTask('Fix the login bug', undefined, 'OpenClaw rules');
    expect(result).toBe('Fix the login bug');
  });

  test('includes openclaw prompt when promptContext is "openclaw"', () => {
    const result = composeSessionTask('Fix the login bug', undefined, 'Follow OWASP', 'openclaw');
    expect(result).toBe(
      'Fix the login bug\n\n---\nAdditional Instructions (OpenClaw):\nFollow OWASP'
    );
  });

  test('includes both ruflo and openclaw prompts in correct order', () => {
    const result = composeSessionTask(
      'Fix the login bug',
      'Always use TDD',
      'Follow OWASP',
      'openclaw',
    );
    expect(result).toBe(
      'Fix the login bug\n\n' +
      '---\nAdditional Instructions (Ruflo):\nAlways use TDD\n\n' +
      '---\nAdditional Instructions (OpenClaw):\nFollow OWASP'
    );
  });

  test('trims whitespace from ruflo prompt', () => {
    const result = composeSessionTask('goal', '  trimmed  ');
    expect(result).toContain('Additional Instructions (Ruflo):\ntrimmed');
  });

  test('trims whitespace from openclaw prompt', () => {
    const result = composeSessionTask('goal', undefined, '  trimmed  ', 'openclaw');
    expect(result).toContain('Additional Instructions (OpenClaw):\ntrimmed');
  });

  test('omits empty openclaw prompt even with openclaw context', () => {
    const result = composeSessionTask('goal', undefined, '', 'openclaw');
    expect(result).toBe('goal');
  });

  test('omits whitespace-only openclaw prompt even with openclaw context', () => {
    const result = composeSessionTask('goal', undefined, '   ', 'openclaw');
    expect(result).toBe('goal');
  });

  test('omits null ruflo prompt values', () => {
    const result = composeSessionTask('goal', null as unknown as string);
    expect(result).toBe('goal');
  });

  test('omits null openclaw prompt values even in openclaw context', () => {
    const result = composeSessionTask('goal', undefined, null as unknown as string, 'openclaw');
    expect(result).toBe('goal');
  });

  test('tolerates mixed empty, null, and undefined prompt inputs', () => {
    const result = composeSessionTask(
      'goal',
      '' as unknown as string,
      undefined,
      'openclaw',
    );
    expect(result).toBe('goal');
  });
});
