// Writes build-info.json beside the app: the commit and branch it is built
// from, and the git repository that holds them. When the reaper works on
// himself he starts from exactly this code. Run before electron-builder (the
// dist scripts do).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => {
  try { return execFileSync('git', args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};

const commit = git('rev-parse', 'HEAD');
// A worktree's own folder may be temporary; the repository it belongs to is not.
const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
const info = {
  commit,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  repo: common ? path.dirname(common) : null,
  // Uncommitted changes are not in the commit, so a self-work branch won't have them.
  dirty: !!git('status', '--porcelain', '--', '.'),
  builtAt: new Date().toISOString()
};
fs.writeFileSync(path.join(here, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log('build-info.json:', info.branch, (info.commit || '').slice(0, 7), info.dirty ? '(with uncommitted changes)' : '', info.repo);
