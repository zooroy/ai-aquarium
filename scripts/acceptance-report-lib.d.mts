export interface SpecFile { path: string; content: string }
export interface Scenario { capability: string; scenario: string }
export type MapEntry = Scenario & { note?: string } & (
  { e2e: string; manual?: never } | { manual: string; e2e?: never }
);
export interface PlaywrightSuite {
  suites?: PlaywrightSuite[];
  specs?: { title: string; tests: { results: { status: string }[] }[] }[];
}
export interface AuditInput {
  error?: unknown;
  metadata?: { vulnerabilities: Partial<Record<'info' | 'low' | 'moderate' | 'high' | 'critical', number>> };
  vulnerabilities?: Record<string, { severity: string }>;
}
export interface SummaryInput {
  scenarios: Scenario[];
  map: MapEntry[];
  results?: PlaywrightSuite | null;
  checks?: Record<string, string>;
  auditAll?: AuditInput | null;
  auditProd?: AuditInput | null;
  sha?: string;
  time?: string;
}
export interface AuditSummary {
  status: '未執行' | '已執行' | '資料錯誤';
  counts: Record<string, number>;
  highPackages: string[];
}
export interface Summary {
  sha: string;
  time: string;
  rows: (MapEntry & { status: '通過' | '失敗' | '未執行' | '手動驗收' })[];
  coverage: { capability: string; total: number; e2e: number; manual: number; unmapped: number }[];
  checks: Record<string, string>;
  audits: { all: AuditSummary; prod: AuditSummary };
}
export function parseScenarios(files: SpecFile[]): Scenario[];
export function validateMap(map: unknown, scenarios: Scenario[]): string[];
export function summarize(input: SummaryInput): Summary;
export function renderMarkdown(summary: Summary): string;
