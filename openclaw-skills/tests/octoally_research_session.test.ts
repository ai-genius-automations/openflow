import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  OctoAllyClient,
  cancel,
  continue as continueSession,
  createResearchSessionSkill,
  monitor,
  status,
} from '../octoally_research_session.ts';
import researchClaude from '../research_claude.ts';
import researchCodex from '../research_codex.ts';

type FetchHandler = (url: URL, init: RequestInit) => Promise<Response> | Response;

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createStubClient(handler: FetchHandler): OctoAllyClient {
  return new OctoAllyClient({
    baseUrl: 'http://octoally.test',
    fetchImpl: async (input, init = {}) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === 'string' ? input : input.url);
      return handler(url, init);
    },
  });
}

describe('octoally_research_session', () => {
  test('status normalizes busy sessions to running', async () => {
    const client = createStubClient((url, init) => {
      assert.equal(init.method, undefined);
      assert.equal(url.pathname, '/api/sessions/sess-1/state');
      return json(200, {
        sessionId: 'sess-1',
        processState: 'busy',
        lastActivity: Date.now(),
        promptType: null,
        choices: null,
      });
    });

    const result = await status('sess-1', { client });

    assert.equal(result.status, 'running');
    assert.equal(result.waitingForInput, false);
    assert.equal(result.prompt, null);
  });

  test('status falls back to the session record for terminal states', async () => {
    const seenUrls: string[] = [];
    const client = createStubClient((url) => {
      seenUrls.push(url.pathname);
      if (url.pathname === '/api/sessions/sess-2/state') {
        return json(404, { error: 'Session not found or not running' });
      }

      if (url.pathname === '/api/sessions/sess-2') {
        return json(200, {
          session: {
            id: 'sess-2',
            status: 'failed',
          },
        });
      }

      return json(500, { error: 'Unexpected route' });
    });

    const result = await status('sess-2', { client });

    assert.equal(result.status, 'failed');
    assert.deepEqual(seenUrls, ['/api/sessions/sess-2/state', '/api/sessions/sess-2']);
  });

  test('status surfaces destructive waiting-for-input prompts', async () => {
    const client = createStubClient((url) => {
      if (url.pathname === '/api/sessions/sess-3/state') {
        return json(200, {
          sessionId: 'sess-3',
          processState: 'waiting_for_input',
          lastActivity: Date.now(),
          promptType: 'confirmation',
          choices: ['Yes', 'No'],
        });
      }

      if (url.pathname === '/api/sessions/sess-3/display' && url.search === '?lines=40') {
        return json(200, {
          sessionId: 'sess-3',
          processState: 'waiting_for_input',
          promptType: 'confirmation',
          choices: ['Yes', 'No'],
          output: 'Delete the generated workspace snapshot? (y/N)',
          cursor: 12,
          truncated: false,
        });
      }

      return json(500, { error: 'Unexpected route' });
    });

    const result = await status('sess-3', { client });

    assert.equal(result.status, 'waiting_for_input');
    assert.equal(result.waitingForInput, true);
    assert.deepEqual(result.prompt, {
      type: 'confirmation',
      choices: ['Yes', 'No'],
      destructiveChoices: [],
      isDestructive: true,
      requiresExplicitApproval: true,
      reason: 'Prompt references a destructive action.',
    });
  });

  test('monitor returns summarized output with prompt metadata', async () => {
    const client = createStubClient((url) => {
      assert.equal(url.pathname, '/api/sessions/sess-4/display');
      assert.equal(url.search, '?since=9&lines=80');
      return json(200, {
        sessionId: 'sess-4',
        processState: 'waiting_for_input',
        promptType: 'choice',
        choices: ['Delete the branch', 'Keep the branch'],
        output: [
          'Planning completed.',
          '',
          '1. Delete the branch',
          '2. Keep the branch',
          'Choose an option:',
        ].join('\n'),
        cursor: 33,
        truncated: false,
      });
    });

    const result = await monitor('sess-4', 9, { client });

    assert.equal(result.status, 'waiting_for_input');
    assert.equal(result.cursor, 33);
    assert.match(result.summary, /Choose an option:/);
    assert.equal(result.prompt?.isDestructive, true);
  });

  test('continue blocks destructive confirmations until explicitly allowed', async () => {
    let executeCalled = false;
    const client = createStubClient((url) => {
      if (url.pathname === '/api/sessions/sess-5/state') {
        return json(200, {
          sessionId: 'sess-5',
          processState: 'waiting_for_input',
          lastActivity: Date.now(),
          promptType: 'confirmation',
          choices: ['Yes', 'No'],
        });
      }

      if (url.pathname === '/api/sessions/sess-5/display' && url.search === '?lines=40') {
        return json(200, {
          sessionId: 'sess-5',
          processState: 'waiting_for_input',
          promptType: 'confirmation',
          choices: ['Yes', 'No'],
          output: 'Remove the workspace lock file and discard uncommitted changes? (y/N)',
          cursor: 88,
          truncated: false,
        });
      }

      if (url.pathname === '/api/sessions/sess-5/execute') {
        executeCalled = true;
      }

      return json(500, { error: 'Unexpected route' });
    });

    await assert.rejects(
      () => continueSession('sess-5', 'yes', 30_000, 2_000, { client }),
      /explicit approval/i,
    );
    assert.equal(executeCalled, false);
  });

  test('continue sends input and returns a normalized response when safe', async () => {
    const seenBodies: string[] = [];
    const client = createStubClient(async (url, init) => {
      if (url.pathname === '/api/sessions/sess-6/state') {
        return json(200, {
          sessionId: 'sess-6',
          processState: 'idle',
          lastActivity: Date.now(),
          promptType: null,
          choices: null,
        });
      }

      if (url.pathname === '/api/sessions/sess-6/execute') {
        assert.equal(init.method, 'POST');
        seenBodies.push(String(init.body));
        return json(200, {
          id: 'sess-6',
          status: 'completed',
          output: 'Root cause isolated.\nProposed the smallest safe patch.',
          durationMs: 125,
          state: {
            sessionId: 'sess-6',
            processState: 'idle',
            lastActivity: Date.now(),
            promptType: null,
            choices: null,
          },
        });
      }

      return json(500, { error: 'Unexpected route' });
    });

    const result = await continueSession(
      'sess-6',
      'Continue. Focus on root-cause analysis first.',
      45_000,
      5_000,
      { client },
    );

    assert.equal(result.responseStatus, 'completed');
    assert.equal(result.sessionStatus, 'idle');
    assert.match(result.summary, /smallest safe patch/i);
    assert.equal(seenBodies.length, 1);
    assert.deepEqual(JSON.parse(seenBodies[0] ?? ''), {
      input: 'Continue. Focus on root-cause analysis first.',
      timeout: 45_000,
      quiescenceMs: 5_000,
      stripAnsi: true,
    });
  });

  test('cancel confirms cancellation and infers lock release from cancelled status', async () => {
    const seenUrls: string[] = [];
    const client = createStubClient((url) => {
      seenUrls.push(url.pathname);
      if (url.pathname === '/api/sessions/sess-7/cancel') {
        return json(200, { ok: true });
      }

      if (url.pathname === '/api/sessions/sess-7') {
        return json(200, {
          session: {
            id: 'sess-7',
            status: 'cancelled',
            lock_key: null,
          },
        });
      }

      return json(500, { error: 'Unexpected route' });
    });

    const result = await cancel('sess-7', { client });

    assert.equal(result.status, 'cancelled');
    assert.equal(result.cancelled, true);
    assert.equal(result.lockReleased, true);
    assert.deepEqual(seenUrls, ['/api/sessions/sess-7/cancel', '/api/sessions/sess-7']);
  });

  test('wrapper skills stay thin and only set cli_type', async () => {
    assert.equal(researchClaude.cliType, 'claude');
    assert.equal(researchCodex.cliType, 'codex');

    const baseSkill = createResearchSessionSkill();
    assert.equal(typeof researchClaude.status, 'function');
    assert.equal(typeof researchCodex.monitor, 'function');
    assert.notEqual(baseSkill, researchClaude);
  });
});
