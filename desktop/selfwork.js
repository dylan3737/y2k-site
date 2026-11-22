// The reaper working on himself. He hands the request to a coding agent in a
// Terminal window the user watches:
//
//   local  : OpenCode, on Qwen3-Coder run by his own engine (llama-server).
//            Free, on this computer; fine for small and medium changes.
//   claude : Claude Code, for big jobs: Haiku 5.5 by default, or Sonnet or
//            Opus (the tray's Mind > Big jobs, or named in the request).
//
// The work happens in a fresh git worktree on its own branch, started from
// the commit the running app was built from, so the user's own checkout is
// never touched. When the agent is done the script runs the checks, offers to
// hand failures back to the agent, commits, and asks before rebuilding and
// reinstalling him. Nothing is pushed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// The local coding model: Qwen3-Coder 30B (3 billion active at a time, so it
// is quick), at a size that leaves room in 24 GB for its working memory.
export const CODER = {
  name: 'Qwen3-Coder 30B',
  file: 'Qwen3-Coder-30B-A3B-Instruct-UD-Q3_K_XL.gguf',
  bytes: 13806312608,
  url: 'https://huggingface.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF/resolve/main/Qwen3-Coder-30B-A3B-Instruct-UD-Q3_K_XL.gguf',
  context: 32768,
  // Tried on a 24 GB M4 Pro: with every layer on the graphics card its working
  // memory ran out on the first long prompt. Keeping the experts of 12 of its
  // 48 layers on the processor fits, at about 250 tokens a second reading and
  // 25 writing. Smaller batches keep the working buffers small too.
  flags: '-ngl 99 --n-cpu-moe 12 -b 1024 -ub 512 -fa on --cache-type-k q8_0 --cache-type-v q8_0'
};
export const ENGINES = ['local', 'claude'];
// The Claude Code models a big job can use, by Claude Code's own names for them.
export const CLAUDE_MODELS = { haiku: 'Claude Haiku 5.5', sonnet: 'Claude Sonnet 5.5', opus: 'Claude Opus 5.5' };
export const pickClaudeModel = (m) => (Object.hasOwn(CLAUDE_MODELS, m) ? m : 'haiku');

// What the agent is told, around the user's request.
export function brief(request) {
  return [
    'You are improving the Reaper, a desktop companion app: a pixel-art grim reaper who lives on the screen.',
    'The app is in desktop/ (Electron). desktop/README.md explains every part; read the parts you need first.',
    'Where things are: desktop/main.js (the main process), desktop/renderer/ (the page: app.js, abilities.js, crypt.js, speak.js, style.css),',
    'desktop/crypt.js (the rules of the Crypt idle game), desktop/oracle.js (Speak, his chat), desktop/assets/ (sprites).',
    '',
    'The user asked for this:',
    request,
    '',
    'Make the change with small, careful edits in the style of the code around them. Keep desktop/README.md accurate.',
    'Do not touch .github/ or anything outside this folder. Do not push.',
    'When you are done, run the checks and fix what fails: npm run lint && node tests/desktop.mjs && (cd desktop && npm run test:quick)'
  ].join('\n');
}

// A branch name from the request: "Make the ghosts slower!" -> make-the-ghosts-slower.
export function slug(request) {
  return String(request).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '') || 'work';
}

const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

