# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作；Codex 額度用完時由 Claude 接手。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 所有實作都在分支 `change/add-sdlc-verification-pipeline` 上進行，不直接 commit 到 `main`。
> 這個 change 允許新增以下 devDependencies，版本都要鎖定確切版本：`eslint`、`@eslint/js`、`typescript-eslint`、`@playwright/test`。不新增其他套件。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出；第 1 組之後還要加上 `npm run lint`，第 2 組之後還要加上 `npm run test:e2e`。名稱與介面以 design.md 為準。

## 1. ESLint

- [x] 1.1 依 design 決定 1，新增 `eslint.config.js` 和 `npm run lint`，安裝 `eslint`、`@eslint/js`、`typescript-eslint`。驗證方式：
  - 在目前的程式碼上執行 `npm run lint`，exit code 為 0。
  - 回報列出所有因為既有程式碼違規而降為 `warn` 的推薦規則，以及做過的機械式修正（檔案和原因）。
  - 專案規則（`no-explicit-any`、`Math.random`、純邏輯目錄的 Three.js 渲染類別）沒有被降級。
- [x] 1.2 為三條專案規則新增 `tests/lint/project-rules.test.ts`。用 ESLint 的 Node API（`new ESLint({ overrideConfigFile: 'eslint.config.js' })` 加上 `lintText` 並指定 `filePath`）驗證：
  - `src/simulation/x.ts` 裡的 `Math.random()` 報錯；`src/core/random.ts` 裡的不報錯。
  - `src/simulation/x.ts` 從 `three` import `Mesh`、`MeshBasicMaterial`、`WebGLRenderer` 都報錯；import `Vector3`、`Quaternion` 不報錯。
  - `src/render/x.ts` 從 `three` import `Mesh` 不報錯。
  - `src/ui/x.ts` 裡的 `const a: any = 1` 報錯。
  - `npm test` 全部通過。

## 2. Playwright smoke 測試

- [ ] 2.1 依 design 決定 2，新增 `playwright.config.ts`、npm scripts（`test:e2e`、`test:e2e:install`），安裝 `@playwright/test`。`.gitignore` 加上 `dist-e2e/`、`playwright-report/`、`test-results/`、`acceptance/`。`tsconfig.json` 的 `include` 加上 `playwright.config.ts`。驗證方式：
  - `npm run test:e2e:install` 成功。
  - 在沒有任何 e2e 測試時，`npx playwright test --list` 可以執行，不會出錯。
  - `npm run typecheck` 和 `npm run lint` 通過。
  - `npm test` 沒有收到 `tests/e2e/` 底下的檔案。
- [ ] 2.2 依 design 決定 3，新增 `tests/e2e/fixtures.ts`、`aquarium.e2e.ts`、`phone.e2e.ts`。測試標題要和 design 的表格完全相同。驗證方式：
  - 本機 `npm run test:e2e` 的 4 個測試全部通過，連續執行 3 次都通過。
  - **負向驗證**：暫時在 `src/main.ts` 開頭加 `console.error('x')`，確認至少一個測試失敗、失敗訊息裡有 `x`。驗證完要還原，並在回報裡說明。
  - `phone.e2e.ts` 的提示文字從 `src/config` import，不寫死。
  - 沒有修改 `src/` 底下的檔案（第 1 組的機械式修正除外）。
  - 若 headless 沒有 WebGL 導致失敗：停下來回報，不要跳過測試。

## 3. 情境對照與驗收報告

- [ ] 3.1 依 design 決定 4，新增 `tests/e2e/scenario-map.json`，內容是 design 表格裡的 12 筆。驗證方式：
  - 每一筆的 capability 目錄存在，情境名稱可以在該 spec 裡找到。這一點由 3.2 的腳本檢查。
  - 回報列出哪些 e2e 對照，是讀過 THEN 之後判斷「只驗證了一部分」而改成 manual 的。
- [ ] 3.2 依 design 決定 5，新增 `scripts/acceptance-report-lib.mjs`、`acceptance-report-lib.d.mts`、`acceptance-report.mjs` 和 `npm run report`。新增 `tests/scripts/acceptance-report.test.ts`，用假資料驗證：
  - `parseScenarios`：抓出 `#### Scenario: ` 開頭的行，capability 取自目錄名稱，忽略 `archive/`。
  - `validateMap`：找不到的 capability、找不到的情境、`e2e` 和 `manual` 兩者都有或都沒有，都會回報。
  - 情境結果：
    - 測試通過或 retry 後通過 → 通過。
    - 測試失敗 → 失敗。
    - 標題在結果裡找不到 → 失敗。
    - 沒有結果檔 → 未執行。
  - 覆蓋摘要：每個 capability 的總數、e2e、manual、尚未對照數正確。
  - audit 摘要：依嚴重度計數，列出 high 以上的套件；沒有檔案時顯示「未執行」。
  - `renderMarkdown` 的輸出依序包含 design 決定 5 列出的五個段落。
  - 本機執行 `npm run test:e2e && npm run report` 會產生 `acceptance/report.md`。回報附上報告內容。
  - 把對照表的一個情境名稱暫時改錯，`npm run report` 的 exit code 為 1，訊息指出該名稱。驗證完要還原。

## 4. CI

- [ ] 4.1 依 design 決定 6，新增 `.github/workflows/ci.yml`，`pages.yml` 不修改。驗證方式：
  - 用 `npx --yes @action-validator/cli@0.6.0 .github/workflows/ci.yml` 或同等工具確認語法正確。無法執行時在回報裡說明，由 Claude 在 PR 上驗證。
  - 每個步驟的 `id` 和 design 相同。
  - 第 9～11 步有 `if: always()`。
  - 報告步驟用 `CHECK_<NAME>` 傳入每一步的 `outcome`。
  - 本機模擬 CI 的指令順序（`npm ci` 到 `npm run report`）全部成功。

## 5. 文件與交付 [Claude]

- [ ] 5.1 **[Claude]** 依 design 決定 7 修改 `AGENTS.md`：指令表、回報格式、「不直接 commit 到 `main`、分支命名 `change/<name>`」。驗證方式：
  - 指令表列出的每個指令在 `package.json` 裡都存在。
- [ ] 5.2 **[Claude]** 推送分支並開 PR。驗證方式：
  - PR 上的 `verify` 檢查通過。
  - 從 artifact 下載 `acceptance/report.md`：所有 e2e 情境都通過，audit 摘要列出 dev 相依的 picomatch high。
  - 截圖或貼出 PR 的檢查狀態給使用者。
- [ ] 5.3 **[Claude]** 在 PR 上做一次負向驗證：推一個故意違反 lint 的 commit（例如在 `src/simulation/` 用 `Math.random()`）。驗證方式：
  - `verify` 失敗在 `lint` 步驟。
  - 報告裡 `lint` 為 failure，後續步驟為 skipped。
  - 驗證後 revert 這個 commit，檢查恢復通過。
- [ ] 5.4 **[User]** PR 合併到 `main` 之後，在 GitHub 為 `main` 開啟 branch protection（design 決定 7）。Claude 會提供 `gh api` 指令，由使用者執行。驗證方式：
  - 在新分支開一個 CI 失敗的 PR，GitHub 不允許合併。驗證完關閉這個 PR。

## Workflow follow-up

- 使用者完成 5.4 後，由 Claude 執行 `openspec-verify-change`，再 archive 這個 change。
