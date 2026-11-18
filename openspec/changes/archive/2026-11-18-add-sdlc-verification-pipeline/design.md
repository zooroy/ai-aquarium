# Design

## Context

- **現有 CI**：`.github/workflows/pages.yml` 在 push 到 `main` 時跑 `npm ci → npm test → npm run build`（帶 Supabase 的 Actions variables），然後部署。沒有 PR 觸發。
- **測試**：Vitest 在 node 環境執行，`vitest.config.ts` 只收 `tests/**/*.test.ts`。沒有任何瀏覽器測試。
- **建置**：
  - `prebuild` 會複製 MediaPipe wasm 到 `public/mediapipe/wasm/`（已被 gitignore）。
  - `vite.config.ts` 用 `VITE_BASE` 決定 base path。
- **轉交服務設定**：
  - `createRelayClientFromEnv` 在 `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY` 為空字串或缺少時回傳 `undefined`，此時魚缸和畫圖頁都不會連線。
  - 本機有 `.env.local`（含真實的 Supabase 值）。Vite 的規則是行程環境變數優先於 `.env*` 檔。
- **畫圖頁**：沒有轉交設定時，`?mode=draw` 只顯示「畫一隻魚」標題和 `PHONE_MESSAGES.unavailable`，不會出現畫布。
- **開場流程**：開場卡有「開啟鏡頭」「用滑鼠玩」兩個按鈕。按「用滑鼠玩」後出現說明卡，按「開始玩」關閉。
- **現況檢查**：
  - `src/` 沒有 `Math.random()` 和 `any`。
  - 純邏輯目錄只從 `three` import `Vector3`。
- **npm audit**：
  - `npm audit --omit=dev --audit-level=high` 目前通過。
  - 完整 audit 有 high（picomatch ReDoS，經 vite、vitest 引入），`npm audit fix --force` 會把 vite 降到 6.x。
- **環境**：本機 Node 26，CI 用 Node 22。Repo 是 public，可以使用分支保護。

## Goals / Non-Goals

**Goals:**
- 一個 workflow 涵蓋 spec 的所有檢查，失敗時看得出是哪一步。
- 本機可以用同樣的指令重現 CI 的每一步。
- e2e 不連線到真實的 Supabase。

**Non-Goals:**
- 不用 type-aware lint（`recommendedTypeChecked`）。速度較慢，而且 `tsc` 已經負責型別。
- 不在多種瀏覽器上測試，只用 Chromium。
- 不把 `pages.yml` 改成依賴 `ci.yml` 的結果。部署的安全性靠分支保護保證。

## Decisions

### 1. ESLint（`eslint.config.js`）

- **基礎設定**：flat config，`@eslint/js` recommended 加上 `typescript-eslint` 的 `recommended`。
- **檢查範圍**：`src/**/*.ts`、`tests/**/*.ts`、`scripts/**/*.mjs`。
- **忽略**：`dist/`、`dist-e2e/`、`public/`、`node_modules/`、`playwright-report/`、`test-results/`、`acceptance/`。

**專案規則**

| 規則 | 設定 | 範圍 |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | `error` | 全部 |
| `no-restricted-properties` | `Math.random` → `error`，訊息：「請用 src/core/random.ts 的帶種子 PRNG」 | `src/**`，排除 `src/core/random.ts` |
| `no-restricted-imports` | `patterns: [{ group: ['three'], importNamePattern: '^(WebGL\\w*\|\\w*Renderer\|Scene\|Object3D\|Group\|Mesh\|InstancedMesh\|Points\|Line\\w*\|Sprite\|\\w*Material\|\\w*Geometry\|\\w*Texture\|\\w*Camera\|\\w*Light)$', message: '純邏輯目錄不可使用 Three.js 渲染類別' }]` | `src/simulation/**`、`src/core/**`、`src/input/types.ts`、`src/input/input-manager.ts` |

- **對既有程式碼的處理**：推薦規則在既有程式碼上若有違規：
  - 機械式修正（例如移除沒用到的 import）可以直接改。
  - 會改到行為的違規不要改。把該規則的層級降為 `warn`，在 config 加註解說明，並在回報裡列出。
  - 專案規則（上表）不可以降級。
- **指令**：`npm run lint` → `eslint .`，有 error 時 exit code 非 0，只有 warning 時為 0。
- **為什麼不用 Biome 等其他工具**：使用者的流程指定 ESLint；而 `no-restricted-imports` 的 `importNamePattern` 剛好可以表達「three 可以 import，但不能 import 渲染類別」這條規則。