// The script the Terminal runs. Every value from outside is single-quoted,
// and the request itself is read from a file, never spliced into the script.
export function script(o) {
  const { engine, repo, base, branch, work, promptFile, server, model, configFile, appPath, port } = o;
  const claudeModel = pickClaudeModel(o.claudeModel);
  const local = engine === 'local';
  return `#!/bin/bash
# The reaper works on himself. Written by the app; safe to delete.
set -u
REPO=${q(repo)}
BASE=${q(base)}
BRANCH=${q(branch)}
WORK=${q(work)}
PROMPT_FILE=${q(promptFile)}
APP=${q(appPath)}
LOGS="$WORK.logs"
say() { printf '\\n\\033[35m☠ %s\\033[0m\\n' "$*"; }
ask() { local a; read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
fail() { say "$*"; echo; read -r -p "Press Return to close." _; exit 1; }

say "The reaper works on himself:"
cat "$PROMPT_FILE" | sed -n '/^The user asked for this:$/,/^$/p' | sed '1d;$d'
say "On branch $BRANCH, in $WORK. Your own checkout is left alone."

cd "$REPO" || fail "His source folder is gone: $REPO"
git cat-file -e "$BASE^{commit}" 2>/dev/null || fail "The commit he was built from ($BASE) is not in $REPO."
mkdir -p "$(dirname "$WORK")"
git worktree add -q -b "$BRANCH" "$WORK" "$BASE" || fail "Could not make a fresh copy of his code."
cd "$WORK" || exit 1
mkdir -p "$LOGS"

say "Fetching what he is built with (npm)…"
npm ci --silent --no-audit --no-fund && (cd desktop && npm ci --silent --no-audit --no-fund) || fail "npm could not install his parts."
${local ? `
command -v opencode >/dev/null || {
  say "OpenCode, the coding agent for his own engine, is not installed."
  ask "Install it now with npm (npm install -g --allow-scripts=opencode-ai opencode-ai)?" && npm install -g --allow-scripts=opencode-ai opencode-ai || fail "Without OpenCode, try again with Claude."
}
MODEL=${q(model)}
if [ ! -f "$MODEL" ]; then
  say "His coding mind, ${CODER.name}, is not here yet: a one-time download of 13.8 GB."
  ask "Download it now?" || fail "Not downloaded."
  curl -L --fail -C - --progress-bar -o "$MODEL.part" ${q(CODER.url)} || fail "The download stopped. Run this again to carry on from there."
  [ "$(stat -f%z "$MODEL.part")" = ${q(String(CODER.bytes))} ] && mv "$MODEL.part" "$MODEL" || fail "The download is not whole. Run this again to carry on."
fi
say "Waking his coding mind (this takes a minute)…"
SERVER=${q(server)}
DYLD_LIBRARY_PATH="$(dirname "$SERVER")" "$SERVER" -m "$MODEL" --host 127.0.0.1 --port ${q(String(port))} --jinja \\
  -c ${CODER.context} -np 1 ${CODER.flags} --no-webui > "$LOGS/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
for i in $(seq 1 300); do
  curl -sf http://127.0.0.1:${port}/health >/dev/null && break
  kill -0 $SERVER_PID 2>/dev/null || fail "His coding mind would not wake. The log is in $LOGS/server.log"
  sleep 1
done
export OPENCODE_CONFIG=${q(configFile)}
agent() { opencode "$WORK" -m reaper/qwen3-coder --prompt "$1"; }
` : `
command -v claude >/dev/null || fail "Claude Code is not installed: see https://claude.com/claude-code"
# The model chosen in the tray (Mind > Big jobs), or for this job. /model in Claude Code changes it mid-job.
agent() { claude --model ${claudeModel} "$1"; }
`}
say "Handing over to ${local ? 'OpenCode on ' + CODER.name : 'Claude Code on ' + CLAUDE_MODELS[claudeModel]}. Quit it when the work is done."
agent "$(cat "$PROMPT_FILE")"

git add -A
if git diff --cached --quiet; then
  say "Nothing changed."
  cd "$REPO" && git worktree remove --force "$WORK" && git branch -q -D "$BRANCH"
  read -r -p "Press Return to close." _; exit 0
fi

for round in 1 2 3; do
  say "Checking his work…"
  if (npm run lint --silent && node tests/desktop.mjs && cd desktop && npm run test:quick --silent) > "$LOGS/checks.log" 2>&1; then
    PASSED=1; break
  fi
  PASSED=0
  tail -n 25 "$LOGS/checks.log"
  [ $round = 3 ] && break
  ask "The checks fail. Hand them back to the agent to fix?" || break
  agent "The checks fail. Here is the end of their output; fix the cause, then run them again.
$(tail -n 40 "$LOGS/checks.log")"
  git add -A
done

git add -A
git -c user.name="$(git config user.name || echo Reaper)" -c user.email="$(git config user.email || echo reaper@localhost)" \\
  commit -q -m "Reaper works on himself: $(sed -n '/^The user asked for this:$/{n;p;}' "$PROMPT_FILE" | cut -c1-60)" || true
say "Committed on $BRANCH."

if [ "$PASSED" != 1 ]; then
  fail "The checks still fail, so he was not reinstalled. The work is kept on $BRANCH, in $WORK."
fi
say "The checks pass."
if ask "Rebuild and reinstall him now?"; then
  mkdir -p desktop/vendor/llama/darwin-arm64 && cp -R "$APP/Contents/Resources/llama/." desktop/vendor/llama/darwin-arm64/
  (cd desktop && node tools/build-info.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 >/dev/null) || fail "The build failed; he was not reinstalled."
  NEW="$(ls -d desktop/dist/mac-arm64/*.app | head -1)"
  osascript -e 'quit app "Reaper"' 2>/dev/null; sleep 2
  mv "$APP" "$HOME/.Trash/Reaper-before-$BRANCH-$(date +%s).app" && ditto "$NEW" "$APP" && open "$APP" || fail "Could not put the new one in place."
  say "Reinstalled. The one before is in the Trash, if you want him back as he was."
fi
say "To keep this for good, merge $BRANCH. To drop it: git worktree remove '$WORK' && git branch -D $BRANCH"
read -r -p "Press Return to close." _
`;
}

