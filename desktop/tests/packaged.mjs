// Every file the main process loads must be in the packaged app. Tests run
// from source, where every file is there, so a file left out of build.files
// only breaks the installed app: it starts with no window at all.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
const listed = new Set(pkg.build.files.filter((f) => !f.includes('*')));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!ok) failures++;
};

// Follow relative imports from the main process's entry point.
const seen = new Set();
const queue = [pkg.main, 'preload.cjs'];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const src = readFileSync(path.join(dir, file), 'utf8');
  for (const m of src.matchAll(/(?:from\s+|import\(\s*|require\(\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
    const next = path.normalize(path.join(path.dirname(file), m[1]));
    if (!next.startsWith('renderer') && existsSync(path.join(dir, next))) queue.push(next);
  }
}
for (const file of [...seen].sort()) check(file + ' is packaged', listed.has(file));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll packaging checks passed');
process.exit(failures ? 1 : 0);
