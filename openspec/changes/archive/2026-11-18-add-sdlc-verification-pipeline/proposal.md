# Proposal

## Why

規劃和實作已經有 OpenSpec 和 Claude／Codex 分工，但驗證和交付還很薄：
- CI 只在 push 到 `main` 時跑 `npm test` 和 `build`，然後直接部署。
- typecheck 不在 CI 裡，也沒有 lint。
- 瀏覽器裡的行為完全靠人工截圖驗收。
- 所有 commit 都直接進 `main`，壞掉的程式碼會在被發現之前就部署出去。

這次要讓「合併到 `main` 之前」有一道自動檢查，並且留下可以查閱的驗收證據。

## What Changes

- **ESLint**：
  - 加入 ESLint（flat config + typescript-eslint），新增 `npm run lint`。
  - 把 `AGENTS.md` 裡可以機器檢查的規則寫成 lint 規則：不用 `any`、不直接用 `Math.random()`、純 TypeScript 目錄不 import Three.js 渲染類別。
- **PR 驗證 CI**：
  - 新增 `ci.yml`，在 pull request 和 push 到 `main` 時執行 typecheck、lint、單元測試、build、相依套件安全檢查和瀏覽器 smoke 測試。
  - 部署的 `pages.yml` 維持只在 `main` 觸發。
- **分支＋PR 流程**：
  - 之後的開發改在分支上進行，經 PR 合併到 `main`。
  - `main` 設定分支保護，CI 沒過不能合併。這一步由使用者在 GitHub 設定。
- **Playwright smoke 測試**：
  - 新增 `npm run test:e2e`，用 headless Chromium 對 build 出來的網站跑少量端對端測試。
  - 魚缸頁：場景能載入、沒有 console error、可以用滑鼠模式開始玩、說明卡可以關閉、滑鼠操作不會出錯。
  - 手機畫圖頁：用 `?mode=draw` 打開時能載入、沒有錯誤。
- **驗收報告**：
  - 建立一份 spec 情境與 e2e 測試的對照表。
  - CI 依照測試結果產生 Markdown 驗收報告，和 Playwright 報告一起上傳成 CI artifact。
  - 報告列出每個情境的狀態：自動驗證通過、失敗或手動驗收。
- **相依套件安全檢查**：
  - 正式相依套件（`--omit=dev`）出現 high 以上的漏洞時，CI 失敗。
  - 完整 audit（含 dev 相依）只列在報告裡，不讓 CI 失敗。原因：目前 dev 相依已經有一個 high 漏洞（picomatch，經 vite 引入），修正它需要降版 vite。

### Non-Goals

- Semgrep、CodeQL、MSW、Testing Library 不在這次範圍。
- 不測鏡頭模式和手部追蹤，因為 CI 沒有鏡頭。
- 不做像素比對的視覺回歸測試。
- 不修改產品功能，也不為了測試在產品程式碼裡加 test hook。

## Capabilities

### New Capabilities

- `verification-pipeline`：程式碼合併與部署前的自動檢查，包括哪些檢查、何時執行、失敗時怎麼處理、產生哪些驗收證據。

### Modified Capabilities

（無。產品功能的需求都不變。）

## Impact

- **新增**：
  - `eslint.config.js`
  - `playwright.config.ts`
  - `tests/e2e/*.e2e.ts`
  - `tests/e2e/scenario-map.json`
  - `scripts/acceptance-report-lib.mjs`
  - `scripts/acceptance-report.mjs`
  - `.github/workflows/ci.yml`
- **修改**：
  - `package.json`：新增 scripts 和 devDependencies（`eslint`、`typescript-eslint`、`@playwright/test`）。
  - `.gitignore`：Playwright 的輸出目錄。
  - `AGENTS.md`：開發指令表、分支＋PR 流程、回報格式加上 lint 和 e2e。這個檔案由 Claude 修改。
- **GitHub 設定（使用者操作）**：`main` 的分支保護和 required status checks。
- **不影響**：`src/` 底下的產品程式碼。例外是 lint 抓到違規時，要做機械式修正。