### 2. Playwright（`playwright.config.ts`）

- **測試位置**：`testDir: 'tests/e2e'`、`testMatch: '**/*.e2e.ts'`。副檔名和 Vitest 的 `*.test.ts` 不同，兩邊不會互相收到。
- **瀏覽器**：只有一個 project：`chromium`。
  - `launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']`，讓 headless 有軟體 WebGL。
  - viewport 1280×720，`hasTouch: false`。
- **webServer**：
  - `command: 'npm run build -- --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort'`
  - `url: 'http://localhost:4173'`
  - `reuseExistingServer: !process.env.CI`
  - `env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_BASE: '/' }`：用空字串蓋掉 `.env.local`，確保不連到真實的 Supabase。
  - 輸出到 `dist-e2e/`，不影響正式的 `dist/`。
- **reporter**：`[['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]`。
- **其他設定**：`retries: process.env.CI ? 1 : 0`、`trace: 'retain-on-failure'`、`screenshot: 'only-on-failure'`。
- **指令**：
  - `test:e2e` → `playwright test`
  - `test:e2e:install` → `playwright install --with-deps chromium`
- **新增套件**：devDependency `@playwright/test`（鎖定確切版本）。

### 3. e2e 測試（`tests/e2e/`）

**`fixtures.ts`**
- 匯出擴充過的 `test`：每個測試自動收集 `pageerror` 和 `console`（type 為 `error`）。
- 測試結束時斷言收集到的清單是空的。
- 如果之後真的需要忽略某個訊息，放在明確的 allowlist 陣列，並加註解說明原因。一開始是空的。

**`aquarium.e2e.ts`**：開啟 `/?seed=1`。測試標題要和對照表一致：

| 測試標題 | 步驟與斷言 |
|---|---|
| `魚缸載入並持續繪製` | 「用滑鼠玩」按鈕可見。對 `#aquarium` 截兩張圖，相隔 500ms，兩張的 buffer 不同。 |
| `用滑鼠玩並關閉說明卡` | 按「用滑鼠玩」，再按「開始玩」。開場卡和說明卡都不可見。 |
| `滑鼠操作不出錯` | 進入滑鼠模式並關閉說明卡後：在畫布上移動滑鼠；按住左鍵拖曳約 200px 後放開；按住右鍵約 1 秒後放開。只靠 fixture 斷言沒有錯誤。 |

**`phone.e2e.ts`**：開啟 `/?mode=draw`。

| 測試標題 | 步驟與斷言 |
|---|---|
| `畫圖頁在沒有轉交設定時載入` | 沒有 `#aquarium`；「畫一隻魚」標題可見；`PHONE_MESSAGES.unavailable` 的文字可見。文字從 `src/phone/phone-page.ts` 匯出的 `PHONE_MESSAGES` import，不要寫死。若在 Playwright 的 Node 環境 import 該模組會出錯，才改成寫死字串，並加註解指出來源。 |

- **選取元素**：用 `getByRole` 或 `getByText`。不為了測試在產品程式碼加 `data-testid`。
- **畫布截圖**：只比對 buffer 是否不同，不做像素比對，所以不需要額外的 PNG 解碼套件。

### 4. 情境對照表（`tests/e2e/scenario-map.json`）

用 JSON 而不是 TS，報告腳本可以直接讀取，不需要 `tsx` 或額外的匯出步驟。格式（陣列）：

```jsonc
[
  { "capability": "aquarium-scene", "scenario": "開啟頁面", "e2e": "魚缸載入並持續繪製" },
  { "capability": "camera-onboarding", "scenario": "成功開啟鏡頭", "manual": "CI 沒有鏡頭，由 Claude 在本機瀏覽器驗收" }
]
```

- 每一筆要嘛有 `e2e`（Playwright 測試標題，必須完全相符），要嘛有 `manual`（為什麼不能自動化，或手動驗收的方式），不能兩者都有或都沒有。
- 可選的 `note` 欄位（字串）：補充說明這一筆哪一部分已經由 e2e 自動驗證，例如只驗證了部分 THEN 而改標 manual 的情況。報告會把它附在驗證方式後面。

這次的初始內容：

