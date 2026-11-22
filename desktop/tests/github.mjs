// GitHub (github.js) against stand-ins for gh and git: the commands it would
// run, what it refuses, and the questions the page asks with. Nothing touches
// GitHub.
import os from 'node:os';
import { createGithub } from '../github.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const calls = [];
const replies = {
  'repo list': [
    { nameWithOwner: 'me/y2k-site', name: 'y2k-site', visibility: 'PUBLIC', updatedAt: '2026-11-22' },
    { nameWithOwner: 'me/portfolio', name: 'portfolio', description: 'My site', visibility: 'PUBLIC', updatedAt: '2026-11-20' },
    { nameWithOwner: 'me/secret-notes', name: 'secret-notes', visibility: 'PRIVATE', updatedAt: '2026-11-21' }
  ],
  'repo view': { nameWithOwner: 'me/y2k-site', url: 'https://github.com/me/y2k-site', description: 'Site', defaultBranchRef: { name: 'main' } },
  'pr list': [{ number: 7, title: 'A bone hound', headRefName: 'reaper/bone-hound', author: { login: 'me' }, isDraft: false }],
  'issue list': [{ number: 3, title: 'Ghosts too fast', author: { login: 'me' }, labels: [{ name: 'bug' }] }],
  'run list': [{ databaseId: 99, displayTitle: 'Checks', headBranch: 'main', status: 'completed', conclusion: 'failure' }],
  'issue view': { number: 3, title: 'Ghosts too fast', state: 'OPEN', author: { login: 'me' }, body: 'x'.repeat(5000), url: 'u', labels: [], comments: Array.from({ length: 9 }, (_, i) => ({ author: { login: 'a' }, body: 'c' + i })) },
  'run view': { databaseId: 99, displayTitle: 'Checks', status: 'completed', conclusion: 'failure', headBranch: 'main', url: 'u', jobs: [{ name: 'desktop', conclusion: 'failure' }] }
};
const fake = (state = {}) => async (cmd, args, opts) => {
  calls.push({ cmd, args, cwd: opts && opts.cwd });
  if (state.fail) return { ok: false, error: state.fail };
  if (cmd.endsWith('git')) {
    if (args[0] === 'rev-parse') return state.noBranch ? { ok: false, error: '' } : { ok: true, out: 'abc\n' };
    if (args[0] === 'for-each-ref') return { ok: true, out: 'reaper/bone-hound|2 hours ago|Reaper works on himself: add a bone hound\n' };
    return { ok: true, out: '' };
  }
  if (args.includes('--jq')) return { ok: true, out: 'me/y2k-site\n' };
  if (args.includes('--log-failed')) return { ok: true, out: 'desktop\tstep\tFAIL  the ghosts are too fast\n' };
  const key = args.slice(0, 2).join(' ');
  if (key in replies) return { ok: true, out: JSON.stringify(replies[key]) };
  return { ok: true, out: 'https://github.com/me/y2k-site/whatever\n' };
};
const repoDir = os.tmpdir();
let g = createGithub({ repoDir, run: fake() });
const last = () => calls[calls.length - 1];

let out = await g.read({ what: 'overview' });
check('overview: the repo, its PRs, issues and runs', out.ok && out.result.repo === 'me/y2k-site' && out.result.openPullRequests[0].number === 7 && out.result.latestRuns[0].conclusion === 'failure', JSON.stringify(out).slice(0, 200));
check('in his own repository, by default', calls.every((c) => c.cwd === repoDir) && !calls.some((c) => c.args.includes('-R')));
out = await g.read({ what: 'prs', repo: 'octo/cat' });
check('or one named', out.ok && last().args.includes('-R') && last().args.includes('octo/cat'));
out = await g.read({ what: 'issue', number: 3 });
check('an issue, its body kept short, its latest comments', out.ok && out.result.body.length <= 2001 && out.result.comments.length === 6 && out.result.comments[5].body === 'c8');
out = await g.read({ what: 'run', number: 99 });
check('a failed run, with the end of its log', out.ok && out.result.result === 'failure' && out.result.failedLogTail.includes('the ghosts are too fast'));
out = await g.read({ what: 'my_branches' });
check('his own branches', out.ok && out.result.branches[0].branch === 'reaper/bone-hound');
for (const [bad, input] of [['an issue with no number', { what: 'issue' }], ['something unknown', { what: 'secrets' }]]) {
  const n = calls.length;
  out = await g.read(input);
  check('refused: ' + bad, !out.ok && calls.length === n, out.error);
}
out = await g.read({ what: 'prs', repo: 'x; rm -rf ~' });
check('a repository name that is not one never reaches gh', !calls.some((c) => c.args.some((a) => a.includes('rm -rf'))));

// Asking, in so many words.
check('the questions name what will happen', await g.describe({ action: 'merge_pr', number: 7 }) === 'Merge pull request #7?' &&
  await g.describe({ action: 'open_pr', branch: 'reaper/bone-hound' }) === 'Push reaper/bone-hound and open a pull request?' &&
  await g.describe({ action: 'create_issue', title: 'Lantern flicker', repo: 'octo/cat' }) === 'Open an issue on octo/cat: “Lantern flicker”?');
check('and there is no question for what cannot be done', await g.describe({ action: 'delete_repo' }) === null && await g.describe({ action: 'merge_pr' }) === null);

