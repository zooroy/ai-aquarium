# AGENTS.md

給在本專案工作的工程師代理（Codex）的指引。

## 角色分工

- **Claude Code（規劃者）**：分析需求、設計架構、撰寫 OpenSpec 文件、拆解任務、派工、審查程式碼與測試結果、驗收。
- **Codex（工程師）**：依照派工實作程式碼、建立元件、撰寫與執行測試、修正 bug、回報結果。
- 每次派工只做被指定的任務。發現規格不清楚、規格有錯，或需要超出任務範圍的修改時，**停下來回報**，不要自行擴大範圍或更改規格。

## 規格來源

- 進行中的 change 在 `openspec/changes/<change-name>/`：
  - `proposal.md`：做什麼、為什麼
  - `specs/**/spec.md`：行為需求與情境，是驗收依據
  - `design.md`：技術決定、目錄結構、介面定義
  - `tasks.md`：任務清單
- **不可修改 `openspec/` 底下的任何檔案**，包括勾選 `tasks.md` 的核取方塊；任務完成與否由 Claude 驗收後勾選。
- `design.md` 定義的介面（例如 `input/types.ts` 的型別）必須照抄，不可自行修改簽名。如果需要修改，先回報。

## 開發指令

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝依賴 |
| `npm run dev` | 開發伺服器 |
| `npm run build` | 正式建置 |
| `npm test` | 執行 Vitest 單元測試（node 環境） |
| `npm run typecheck` | `tsc --noEmit` 型別檢查 |

網址參數：`?seed=<number>` 固定亂數種子；`?debug` 顯示 fps。

## 程式結構規則

- 原始碼放在 `src/`，測試放在 `tests/`，測試目錄結構對應 `src/` 的結構，檔名用 `*.test.ts`。
- `src/simulation/`、`src/core/`、`src/input/types.ts`、`src/input/input-manager.ts` 是純 TypeScript：
  - 不可以 import DOM API，也不可以 import Three.js 的渲染類別（Renderer、Mesh、Material 等）。
  - Three.js 的數學類別（`Vector3`、`Quaternion` 等）可以使用。
- 只有 `src/render/` 可以使用 WebGL。
- 所有可調參數放在 `src/config/params.ts`，色票放在 `src/config/palette.ts`，不要把數值寫死在邏輯裡。
- 需要亂數的地方一律使用 `src/core/random.ts` 的帶種子 PRNG，不要直接用 `Math.random()`。
- TypeScript 使用 strict 模式，不使用 `any`（真的需要時，加註解說明原因）。

## 完成任務時的回報格式

每次完成派工後，用以下格式回報：

```
## 任務 <編號>：<標題>
狀態：完成 / 部分完成 / 受阻
修改的檔案：
- path/to/file.ts（新增 / 修改）
npm test：
<完整輸出的最後摘要，含通過與失敗數>
npm run typecheck：
<輸出，或「無錯誤」>
npm run build（如果任務要求）：
<輸出摘要>
備註：
<偏離規格的地方、不確定的地方、建議 Claude 驗收時注意的事>
```

- 測試失敗時要照實回報，不要刪除或跳過測試來讓結果通過。
- 任務要求截圖、但你無法開啟瀏覽器時，在備註說明，並確認 `npm run build` 成功即可，截圖由 Claude 處理。