| capability | 情境 | 驗證 |
|---|---|---|
| aquarium-scene | 開啟頁面 | e2e：魚缸載入並持續繪製 |
| camera-onboarding | 首次載入 | e2e：魚缸載入並持續繪製 |
| camera-onboarding | 用滑鼠玩 | e2e：用滑鼠玩並關閉說明卡 |
| interaction-guide | 用滑鼠玩之後 | e2e：用滑鼠玩並關閉說明卡 |
| interaction-guide | 關閉說明卡 | e2e：用滑鼠玩並關閉說明卡 |
| phone-drawing | 強制畫圖模式 | e2e：畫圖頁在沒有轉交設定時載入 |
| verification-pipeline | 魚缸載入 | e2e：魚缸載入並持續繪製 |
| verification-pipeline | 用滑鼠開始玩 | e2e：用滑鼠玩並關閉說明卡 |
| verification-pipeline | 滑鼠操作 | e2e：滑鼠操作不出錯 |
| verification-pipeline | 開啟畫圖頁 | e2e：畫圖頁在沒有轉交設定時載入 |
| camera-onboarding | 成功開啟鏡頭 | manual：CI 沒有鏡頭，由 Claude 在本機瀏覽器驗收 |
| camera-onboarding | 拒絕鏡頭權限 | manual：同上 |

- 對照之前要先讀過該情境的 THEN，確認 e2e 測試真的有驗證它。若 e2e 只驗證了一部分，改標 manual，並在 note 寫明哪部分已經自動化。
- 其他情境不列在對照表裡，報告會計入「尚未對照」。

### 5. 驗收報告（`scripts/acceptance-report.mjs`）

純 Node 腳本，不需要額外套件。用 `node scripts/acceptance-report.mjs` 執行，`npm run report` 是別名。

**輸入**
- **對照表**：`tests/e2e/scenario-map.json`。
- **測試結果**：`test-results/results.json`（Playwright JSON reporter）。
- **spec 情境**：掃描 `openspec/specs/*/spec.md` 和 `openspec/changes/*/specs/*/spec.md`（排除 `archive/`）。
  - 以 `#### Scenario: ` 開頭的行就是情境，capability 是目錄名稱。
  - 進行中 change 的 delta 裡的情境也算，這樣這個 change 在 archive 之前就能對照自己的情境。
- **各檢查的結果**：由 CI 用環境變數傳入，例如 `CHECK_TYPECHECK=success|failure|skipped`，名稱依此類推。
- **audit 資料**：`npm audit --json` 和 `npm audit --omit=dev --json` 的輸出檔，路徑用參數傳入。檔案不存在時，報告寫「未執行」。

**行為**
- 對照表的 capability 或情境在 spec 裡找不到，或某一筆格式錯誤（`e2e`／`manual` 不是剛好一個）時：`stderr` 列出所有有問題的項目，exit code 為 1。
- 對照表的 `e2e` 標題在 Playwright 結果裡找不到時，該情境標為失敗（可能是測試改名了）。
- e2e 情境的結果用測試標題查 Playwright 結果：
  - 測試通過（包含 retry 後通過）→ 通過。
  - 測試失敗 → 失敗。
  - 沒有 `results.json`（e2e 沒有執行）→ 所有 e2e 情境標為「未執行」。
- 腳本把報告寫到 `acceptance/report.md`。如果有 `GITHUB_STEP_SUMMARY`，也附加到 job summary。
- 報告內容依序是：
  1. 標題、commit SHA、時間
  2. 檢查結果表
  3. 情境結果表
  4. 各 capability 的覆蓋摘要
  5. audit 摘要（依嚴重度計數，並列出 high 以上的套件名稱）
- 報告有情境失敗時，腳本本身仍 exit 0。失敗由 e2e 那一步負責，報告只負責呈現。exit 1 只用在對照表錯誤。

**單元測試**
- 把解析與彙整的邏輯拆成 `scripts/acceptance-report-lib.mjs`，匯出純函式：
  - `parseScenarios(files)`
  - `validateMap(map, scenarios)`
  - `summarize(...)`
  - `renderMarkdown(...)`
- `tests/scripts/acceptance-report.test.ts` 用 Vitest 測試這些函式。
- `.mjs` 匯入 TS 測試需要型別宣告，旁邊放 `acceptance-report-lib.d.mts`。

### 6. CI（`.github/workflows/ci.yml`）

- **觸發**：`pull_request: { branches: [main] }`、`push: { branches: [main] }`。
- **權限**：`permissions: contents: read`。
- **並行**：`concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`。

