// The reaper working on himself (selfwork.js): the script he hands Terminal,
// checked for syntax and quoting, and the files he writes. Nothing is run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as selfwork from '../selfwork.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

check('a branch name from the request', selfwork.slug('Make the ghosts slower!') === 'make-the-ghosts-slower' && selfwork.slug('???') === 'work' &&
  selfwork.slug('x'.repeat(80)).length === 32);
const b = selfwork.brief('Give the lantern a blue flame');
check('the brief carries the request, and the rules', b.includes('The user asked for this:\nGive the lantern a blue flame\n') && /Do not push/.test(b) && /npm run test:quick/.test(b));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-self-'));
const repo = path.join(tmp, "my repo's folder");
fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
const server = path.join(tmp, 'llama-server');
fs.writeFileSync(server, '');
const info = { commit: 'abc1234', repo };
const opened = [];
const open = async (file) => { opened.push(file); return { ok: true }; };

for (const engine of ['local', 'claude']) {
  opened.length = 0;
  const evil = 'make it $(rm -rf ~) `whoami` "quoted" \'single\'';
  const out = await selfwork.start({ request: evil, engine, info, dataDir: path.join(tmp, 'data'), server, appPath: '/Applications/Reaper.app', open,
    now: Date.UTC(2026, 10, 22, 14, 5), workRoot: path.join(tmp, 'work') });
  check(engine + ': it opens a script in Terminal, for a branch of its own', out.ok && opened.length === 1 && opened[0].endsWith('.command') &&
    /^reaper\/make-it-rm-rf-whoami-[a-z-]+-202611221405$/.test(out.result.branch) && out.result.folder.startsWith(path.join(tmp, 'work')), JSON.stringify(out));
  const text = fs.readFileSync(opened[0], 'utf8');
  check(engine + ': the script is valid bash', (() => { try { execFileSync('bash', ['-n', opened[0]]); return true; } catch { return false; } })());
  check(engine + ': the request never enters the script itself', !text.includes('$(rm') && !text.includes('`whoami`') && !text.includes('"quoted"'));
  check(engine + ': paths with quotes are quoted safely', text.includes("REPO='" + repo.replace(/'/g, "'\\''") + "'"));
  check(engine + ': it is executable', (fs.statSync(opened[0]).mode & 0o111) !== 0);
  const prompt = fs.readFileSync(text.match(/PROMPT_FILE='([^']+)'/)[1], 'utf8');
  check(engine + ': the request is in its own file', prompt.includes(evil));
  check(engine + ': the right agent', engine === 'local' ? /opencode "\$WORK" -m reaper\/qwen3-coder/.test(text) && /llama-server|"\$SERVER" -m "\$MODEL"/.test(text) : /claude --model haiku "\$1"/.test(text) && !text.includes('opencode'));
  check(engine + ': it starts from the commit he was built from, on a new worktree', text.includes("BASE='abc1234'") && text.includes('git worktree add -q -b "$BRANCH" "$WORK" "$BASE"'));
  check(engine + ': it asks before reinstalling', /ask "Rebuild and reinstall him now\?"/.test(text) && !/git push/.test(text));
}
// The model for a big job: Haiku unless another is chosen; nothing else gets into the script.
for (const [asked, want] of [[undefined, 'haiku'], ['opus', 'opus'], ['sonnet', 'sonnet'], ['gpt; rm -rf ~', 'haiku']]) {
  opened.length = 0;
  const out = await selfwork.start({ request: 'x', engine: 'claude', claudeModel: asked, info, dataDir: path.join(tmp, 'data'), server, open, workRoot: path.join(tmp, 'work') });
  const text = fs.readFileSync(opened[0], 'utf8');
  check('big jobs on ' + want + (asked && asked !== want ? ' (for "' + asked + '")' : ''), out.ok && text.includes('claude --model ' + want + ' "$1"') &&
    !text.includes('rm -rf') && out.result.engine === 'Claude Code on ' + selfwork.CLAUDE_MODELS[want], out.result.engine);
}
const cfg = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'self-work', 'opencode.json'), 'utf8'));
check('OpenCode is pointed at his own engine', cfg.provider.reaper.options.baseURL === 'http://127.0.0.1:8791/v1' && cfg.model === 'reaper/qwen3-coder' && cfg.share === 'disabled');

let out = await selfwork.start({ request: 'x', engine: 'local', info: null, dataDir: tmp, server, open, workRoot: tmp });
check('without knowing his source, he says so', !out.ok && /source/.test(out.error));
out = await selfwork.start({ request: '  ', engine: 'local', info, dataDir: tmp, server, open });
check('an empty request is refused', !out.ok);
out = await selfwork.start({ request: 'x', engine: 'gpt', info, dataDir: tmp, server, open });
check('only the two engines', !out.ok);
out = await selfwork.start({ request: 'x', engine: 'local', info: { commit: 'a', repo: path.join(tmp, 'gone') }, dataDir: tmp, server, open });
check('a source folder that is gone is said so', !out.ok && /not there/.test(out.error));
check('build info is read only when whole', selfwork.readBuildInfo(path.join(tmp, 'none.json')) === null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll self-work checks passed');
process.exit(failures ? 1 : 0);