out = await g.act({ action: 'merge_pr', number: 7 });
check('merge: a plain merge, the branch left alone', out.ok && last().args.join(' ') === 'pr merge 7 --merge');
out = await g.act({ action: 'create_issue', title: 'Lantern flicker', body: 'It flickers.' });
check('an issue, its words passed as they are', out.ok && last().args.join(' ') === 'issue create --title Lantern flicker --body It flickers.');
out = await g.act({ action: 'comment', number: 3, body: '$(whoami) `id`' });
check('words never reach a shell', out.ok && last().args[last().args.length - 1] === '$(whoami) `id`');
out = await g.act({ action: 'rerun_ci', number: 99 });
check('re-run only the failed jobs', out.ok && last().args.join(' ') === 'run rerun 99 --failed');
calls.length = 0;
out = await g.act({ action: 'open_pr', branch: 'reaper/bone-hound' });
const pushes = calls.filter((c) => c.args[0] === 'push');
check('open a PR: push the branch (never forced), then the pull request', out.ok && pushes.length === 1 &&
  pushes[0].args.join(' ') === 'push --set-upstream origin reaper/bone-hound' && !calls.some((c) => c.args.some((a) => /force|^-f$/.test(a))) &&
  last().args.slice(0, 4).join(' ') === 'pr create --head reaper/bone-hound', JSON.stringify(calls.map((c) => c.args.join(' '))));
g = createGithub({ repoDir, run: fake({ noBranch: true }) });
out = await g.act({ action: 'open_pr', branch: 'reaper/nothing' });
check('only a branch that exists', !out.ok && /no branch/.test(out.error));
for (const branch of ['--force', 'a..b', 'x y', '']) {
  out = await g.act({ action: 'open_pr', branch });
  check('refused branch "' + branch + '"', !out.ok);
}
out = await g.act({ action: 'open_pr', branch: 'main', repo: 'octo/cat' });
check('PRs only from his own repository', !out.ok);
out = await g.act({ action: 'delete_repo' });
check('nothing destructive exists', !out.ok);

g = createGithub({ repoDir, run: fake() });
calls.length = 0;
out = await g.read({ what: 'runs', repo: 'user/repo' });
check('a placeholder repository means his own', out.ok && !last().args.includes('-R'));
for (const mine of ['your-repo', 'my repo', 'owner/name']) {
  out = await g.read({ what: 'runs', repo: mine });
  check('"' + mine + '" means his own, and the answer says which', out.ok && !calls.some((c) => c.args.includes(mine)) && out.result.repo, JSON.stringify(out.result).slice(0, 80));
}
out = await g.read({ what: 'repos' });
check('every repository, public and private, newest first', out.ok && out.result.count === 3 && out.result.repositories[1].repo === 'me/secret-notes' &&
  out.result.repositories[1].private === true, JSON.stringify(out.result).slice(0, 160));
out = await g.read({ what: 'overview', repo: 'portfolio' });
check('an overview of another names it the way repo view takes it', out.ok && calls.some((c) => c.args.slice(0, 3).join(' ') === 'repo view me/portfolio') &&
  !calls.some((c) => c.args[0] === 'repo' && c.args[1] === 'view' && c.args.includes('-R')));
out = await g.read({ what: 'prs', repo: 'portfolio' });
check('one of theirs by its bare name', out.ok && last().args.includes('me/portfolio') && out.result.repo === 'me/portfolio', JSON.stringify(out).slice(0, 120));
out = await g.read({ what: 'issues', repo: 'Secret Notes' });
check('spaces and case do not matter', out.ok && last().args.includes('me/secret-notes'));
const n0 = calls.length;
out = await g.read({ what: 'prs', repo: 'nonexistent-thing' });
check('a name none of theirs has is said so, not swapped for his own', !out.ok && /None of your repositories/.test(out.error) &&
  !calls.slice(n0).some((c) => c.args[0] === 'pr'), out.error);
check('and is never asked about', (await g.describe({ action: 'merge_pr', number: 1, repo: 'nonexistent-thing' })) === null &&
  (await g.describe({ action: 'merge_pr', number: 1, repo: 'portfolio' })) === 'Merge pull request #1 on me/portfolio?');
out = await g.read({ what: 'prs', repo: 'https://github.com/octo/cat/pull/3' });
check('a github.com link names its repository', out.ok && last().args.includes('octo/cat') && out.result.repo === 'octo/cat');
check('and the question says which repository', await g.describe({ action: 'merge_pr', number: 3, repo: 'github.com/octo/cat' }) === 'Merge pull request #3 on octo/cat?' &&
  await g.describe({ action: 'merge_pr', number: 3, repo: 'your-repo' }) === 'Merge pull request #3?');
g = createGithub({ repoDir, run: fake({ fail: 'GraphQL: Could not resolve to a Repository with the name \'octo/nope\'. (repository)' }) });
out = await g.read({ what: 'runs', repo: 'octo/nope' });
check('a repository that is not there is said so, not that gh is missing', !out.ok && /No such repository/.test(out.error) && !/not installed/.test(out.error), out.error);
g = createGithub({ repoDir, run: async () => ({ ok: false, missing: true, error: 'gh is missing' }) });
out = await g.read({ what: 'prs' });
check('gh missing is said so', !out.ok && /not installed/.test(out.error));
g = createGithub({ repoDir, run: fake({ fail: 'To get started with GitHub CLI, please run:  gh auth login' }) });
out = await g.read({ what: 'prs' });
check('not logged in, it says how to', !out.ok && /gh auth login/.test(out.error), out.error);
g = createGithub({ repoDir: null, run: fake() });
out = await g.read({ what: 'prs' });
check('with no repository known, it asks for one', !out.ok && /owner\/name/.test(out.error));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll GitHub checks passed');
process.exit(failures ? 1 : 0);
