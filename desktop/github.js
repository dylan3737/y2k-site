// GitHub, through the user's own `gh` command-line tool and its login: no
// key of the reaper's own. Reading is free; anything that changes GitHub is
// asked in the page first (see renderer/abilities.js). Nothing here deletes,
// force-pushes or changes settings.
//
// The repository is his own (the one the app was built from) unless another
// is named as owner/name. Text that comes back from GitHub (issue bodies,
// comments) is information for the model, never instructions.
import fs from 'node:fs';
import { execFile } from 'node:child_process';

// Apps opened from the Finder get a short PATH, so look where gh and git live.
const GH_PLACES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
const GIT_PLACES = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];
const found = (places, name) => places.find((p) => fs.existsSync(p)) || name;

export const READS = ['repos', 'overview', 'issues', 'prs', 'issue', 'pr', 'runs', 'run', 'notifications', 'my_branches'];
export const ACTS = ['create_issue', 'comment', 'close_issue', 'reopen_issue', 'open_pr', 'merge_pr', 'rerun_ci'];
const BODY = 2000;      // characters of a body or comment kept for the model
const COMMENTS = 6;     // the latest comments kept

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;
const clip = (s, n = BODY) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

function exec(cmd, args, { cwd, ms = 30000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 8_000_000, env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' } },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true, out: String(stdout) });
        // The program itself is missing: said apart from anything it reports.
        if (err.code === 'ENOENT') return resolve({ ok: false, missing: true, error: cmd + ' is missing' });
        resolve({ ok: false, error: String(stderr || err.message).trim().split('\n').slice(-3).join(' ') });
      });
  });
}

// What went wrong, as the user can act on it.
function trouble(out) {
  const error = typeof out === 'string' ? out : out.error;
  if (out.missing) return 'The GitHub tool (gh) is not installed. Install it from cli.github.com, then run: gh auth login';
  if (/gh auth login|not logged in|authentication required/i.test(error)) return 'gh is not logged in to GitHub. In a terminal, run: gh auth login';
  if (/could not resolve to a repository|not found \(http 404\)|repository not found/i.test(error)) return 'No such repository on GitHub, or this login cannot see it. Leave the repository out to use my own.';
  return error.slice(0, 300);
}

// owner/name from what was given ("octo/cat", a github.com link), or null:
// anything else (a placeholder, "your-repo") means his own repository.
export function named(raw) {
  const s = String(raw || '').trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/\.git$/i, '');
  const two = s.split('/').filter(Boolean).slice(0, 2).join('/');
  return REPO.test(two) && !PLACEHOLDER.test(two) ? two : null;
}

// Bare words that mean his own repository, not one called that.
const MEANS_OWN = /^(your|my|the|this|our|his)?[ _-]?(repo|repository|project|app|code|source)$|^(user|owner|you|me)$/i;
// What small models put in when they mean "the user's own".
const PLACEHOLDER = /^(user|owner|username|your-?username|me|my|example|you)\/(repo|name|repository|my-?repo|project)$/i;

