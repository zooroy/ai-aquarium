const key = ({ capability, scenario }) => JSON.stringify([capability, scenario]);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** Parse main and active delta specs, deduplicating capability + scenario. */
export function parseScenarios(files) {
  const scenarios = new Map();
  for (const { path, content } of files) {
    const parts = path.replaceAll('\\', '/').split('/');
    if (parts.includes('archive') || parts.at(-1) !== 'spec.md') continue;
    const capability = parts.at(-2);
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith('#### Scenario: ')) continue;
      const scenario = line.slice('#### Scenario: '.length).trim();
      if (scenario) scenarios.set(key({ capability, scenario }), { capability, scenario });
    }
  }
  return [...scenarios.values()];
}

/** Return all mapping errors instead of stopping at the first invalid row. */
export function validateMap(map, scenarios) {
  if (!Array.isArray(map)) return ['對照表必須是陣列'];
  const capabilities = new Set(scenarios.map((item) => item.capability));
  const known = new Set(scenarios.map(key));
  const seen = new Set();
  const errors = [];
  map.forEach((row, index) => {
    const label = `第 ${index + 1} 筆 (${row?.capability ?? '?'} / ${row?.scenario ?? '?'})`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${label}：必須是物件`);
      return;
    }
    if (!isText(row.capability) || !capabilities.has(row.capability)) {
      errors.push(`${label}：找不到 capability`);
    } else if (!isText(row.scenario) || !known.has(key(row))) {
      errors.push(`${label}：找不到情境`);
    }
    const hasE2e = Object.hasOwn(row, 'e2e');
    const hasManual = Object.hasOwn(row, 'manual');
    if (hasE2e === hasManual || (hasE2e && !isText(row.e2e)) || (hasManual && !isText(row.manual))) {
      errors.push(`${label}：e2e／manual 必須剛好有一個非空字串`);
    }
    if (Object.hasOwn(row, 'note') && typeof row.note !== 'string') errors.push(`${label}：note 必須是字串`);
    if (seen.has(key(row))) errors.push(`${label}：重複對照`);
    seen.add(key(row));
  });
  return errors;
}

function testOutcomes(results) {
  const outcomes = new Map();
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      // Use actual final attempts: expected failures and skipped tests are not passes.
      const passed = spec.tests?.length > 0 && spec.tests.every((test) => test.results?.at(-1)?.status === 'passed');
      outcomes.set(spec.title, (outcomes.get(spec.title) ?? true) && passed);
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(results);
  return outcomes;
}

function summarizeAudit(audit) {
  if (!audit) return { status: '未執行', counts: {}, highPackages: [] };
  if (audit.error || !audit.metadata?.vulnerabilities) {
    return { status: '資料錯誤', counts: {}, highPackages: [] };
  }
  const counts = Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical'].map(
    (severity) => [severity, audit.metadata.vulnerabilities[severity] ?? 0],
  ));
  const highPackages = Object.entries(audit.vulnerabilities ?? {})
    .filter(([, entry]) => ['high', 'critical'].includes(entry.severity))
    .map(([name]) => name).sort();
  return { status: '已執行', counts, highPackages };
}

/** Pure aggregation; all timestamps, check results and input data come from caller. */
export function summarize({ scenarios, map, results, checks = {}, auditAll, auditProd, sha = '未知', time = '未知' }) {
  const outcomes = results ? testOutcomes(results) : new Map();
  const rows = map.map((row) => ({
    ...row,
    status: row.manual ? '手動驗收' : !results ? '未執行' : outcomes.get(row.e2e) ? '通過' : '失敗',
  }));
  const coverage = [...new Set(scenarios.map((row) => row.capability))].sort().map((capability) => {
    const total = scenarios.filter((row) => row.capability === capability).length;
    const mapped = rows.filter((row) => row.capability === capability);
    const e2e = mapped.filter((row) => row.e2e).length;
    const manual = mapped.filter((row) => row.manual).length;
    return { capability, total, e2e, manual, unmapped: total - e2e - manual };
  });
  const checkNames = [...new Set(['typecheck', 'lint', 'test', 'build', 'audit', 'e2e', ...Object.keys(checks)])];
  return {
    sha, time, rows, coverage,
    checks: Object.fromEntries(checkNames.map((name) => [name, checks[name] ?? '未執行'])),
    audits: { all: summarizeAudit(auditAll), prod: summarizeAudit(auditProd) },
  };
}

const cell = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/\r?\n/g, '<br>');
const table = (headings, rows) => [headings, headings.map(() => '---'), ...rows]
  .map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n');

export function renderMarkdown(summary) {
  const sections = [
    `# 驗收報告\n\nCommit SHA：${cell(summary.sha)}\n\n時間：${cell(summary.time)}`,
    `## 檢查結果\n\n${table(['檢查', '結果'], Object.entries(summary.checks))}`,
    `## 情境結果\n\n${table(['Capability', '情境', '結果', '驗證方式／備註'], summary.rows.map(
      (row) => [row.capability, row.scenario, row.status, [row.e2e ?? row.manual, row.note].filter(Boolean).join('；')],
    ))}`,
    `## 各 capability 的覆蓋摘要\n\n${table(['Capability', '總數', '自動驗證', '手動驗收', '尚未對照'], summary.coverage.map(
      (row) => [row.capability, row.total, row.e2e, row.manual, row.unmapped],
    ))}`,
    `## 相依套件安全檢查摘要\n\n${Object.entries(summary.audits).map(([scope, audit]) => {
      const title = scope === 'prod' ? '正式相依套件（不含 dev）' : '全部相依套件（含 dev）';
      if (audit.status !== '已執行') return `### ${title}\n\n${audit.status}`;
      return `### ${title}\n\n${table(['嚴重度', '數量'], Object.entries(audit.counts))}\n\nhigh 以上套件：${audit.highPackages.length ? audit.highPackages.map(cell).join('、') : '無'}`;
    }).join('\n\n')}`,
  ];
  return sections.join('\n\n') + '\n';
}
