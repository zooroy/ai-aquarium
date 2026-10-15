# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作；Codex 額度用完時由 Claude 接手。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。名稱與介面以 design.md 為準。不新增 npm 套件。

## 1. 素材

- [x] 1.1 **[Claude]** 依 design 決定 6，產生 `public/guide/glove-open.webp`、`glove-pinch.webp`、`glove-fist.webp`。驗證方式：
  - 三張都是透明背景，每張小於 40 KB。
  - 看得出是張開、捏合、握拳，都是看得到手背的右手手套。
  - 擷取頁已刪除，`git status` 沒有留下暫存檔。

## 2. 說明卡

- [x] 2.1 新增 `src/ui/interaction-guide.ts` 和 `src/ui/mouse-icon.ts`；`params.ts` 新增 `GUIDE_PARAMS`（imageSize、buttonInset），`palette.ts` 新增 `guideHighlight`（design 決定 1～4）。

  驗證方式：
  - `guideContent`：
    - 鏡頭模式和滑鼠模式各有 3 個項目，名稱、圖片、說明與 design 決定 2 的表格相符。
    - 滑鼠模式的 `mouse` 依序是 none、left、right。
    - 每張圖片都有非空的替代文字。
    - 兩種模式都有下方提示。
  - `createGuideController`：
    - `start` 前，按鈕隱藏，`open` 沒有作用。
    - 第一次 `start('mouse')` 時，按鈕出現、說明卡開啟。
    - 再呼叫 `start('mouse')` 不會重新開啟。
    - `autoOpen: false` 時不開啟。
    - `close` 後可以再 `open`，內容是目前的模式。
  - `createMouseIcon`：
    - 標示的按鍵有填色，外框線寬比未標示的寬。
    - `none` 時兩鍵都沒有填色。
    - 有 `role="img"` 和 `aria-label`。
  - `createInteractionGuide`（用假 DOM）：
    - 按 Esc 會關閉說明卡；「開始玩」會關閉說明卡。
    - 圖片 `onerror` 時圖片隱藏，文字仍然存在。
    - `dispose` 時移除元素和 `keydown` 監聽。
- [x] 2.2 接上開場流程（design 決定 5）：
  - `onboarding.ts` 的 `finished` 帶入模式。
  - `App` 建立說明卡、在 replay 模式用 `autoOpen: false`、`dispose` 時釋放。

  驗證方式：
  - `onboarding.test.ts`：
    - 用滑鼠玩時，`finished('mouse')`。
    - 鏡頭成功時，`finished('camera')`。
    - 鏡頭失敗時，`finished('mouse')`（可以被呼叫多次）。
  - `npm test`、`npm run typecheck`、`npm run build` 全部通過。

- [x] 2.3 **[Claude 接手，Codex 額度不足]** 捏合圖改成手背視角（design 決定 7）。驗證方式：
  - 三張圖都看得到手背。
  - 捏合圖沒有單獨直立的中指。
  - 每張小於 40 KB，擷取頁已刪除。
- [x] 2.4 **[Claude 接手，Codex 額度不足]** 切換鏡頭與滑鼠（design 決定 8）。驗證方式：
  - `onboarding.test.ts`：
    - mouse → camera 成功。
    - mouse → camera 失敗時維持 mouse 並帶提示。
    - camera → mouse 會停止 track、dispose tracker、清除手。
    - loading 期間忽略切換。
  - `interaction-guide.test.ts`：每個模式第一次才自動開啟。
  - 瀏覽器：
    - 左下角兩個按鈕並排。
    - 滑鼠模式按「開啟鏡頭」會出現載入中。
    - 開場卡不會再出現。

## 3. 驗收

- [x] 3.1 **[Claude]** 瀏覽器驗證：
  - 選「用滑鼠玩」後出現滑鼠說明卡，看得到三張滑鼠圖示和手套圖片。
  - 用 replay 開啟時不會自動跳出說明卡，但左下角有按鈕，按下後出現手勢說明卡。
  - 360px 寬時上下排列，沒有水平捲動。
  - 按 Esc 和「開始玩」都能關閉。
  - 沒有 console 錯誤。
  - 截圖確認。
- [x] 3.2 **[User]** 實測：
  - 開鏡頭後的手勢說明卡、用滑鼠玩的滑鼠說明卡，圖片和文字是否清楚。
  - 左下角「操作說明」能再打開。
  - 文案或圖片有想調整的地方，回報給 Claude。
- [x] 3.3 **[Claude]** README 的功能表加上操作說明。驗證方式：README 提到操作說明卡。

## Workflow follow-up

- 驗收通過後封存（同步 `interaction-guide` spec），commit 並 push 到 main，觸發 GitHub Pages 部署。