// `run` and `git` are for the tests.
export function createGithub({ repoDir = null, run = exec } = {}) {
  const gh = found(GH_PLACES, 'gh');
  const git = found(GIT_PLACES, 'git');

  // Which repository: one named as owner/name or a github.com link; one of the
  // user's own by its bare name ("portfolio"); or, for a placeholder or
  // nothing, his own. A name that matches none of theirs is said so, never
  // quietly swapped for his own.
  async function where(input) {
    const raw = String(input.repo || '').trim();
    let other = named(raw);
    if (!other && raw && !raw.includes('/') && !MEANS_OWN.test(raw)) {
      other = await byName(raw);
      if (!other) return { error: 'None of your repositories is called "' + raw.slice(0, 60) + '". Ask me to list your repositories.' };
    }
    if (other) return { args: ['-R', other], cwd: repoDir || undefined, name: other };
    if (!repoDir || !fs.existsSync(repoDir)) return { error: "I don't know which repository: name one as owner/name." };
    return { args: [], cwd: repoDir, name: null };
  }
  // The user's repositories (and their organisations'), kept for a few minutes.
  let mine = null;
  async function theirs() {
    if (mine && Date.now() - mine.at < 5 * 60000) return mine.list;
    const out = await ghJson(['repo', 'list', '--limit', '200', '--json', 'nameWithOwner,name,description,visibility,updatedAt,isFork']);
    if (!out.ok || !Array.isArray(out.data)) return [];
    mine = { at: Date.now(), list: out.data };
    return mine.list;
  }
  async function byName(name) {
    const flat = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = flat(name);
    const list = await theirs();
    const hit = list.find((r) => flat(r.name) === want) || (want.length > 3 ? list.filter((r) => flat(r.name).includes(want)) : []).find((_, k, all) => all.length === 1);
    return hit ? hit.nameWithOwner : null;
  }
  // His own repository's name, asked once, so every answer can say which it was.
  let own = null;
  async function ownName() {
    if (own) return own;
    const out = await run(gh, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: repoDir });
    if (out.ok && REPO.test(out.out.trim())) own = out.out.trim();
    return own;
  }
  const number = (n) => (Number.isInteger(n) && n > 0 && n < 1e7 ? String(n) : null);

  async function ghJson(args, cwd) {
    const out = await run(gh, args, { cwd });
    if (!out.ok) return { ok: false, error: trouble(out) };
    try { return { ok: true, data: JSON.parse(out.out || 'null') }; } catch { return { ok: true, data: out.out.trim() }; }
  }

  async function read(input = {}) {
    const out = await reading(input);
    // Say which repository the answer is about.
    if (out.ok && !['notifications', 'repos'].includes(input.what) && out.result && !out.result.repo) {
      const at = await where(input);
      const name = at.name || (repoDir ? await ownName() : null);
      if (name) out.result = { repo: name, ...out.result };
    }
    return out;
  }

  async function reading(input = {}) {
    const what = input.what;
    if (!READS.includes(what)) return { ok: false, error: 'what must be one of ' + READS.join(', ') };
    if (what === 'repos') {
      const list = await theirs();
      if (!list.length) return { ok: false, error: 'GitHub listed no repositories for this login.' };
      return { ok: true, result: { count: list.length, repositories: [...list].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 40)
        .map((r) => ({ repo: r.nameWithOwner, private: r.visibility === 'PRIVATE', fork: r.isFork || undefined, about: clip(r.description, 120) || undefined })) } };
    }
    if (what === 'notifications') {
      const out = await ghJson(['api', 'notifications?per_page=15']);
      if (!out.ok) return out;
      return { ok: true, result: { notifications: (out.data || []).map((n) => ({ repo: n.repository && n.repository.full_name, title: n.subject && n.subject.title, type: n.subject && n.subject.type, reason: n.reason, updated: n.updated_at })) } };
    }
    const at = await where(input);
    if (at.error) return { ok: false, error: at.error };
    const { args: R, cwd } = at;
    switch (what) {
      case 'overview': {
        // repo view names its repository as an argument, not with -R.
        const repo = await ghJson(['repo', 'view', ...(at.name ? [at.name] : []), '--json', 'nameWithOwner,description,url,defaultBranchRef'], cwd);
        if (!repo.ok) return repo;
        const [prs, issues, runs] = await Promise.all([
          ghJson(['pr', 'list', ...R, '--limit', '5', '--json', 'number,title,headRefName,isDraft'], cwd),
          ghJson(['issue', 'list', ...R, '--limit', '5', '--json', 'number,title'], cwd),
          ghJson(['run', 'list', ...R, '--limit', '3', '--json', 'databaseId,displayTitle,headBranch,status,conclusion'], cwd)
        ]);
        return { ok: true, result: { repo: repo.data.nameWithOwner, url: repo.data.url, description: repo.data.description, defaultBranch: repo.data.defaultBranchRef && repo.data.defaultBranchRef.name,
          openPullRequests: prs.ok ? prs.data : prs.error, openIssues: issues.ok ? issues.data : issues.error, latestRuns: runs.ok ? runs.data : runs.error } };
      }
      case 'issues': {
        const state = ['open', 'closed', 'all'].includes(input.state) ? input.state : 'open';
        const out = await ghJson(['issue', 'list', ...R, '--state', state, '--limit', '20', '--json', 'number,title,author,labels,updatedAt'], cwd);
        return out.ok ? { ok: true, result: { issues: out.data.map((i) => ({ number: i.number, title: i.title, by: i.author && i.author.login, labels: (i.labels || []).map((l) => l.name), updated: i.updatedAt })) } } : out;
      }
      case 'prs': {
        const state = ['open', 'closed', 'merged', 'all'].includes(input.state) ? input.state : 'open';
        const out = await ghJson(['pr', 'list', ...R, '--state', state, '--limit', '20', '--json', 'number,title,headRefName,author,isDraft,updatedAt'], cwd);
        return out.ok ? { ok: true, result: { pullRequests: out.data.map((p) => ({ number: p.number, title: p.title, branch: p.headRefName, by: p.author && p.author.login, draft: p.isDraft, updated: p.updatedAt })) } } : out;
      }
      case 'issue': {
        const n = number(input.number);
        if (!n) return { ok: false, error: 'number must be the issue number' };
        const out = await ghJson(['issue', 'view', n, ...R, '--json', 'number,title,state,author,body,comments,url,labels'], cwd);
        if (!out.ok) return out;
        const i = out.data;
        return { ok: true, result: { number: i.number, title: i.title, state: i.state, by: i.author && i.author.login, url: i.url, labels: (i.labels || []).map((l) => l.name), body: clip(i.body),
          comments: (i.comments || []).slice(-COMMENTS).map((c) => ({ by: c.author && c.author.login, body: clip(c.body, 600) })) } };
      }
      case 'pr': {
        const n = number(input.number);
        if (!n) return { ok: false, error: 'number must be the pull request number' };
        const out = await ghJson(['pr', 'view', n, ...R, '--json', 'number,title,state,author,body,url,headRefName,baseRefName,mergeable,statusCheckRollup,comments,additions,deletions,changedFiles'], cwd);
        if (!out.ok) return out;
        const p = out.data;
        return { ok: true, result: { number: p.number, title: p.title, state: p.state, by: p.author && p.author.login, url: p.url, from: p.headRefName, into: p.baseRefName, mergeable: p.mergeable,
          changes: p.changedFiles + ' files, +' + p.additions + ' −' + p.deletions,
          checks: (p.statusCheckRollup || []).map((c) => ({ name: c.name || c.context, result: c.conclusion || c.state || c.status })),
          body: clip(p.body), comments: (p.comments || []).slice(-COMMENTS).map((c) => ({ by: c.author && c.author.login, body: clip(c.body, 600) })) } };
      }
      case 'runs': {
        const out = await ghJson(['run', 'list', ...R, '--limit', '10', '--json', 'databaseId,displayTitle,workflowName,headBranch,status,conclusion,createdAt'], cwd);
        return out.ok ? { ok: true, result: { runs: out.data.map((r) => ({ id: r.databaseId, title: r.displayTitle, workflow: r.workflowName, branch: r.headBranch, status: r.status, result: r.conclusion, started: r.createdAt })) } } : out;
      }
      case 'run': {
        const n = number(input.number);
        if (!n) return { ok: false, error: 'number must be the run id' };
        const out = await ghJson(['run', 'view', n, ...R, '--json', 'databaseId,displayTitle,status,conclusion,headBranch,url,jobs'], cwd);
        if (!out.ok) return out;
        const r = out.data;
        const failed = (r.jobs || []).filter((j) => j.conclusion === 'failure');
        let log = '';
        if (failed.length) {
          const l = await run(gh, ['run', 'view', n, ...R, '--log-failed'], { cwd });
          if (l.ok) log = l.out.split('\n').slice(-40).map((line) => line.replace(/^[^\t]*\t[^\t]*\t/, '')).join('\n');
        }
        return { ok: true, result: { id: r.databaseId, title: r.displayTitle, branch: r.headBranch, status: r.status, result: r.conclusion, url: r.url,
          jobs: (r.jobs || []).map((j) => ({ name: j.name, result: j.conclusion || j.status })), ...(log ? { failedLogTail: clip(log, 3000) } : {}) } };
      }
      case 'my_branches': {
        // The branches he made working on himself, newest first.
        if (!repoDir) return { ok: false, error: "I don't know where my source is." };
        const out = await run(git, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)|%(committerdate:relative)|%(contents:subject)', 'refs/heads/reaper/'], { cwd: repoDir });
        if (!out.ok) return { ok: false, error: trouble(out) };
        return { ok: true, result: { branches: out.out.trim().split('\n').filter(Boolean).slice(0, 15).map((l) => { const [branch, when, subject] = l.split('|'); return { branch, when, subject }; }) } };
      }
    }
    return { ok: false, error: 'unknown' };
  }

  // A sentence for the page to ask with, before anything is changed; null if the input is wrong.
  async function describe(input = {}) {
    const at = await where(input);
    if (at.error) return null;
    const on = at.name ? ' on ' + at.name : '';
    switch (input.action) {
      case 'create_issue': return input.title ? 'Open an issue' + on + ': “' + String(input.title).slice(0, 80) + '”?' : null;
      case 'comment': return number(input.number) && input.body ? 'Comment on #' + input.number + on + ': “' + String(input.body).slice(0, 80) + '”?' : null;
      case 'close_issue': return number(input.number) ? 'Close issue #' + input.number + on + '?' : null;
      case 'reopen_issue': return number(input.number) ? 'Reopen issue #' + input.number + on + '?' : null;
      case 'open_pr': return input.branch ? 'Push ' + input.branch + ' and open a pull request' + on + (input.title ? ': “' + String(input.title).slice(0, 60) + '”' : '') + '?' : null;
      case 'merge_pr': return number(input.number) ? 'Merge pull request #' + input.number + on + '?' : null;
      case 'rerun_ci': return number(input.number) ? 'Re-run the failed jobs of run ' + input.number + on + '?' : null;
    }
    return null;
  }

  // Only after the user has said yes in the page.
  async function act(input = {}) {
    const action = input.action;
    if (!ACTS.includes(action)) return { ok: false, error: 'action must be one of ' + ACTS.join(', ') };
    const at = await where(input);
    if (at.error) return { ok: false, error: at.error };
    const { args: R, cwd } = at;
    const n = number(input.number);
    const text = (s, most) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, most) : null);
    const done = async (args, result) => {
      const out = await run(gh, args, { cwd });
      return out.ok ? { ok: true, result: { ...result, said: out.out.trim().split('\n').pop() } } : { ok: false, error: trouble(out) };
    };
    switch (action) {
      case 'create_issue': {
        const title = text(input.title, 200);
        if (!title) return { ok: false, error: 'title is needed' };
        return done(['issue', 'create', ...R, '--title', title, '--body', text(input.body, 10000) || ''], { created: title });
      }
      case 'comment': {
        const body = text(input.body, 10000);
        if (!n || !body) return { ok: false, error: 'number and body are needed' };
        // gh decides whether the number is an issue or a pull request.
        return done(['issue', 'comment', n, ...R, '--body', body], { commentedOn: Number(n) });
      }
      case 'close_issue':
        if (!n) return { ok: false, error: 'number is needed' };
        return done(['issue', 'close', n, ...R], { closed: Number(n) });
      case 'reopen_issue':
        if (!n) return { ok: false, error: 'number is needed' };
        return done(['issue', 'reopen', n, ...R], { reopened: Number(n) });
      case 'merge_pr':
        if (!n) return { ok: false, error: 'number is needed' };
        // A plain merge: history kept, the branch left in place.
        return done(['pr', 'merge', n, ...R, '--merge'], { merged: Number(n) });
      case 'rerun_ci':
        if (!n) return { ok: false, error: 'number (the run id) is needed' };
        return done(['run', 'rerun', n, ...R, '--failed'], { rerunning: Number(n) });
      case 'open_pr': {
        // A branch of his own repository: pushed (never forced), then a pull request.
        const branch = String(input.branch || '');
        if (!BRANCH.test(branch)) return { ok: false, error: 'branch is not a branch name' };
        if (input.repo || !repoDir) return { ok: false, error: 'Pull requests are opened from my own repository only.' };
        const exists = await run(git, ['rev-parse', '--verify', '--quiet', 'refs/heads/' + branch], { cwd: repoDir });
        if (!exists.ok) return { ok: false, error: 'There is no branch called ' + branch + '.' };
        const pushed = await run(git, ['push', '--set-upstream', 'origin', branch], { cwd: repoDir, ms: 120000 });
        if (!pushed.ok) return { ok: false, error: 'The push failed: ' + trouble(pushed) };
        const title = text(input.title, 200);
        return done(['pr', 'create', '--head', branch, ...(title ? ['--title', title, '--body', text(input.body, 10000) || 'Made by the reaper, working on himself.'] : ['--fill'])],
          { pushed: branch });
      }
    }
    return { ok: false, error: 'unknown' };
  }

  return { read, act, describe };
}
