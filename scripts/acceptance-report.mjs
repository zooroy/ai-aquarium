import { readFile, readdir, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseScenarios, validateMap, summarize, renderMarkdown } from './acceptance-report-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function directories(path) {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== 'archive').map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function specFiles(base) {
  const files = [];
  for (const capability of await directories(base)) {
    const path = join(base, capability, 'spec.md');
    try { files.push({ path, content: await readFile(path, 'utf8') }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return files;
}

// Usage: npm run report -- --audit-all <path> --audit-prod <path>
const args = process.argv.slice(2);
const auditPaths = { '--audit-all': 'acceptance/audit-all.json', '--audit-prod': 'acceptance/audit-prod.json' };
for (let i = 0; i < args.length; i += 2) {
  if (!Object.hasOwn(auditPaths, args[i]) || !args[i + 1]) throw new Error(`未知或不完整參數：${args[i]}`);
  auditPaths[args[i]] = args[i + 1];
}
const files = await specFiles(join(root, 'openspec/specs'));
for (const change of await directories(join(root, 'openspec/changes'))) {
  files.push(...await specFiles(join(root, 'openspec/changes', change, 'specs')));
}
const scenarios = parseScenarios(files);
let map;
let errors;
try {
  map = JSON.parse(await readFile(join(root, 'tests/e2e/scenario-map.json'), 'utf8'));
  errors = validateMap(map, scenarios);
} catch (error) { errors = [`無法讀取對照表：${error.message}`]; }
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const checks = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => name.startsWith('CHECK_'))
    .map(([name, value]) => [name.slice(6).toLowerCase(), value]));
  let sha = process.env.GITHUB_SHA;
  if (!sha) {
    try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { sha = '未知'; }
  }
  const summary = summarize({
    scenarios, map, checks, sha, time: new Date().toISOString(),
    results: await optionalJson(join(root, 'test-results/results.json')),
    auditAll: await optionalJson(auditPaths['--audit-all']),
    auditProd: await optionalJson(auditPaths['--audit-prod']),
  });
  const markdown = renderMarkdown(summary);
  await mkdir(join(root, 'acceptance'), { recursive: true });
  await writeFile(join(root, 'acceptance/report.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log('已產生 acceptance/report.md');
}
