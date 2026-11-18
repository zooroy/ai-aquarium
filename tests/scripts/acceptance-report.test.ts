import { describe, expect, it } from 'vitest';
import { parseScenarios, validateMap, summarize, renderMarkdown } from '../../scripts/acceptance-report-lib.mjs';
import type { MapEntry, PlaywrightSuite, SummaryInput } from '../../scripts/acceptance-report-lib.mjs';

const scenarios = [
  { capability: 'tank', scenario: '載入' },
  { capability: 'tank', scenario: '鏡頭' },
  { capability: 'tank', scenario: '縮放' },
  { capability: 'phone', scenario: '畫圖' },
];
const map: MapEntry[] = [
  { ...scenarios[0], e2e: 'tank loads' },
  { ...scenarios[1], manual: '需要鏡頭', note: '已有部分驗證' },
];
function results(statuses: string[], title = 'tank loads'): PlaywrightSuite {
  return { suites: [{ suites: [{ specs: [{ title, tests: [{ results: statuses.map((status) => ({ status })) }] }] }] }] };
}
const input: SummaryInput = { scenarios, map, sha: 'abc123', time: '2026-01-01T00:00:00Z' };

describe('parseScenarios', () => {
  it('reads exact headings in main and active delta specs, ignores archives and deduplicates', () => {
    expect(parseScenarios([
      { path: 'openspec/specs/tank/spec.md', content: '#### Scenario: 載入\r\n#### Scenario: 縮放\n### Scenario: 略過\n #### Scenario: 也略過' },
      { path: 'openspec/changes/current/specs/tank/spec.md', content: '#### Scenario: 載入\n#### Scenario: 新增' },
      { path: 'openspec/changes/archive/old/specs/old/spec.md', content: '#### Scenario: 舊' },
      { path: 'openspec\\specs\\phone\\spec.md', content: '#### Scenario: 畫圖' },
    ])).toEqual([scenarios[0], scenarios[2], { capability: 'tank', scenario: '新增' }, scenarios[3]]);
  });
});

describe('validateMap', () => {
  it('accepts valid e2e and manual entries', () => {
    expect(validateMap(map, scenarios)).toEqual([]);
  });
  it('returns every missing capability, scenario and exclusive-method error', () => {
    const errors = validateMap([
      { capability: 'missing', scenario: '不存在', e2e: 'x' },
      { capability: 'tank', scenario: '拼錯', e2e: 'x' },
      { ...scenarios[0], e2e: 'x', manual: 'y' },
      { ...scenarios[1] },
    ], scenarios);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('missing / 不存在');
    expect(errors[1]).toContain('tank / 拼錯');
    expect(errors[2]).toContain('e2e／manual');
    expect(errors[3]).toContain('e2e／manual');
  });
  it.each([null, {}, 'invalid'])('rejects non-array input %j', (value) => {
    expect(validateMap(value, scenarios)).toEqual(['對照表必須是陣列']);
  });
  it('rejects malformed rows, empty methods, both keys and duplicate mappings', () => {
    expect(validateMap([null, { ...scenarios[0], e2e: '' },
      { ...scenarios[1], e2e: 'x', manual: null }, map[0]], scenarios)).toHaveLength(4);
  });
});

describe('summarize', () => {
  it.each([
    [['passed'], '通過'],
    [['failed', 'passed'], '通過'],
    [['failed'], '失敗'],
    [['timedOut'], '失敗'],
    [['skipped'], '失敗'],
    [['passed', 'failed'], '失敗'],
    [[], '失敗'],
  ])('uses final attempt %j => %s', (statuses, status) => {
    expect(summarize({ ...input, results: results(statuses) }).rows[0].status).toBe(status);
  });
  it('marks a missing test title failed and absent results not executed', () => {
    expect(summarize({ ...input, results: results(['passed'], 'renamed') }).rows[0].status).toBe('失敗');
    const summary = summarize(input);
    expect(summary.rows.map((row) => row.status)).toEqual(['未執行', '手動驗收']);
  });
  it('does not hide a failure when duplicate test titles exist', () => {
    const report = { suites: [results(['failed']), results(['passed'])] };
    expect(summarize({ ...input, results: report }).rows[0].status).toBe('失敗');
  });
  it('counts all capabilities including those with no mappings', () => {
    expect(summarize(input).coverage).toEqual([
      { capability: 'phone', total: 1, e2e: 0, manual: 0, unmapped: 1 },
      { capability: 'tank', total: 3, e2e: 1, manual: 1, unmapped: 1 },
    ]);
  });
  it('preserves explicit check outcomes and leaves absent checks not executed', () => {
    expect(summarize({ ...input, checks: { lint: 'failure', build: 'skipped', test: 'success' } }).checks)
      .toMatchObject({ lint: 'failure', build: 'skipped', test: 'success', audit: '未執行' });
  });
  it('summarizes production and full audits independently without changing scenario outcomes', () => {
    const summary = summarize({ ...input, results: results(['passed']),
      auditAll: {
        metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 1, critical: 1 } },
        vulnerabilities: { low: { severity: 'low' }, critical: { severity: 'critical' }, high: { severity: 'high' } },
      },
      auditProd: { metadata: { vulnerabilities: {} }, vulnerabilities: {} },
    });
    expect(summary.audits.all).toEqual({ status: '已執行', counts: { info: 0, low: 1, moderate: 2, high: 1, critical: 1 }, highPackages: ['critical', 'high'] });
    expect(summary.audits.prod.counts.high).toBe(0);
    expect(summary.rows[0].status).toBe('通過');
  });
  it('distinguishes missing audits from audit error output', () => {
    expect(summarize(input).audits.all.status).toBe('未執行');
    expect(summarize({ ...input, auditAll: { error: { code: 'ENOTFOUND' } } }).audits.all.status).toBe('資料錯誤');
  });
});

describe('renderMarkdown', () => {
  it('renders the five sections in order, including metadata, notes and missing audits', () => {
    const markdown = renderMarkdown(summarize(input));
    const headings = ['# 驗收報告', '## 檢查結果', '## 情境結果', '## 各 capability 的覆蓋摘要', '## 相依套件安全檢查摘要'];
    const positions = headings.map((heading) => markdown.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const text of ['abc123', input.time!, '需要鏡頭', '已有部分驗證', '未執行']) expect(markdown).toContain(text);
  });
  it('escapes table pipes, line breaks and HTML', () => {
    const markdown = renderMarkdown(summarize({ ...input, map: [{ ...scenarios[0], manual: 'a|b\n<script>' }] }));
    expect(markdown).toContain('a&#124;b<br>&lt;script&gt;');
  });
  it('renders severity counts and high package names', () => {
    const markdown = renderMarkdown(summarize({ ...input, auditAll: {
      metadata: { vulnerabilities: { high: 2 } }, vulnerabilities: { problem: { severity: 'high' } },
    } }));
    expect(markdown).toContain('| high | 2 |');
    expect(markdown).toContain('high 以上套件：problem');
  });
});