// OpenCode's settings: one provider, his own engine.
export function opencodeConfig(port) {
  return {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      reaper: {
        npm: '@ai-sdk/openai-compatible',
        name: "The reaper's engine",
        options: { baseURL: 'http://127.0.0.1:' + port + '/v1' },
        models: { 'qwen3-coder': { name: CODER.name, limit: { context: CODER.context, output: 8192 } } }
      }
    },
    model: 'reaper/qwen3-coder',
    autoupdate: false,
    share: 'disabled'
  };
}

// Where he was built from: the commit, and the repository that holds it.
export function readBuildInfo(file) {
  try {
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    return info && info.commit && info.repo ? info : null;
  } catch {
    return null;
  }
}

// Write the script and its files, and open it in Terminal.
export async function start({ request, engine = 'local', claudeModel = 'haiku', info, dataDir, server, appPath, port = 8791, open = openInTerminal, now = Date.now(), workRoot = path.join(os.homedir(), 'ReaperWork') }) {
  const text = String(request || '').trim().slice(0, 2000);
  if (!text) return { ok: false, error: 'request must say what to change' };
  if (!ENGINES.includes(engine)) return { ok: false, error: 'engine must be local or claude' };
  if (process.platform !== 'darwin' && open === openInTerminal) return { ok: false, error: 'Working on himself works on macOS for now.' };
  if (!info) return { ok: false, error: "I don't know where my source is: this copy of me was built without it. Build me from my repository (npm run dist:mac)." };
  if (!fs.existsSync(path.join(info.repo, '.git'))) return { ok: false, error: 'My source folder is not there any more: ' + info.repo };
  if (engine === 'local' && (!server || !fs.existsSync(server))) return { ok: false, error: 'My engine is missing from this install.' };

  const stamp = new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const branch = 'reaper/' + slug(text) + '-' + stamp;
  const dir = path.join(dataDir, 'self-work');
  fs.mkdirSync(dir, { recursive: true });
  const work = path.join(workRoot, branch.replace('/', '-'));
  const promptFile = path.join(dir, stamp + '.prompt.txt');
  const configFile = path.join(dir, 'opencode.json');
  const scriptFile = path.join(dir, stamp + '.command');
  fs.writeFileSync(promptFile, brief(text) + '\n');
  fs.writeFileSync(configFile, JSON.stringify(opencodeConfig(port), null, 2));
  fs.writeFileSync(scriptFile, script({
    engine, claudeModel, repo: info.repo, base: info.commit, branch, work, promptFile, configFile, appPath, port,
    server, model: path.join(dataDir, 'models', CODER.file)
  }), { mode: 0o755 });
  const opened = await open(scriptFile);
  return opened.ok
    ? { ok: true, result: { opened: 'Terminal', engine: engine === 'local' ? 'OpenCode on ' + CODER.name : 'Claude Code on ' + CLAUDE_MODELS[pickClaudeModel(claudeModel)], branch, folder: work } }
    : opened;
}

function openInTerminal(file) {
  return new Promise((resolve) => {
    execFile('open', ['-a', 'Terminal', file], (err) => resolve(err ? { ok: false, error: 'Terminal would not open: ' + err.message } : { ok: true }));
  });
}
