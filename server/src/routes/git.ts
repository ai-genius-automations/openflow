import { FastifyPluginAsync } from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 5 * 1024 * 1024 });
  return stdout;
}

async function isGitRepo(path: string): Promise<boolean> {
  try {
    await git(path, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export const gitRoutes: FastifyPluginAsync = async (app) => {
  // GET /git/status — branch name + changed files
  app.get<{ Querystring: { path: string } }>('/git/status', async (req, reply) => {
    const { path } = req.query;
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const [branchOut, statusOut, aheadBehindOut, remoteOut] = await Promise.all([
        git(path, ['rev-parse', '--abbrev-ref', 'HEAD']),
        git(path, ['status', '--porcelain=v1']),
        git(path, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).catch(() => ''),
        git(path, ['remote', 'get-url', 'origin']).catch(() => ''),
      ]);

      const branch = branchOut.trim();
      let ahead = 0;
      let behind = 0;
      if (aheadBehindOut.trim()) {
        const parts = aheadBehindOut.trim().split(/\s+/);
        ahead = parseInt(parts[0]) || 0;
        behind = parseInt(parts[1]) || 0;
      }

      const files = statusOut
        .split('\n')
        .filter((l) => l.length > 0)
        .map((line) => {
          const x = line[0]; // index status
          const y = line[1]; // worktree status
          const filePath = line.slice(3);
          return { x, y, path: filePath };
        });

      // Convert git remote URL to GitHub web URL
      let remoteUrl: string | null = null;
      const raw = remoteOut.trim();
      if (raw) {
        // SSH: git@github.com:user/repo.git → https://github.com/user/repo
        // HTTPS: https://github.com/user/repo.git → https://github.com/user/repo
        const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
        if (sshMatch) remoteUrl = `https://${sshMatch[1]}/${sshMatch[2]}`;
        else if (raw.startsWith('http')) remoteUrl = raw.replace(/\.git$/, '');
      }

      return { branch, ahead, behind, files, remoteUrl };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /git/log — recent commits
  app.get<{ Querystring: { path: string; limit?: string } }>('/git/log', async (req, reply) => {
    const { path, limit } = req.query;
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const n = Math.min(parseInt(limit || '20') || 20, 100);
      const out = await git(path, [
        'log',
        `-${n}`,
        '--format=%H%n%an%n%aI%n%s',
      ]);

      const lines = out.split('\n').filter((l) => l.length > 0);
      const commits = [];
      for (let i = 0; i + 3 < lines.length; i += 4) {
        commits.push({
          hash: lines[i],
          author: lines[i + 1],
          date: lines[i + 2],
          message: lines[i + 3],
        });
      }

      return { commits };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /git/show — files changed in a specific commit + its diff
  app.get<{ Querystring: { path: string; hash: string; ignoreWhitespace?: string; fullFile?: string } }>('/git/show', async (req, reply) => {
    const { path, hash, ignoreWhitespace, fullFile } = req.query;
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!hash) return reply.status(400).send({ error: 'hash is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const showArgs = ['show', '--format=', hash];
      if (ignoreWhitespace === 'true') showArgs.push('-w');
      if (fullFile === 'true') showArgs.push('-U99999');
      const [nameStatusOut, diffOut] = await Promise.all([
        git(path, ['diff-tree', '--no-commit-id', '-r', '--name-status', hash]),
        git(path, showArgs),
      ]);

      const files = nameStatusOut
        .split('\n')
        .filter((l) => l.length > 0)
        .map((line) => {
          const [status, ...rest] = line.split('\t');
          return { status: status.trim(), path: rest.join('\t').trim() };
        });

      return { files, diff: diffOut };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /git/diff — diff for a file or all changes
  app.get<{ Querystring: { path: string; file?: string; staged?: string; ignoreWhitespace?: string; fullFile?: string } }>(
    '/git/diff',
    async (req, reply) => {
      const { path, file, staged, ignoreWhitespace, fullFile } = req.query;
      if (!path) return reply.status(400).send({ error: 'path is required' });
      if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

      try {
        const args = ['diff'];
        if (staged === 'true') args.push('--cached');
        if (ignoreWhitespace === 'true') args.push('-w');
        if (fullFile === 'true') args.push('-U99999');
        if (file) args.push('--', file);
        const diff = await git(path, args);
        return { diff };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }
  );

  // POST /git/stage — stage file(s)
  app.post<{ Body: { path: string; files: string[] } }>('/git/stage', async (req, reply) => {
    const { path, files } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!files?.length) return reply.status(400).send({ error: 'files array is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      await git(path, ['add', '--', ...files]);
      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/unstage — unstage file(s)
  app.post<{ Body: { path: string; files: string[] } }>('/git/unstage', async (req, reply) => {
    const { path, files } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!files?.length) return reply.status(400).send({ error: 'files array is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      await git(path, ['restore', '--staged', '--', ...files]);
      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/commit — commit with message
  app.post<{ Body: { path: string; message: string } }>('/git/commit', async (req, reply) => {
    const { path, message } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!message?.trim()) return reply.status(400).send({ error: 'message is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const out = await git(path, ['commit', '-m', message]);
      return { ok: true, output: out.trim() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/push — push to remote
  app.post<{ Body: { path: string } }>('/git/push', async (req, reply) => {
    const { path } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const out = await git(path, ['push']);
      return { ok: true, output: out.trim() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/discard — discard working-tree changes for a file
  app.post<{ Body: { path: string; files: string[] } }>('/git/discard', async (req, reply) => {
    const { path, files } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!files?.length) return reply.status(400).send({ error: 'files array is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      await git(path, ['checkout', '--', ...files]);
      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /git/branches — list local + remote branches
  app.get<{ Querystring: { path: string } }>('/git/branches', async (req, reply) => {
    const { path } = req.query;
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      // Fetch latest remote refs (ignore errors for offline)
      await git(path, ['fetch', '--prune']).catch(() => {});

      const out = await git(path, ['branch', '-a', '--format=%(refname:short)\t%(HEAD)\t%(upstream:short)']);
      const current = (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();

      const branches = out
        .split('\n')
        .filter(l => l.length > 0)
        .map(line => {
          const [name, head, tracking] = line.split('\t');
          return { name, current: head === '*', remote: name.startsWith('origin/'), tracking: tracking || undefined };
        })
        .filter(b => b.name !== 'origin/HEAD');

      return { branches, current };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/checkout — switch branch
  app.post<{ Body: { path: string; branch: string; isRemote?: boolean } }>('/git/checkout', async (req, reply) => {
    const { path, branch, isRemote } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!branch) return reply.status(400).send({ error: 'branch is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      if (isRemote) {
        const localName = branch.replace(/^origin\//, '');
        await git(path, ['switch', '-c', localName, '--track', branch]);
      } else {
        await git(path, ['switch', branch]);
      }
      return { ok: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /git/fetch — fetch from remote
  app.post<{ Body: { path: string } }>('/git/fetch', async (req, reply) => {
    const { path } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const out = await git(path, ['fetch', '--prune']);
      return { ok: true, output: out.trim() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /git/gh-accounts — list GitHub user + orgs available via gh CLI
  app.get('/git/gh-accounts', async (_req, reply) => {
    try {
      // Get the authenticated user's login
      const { stdout: userOut } = await execFileAsync('gh', ['api', '/user', '--jq', '.login'], { maxBuffer: 1024 * 1024 });
      const username = userOut.trim();
      if (!username) return { accounts: [] };

      // Get organizations the user belongs to
      const { stdout: orgsOut } = await execFileAsync('gh', ['api', '/user/orgs', '--jq', '.[].login'], { maxBuffer: 1024 * 1024 }).catch(() => ({ stdout: '' }));
      const orgs = orgsOut.split('\n').map(l => l.trim()).filter(Boolean);

      return { accounts: [username, ...orgs] };
    } catch {
      return { accounts: [] };
    }
  });

  // POST /git/create-repo — initialize git repo and create GitHub remote
  app.post<{ Body: { path: string; name?: string; owner?: string; private?: boolean; defaultBranch?: string } }>('/git/create-repo', async (req, reply) => {
    const { path, name, owner, private: isPrivate = true, defaultBranch = 'main' } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });

    try {
      const isRepo = await isGitRepo(path);

      // Initialize git if not already a repo
      if (!isRepo) {
        await git(path, ['init', '-b', defaultBranch]);
      } else {
        // Ensure we're on the right branch
        const currentBranch = (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
        if (currentBranch !== defaultBranch) {
          await git(path, ['branch', '-m', currentBranch, defaultBranch]);
        }
      }

      // Make initial commit if repo is empty
      try {
        await git(path, ['rev-parse', 'HEAD']);
      } catch {
        // No commits yet — create initial commit
        await git(path, ['add', '-A']);
        await git(path, ['commit', '-m', 'Initial commit', '--allow-empty']);
      }

      // Create GitHub repo via gh CLI
      const repoName = name || path.split('/').pop() || 'my-repo';
      const fullName = owner ? `${owner}/${repoName}` : repoName;
      const visibility = isPrivate ? '--private' : '--public';

      const { stdout } = await execFileAsync('gh', [
        'repo', 'create', fullName,
        visibility,
        '--source', path,
        '--remote', 'origin',
        '--push',
      ], { cwd: path, maxBuffer: 5 * 1024 * 1024 });

      return { ok: true, output: stdout.trim() };
    } catch (err: any) {
      const msg = err.stderr?.trim() || err.message;
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /git/pull — pull from remote
  app.post<{ Body: { path: string } }>('/git/pull', async (req, reply) => {
    const { path } = req.body || {};
    if (!path) return reply.status(400).send({ error: 'path is required' });
    if (!(await isGitRepo(path))) return reply.status(400).send({ error: 'Not a git repository' });

    try {
      const { stdout, stderr } = await execFileAsync('git', ['pull'], { cwd: path, maxBuffer: 5 * 1024 * 1024 });
      return { ok: true, output: (stdout || stderr || '').trim() };
    } catch (err: any) {
      const msg = err.stderr?.trim() || err.message;
      return reply.status(500).send({ error: msg });
    }
  });
};