**單一 job `verify`**（ubuntu-latest，Node 22，npm cache）。步驟都有 `id`，並設 `continue-on-error: false`：
1. `npm ci`
2. `npm run typecheck`（id `typecheck`）
3. `npm run lint`（id `lint`）
4. `npm test`（id `test`）
5. `npm run build`（id `build`）：不帶 Supabase 變數，只確認能建置。
6. `npm audit --omit=dev --audit-level=high`（id `audit`）
7. 快取 Playwright 瀏覽器（key 用 `@playwright/test` 的版本），然後 `npx playwright install --with-deps chromium`。
8. `npm run test:e2e`（id `e2e`）
9. `if: always()`：
   - `npm audit --json > acceptance/audit-all.json || true`
   - `npm audit --omit=dev --json > acceptance/audit-prod.json || true`
10. `if: always()`：`node scripts/acceptance-report.mjs`。用 `env` 傳入 `CHECK_<NAME>: ${{ steps.<id>.outcome }}`。
11. `if: always()`：`actions/upload-artifact@v4`，name 為 `acceptance-${{ github.sha }}`。
    - path：`acceptance/`、`playwright-report/`、`test-results/`
    - `retention-days: 14`

**為什麼用單一 job**：分成多個 job 要重複 `npm ci`，也比較難把所有結果集中在一份報告。缺點是步驟依序執行，前面失敗後面就不跑。不過前面失敗時，後面的步驟在報告裡會是 `skipped`，資訊仍然完整。

**branch protection 的 required check 名稱**：`verify`。

**`pages.yml`**：不修改。

### 7. 分支＋PR 流程與 AGENTS.md

- **branch protection**：由使用者在 GitHub 設定 `main`。
  - 勾選 Require a pull request before merging，approvals 設為 0（單人專案）。
  - 勾選 Require status checks：`verify`，並勾選 Require branches to be up to date。
  - 勾選 Do not allow bypassing（包含 admin）。
  - Claude 會提供對應的 `gh api` 指令，由使用者執行。
- **分支命名**：`change/<openspec-change-name>`，一個 OpenSpec change 對一個 PR。
- **`AGENTS.md`**（Claude 修改）：
  - 指令表加上 `lint`、`test:e2e`、`test:e2e:install`、`report`。
  - 回報格式加上 `npm run lint` 和 `npm run test:e2e`（任務要求時）。
  - 加上一句：不直接 commit 到 `main`。
- **`.gitignore`**：加上 `dist-e2e/`、`playwright-report/`、`test-results/`、`acceptance/`。

## Risks / Trade-offs

- **[CI 的 headless Chromium 沒有 WebGL]** → 用 SwiftShader 參數。失敗時頁面會顯示「此頁面需要支援 WebGL 的瀏覽器」，測試會明確失敗。若仍然不行，回報 Claude，不要跳過測試。
- **[軟體 WebGL 很慢，測試不穩定]** → 斷言只檢查 UI 和錯誤，不檢查 fps。單一測試的 timeout 設 30 秒；CI retry 1 次。
- **[畫布兩張截圖剛好相同]** → 場景有焦散、氣泡和魚群持續動畫，500ms 內一定會變。若不穩定，改成最多比對 3 次。
- **[webServer 的空字串 env 沒有蓋掉 `.env.local`]** → 畫圖頁的測試斷言會出現「無法使用」的提示，這本身就是檢查。CI 上沒有 `.env.local`，不受影響。
- **[dev 相依的 high 漏洞一直存在]** → 報告裡持續可見。等 vite 或 vitest 發布修正版再升級，不在這次處理。
- **[branch protection 讓緊急修正變慢]** → 單人專案仍值得。緊急時可以暫時關閉保護，這由使用者決定。
- **[多加三個 devDependencies]** → 只影響開發與 CI，不影響正式 bundle。`npm audit --omit=dev` 不受影響。

## Migration Plan

1. 這個 change 本身就用分支＋PR 交付（`change/add-sdlc-verification-pipeline`），用 PR 上的第一次 CI 驗證 workflow。
2. CI 通過、合併後，使用者再開啟 branch protection。先合併再開啟，是因為 required check `verify` 要先執行過一次，才能在設定裡選到。
3. 回復方式：刪除 `ci.yml` 並關閉 branch protection。`pages.yml` 沒有被修改，部署不受影響。
