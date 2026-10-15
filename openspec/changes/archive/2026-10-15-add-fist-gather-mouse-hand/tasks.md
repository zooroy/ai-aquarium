# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作；Codex 額度用完時由 Claude 接手。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。名稱與介面以 design.md 為準。不新增 npm 套件。

## 1. 輸入：握拳狀態

- [x] 1.1 介面與滑鼠右鍵（design 決定 1、4）：
  - `Pointer` 新增 `fist`，`HandPose` 新增 `fist`、`fistRatio`。
  - `PointerProvider` 處理右鍵和 `contextmenu`。
  - 補齊所有手寫 `Pointer` 和 `HandPose` 的測試。

  驗證方式：`pointer-provider.test.ts` 涵蓋以下情況：
  - 只按左鍵 → `pressed`。
  - 只按右鍵 → `fist`、不是 `pressed`。
  - 左右鍵同時按 → 只算 `fist`。
  - 觸控 → `fist` 為 false。
  - `contextmenu` 被 preventDefault，`stop` 後監聽被移除。
- [x] 1.2 姿勢表與握拳判斷（design 決定 2、3）：
  - 新增 `hand-poses.ts`（OPEN、PINCH、FIST、`blendPose`）和 `fist.ts`。
  - `HandProvider` 整合握拳判斷，握拳優先於捏合。
  - replay 支援 `fist` 權重，並新增 `fist` 腳本。

  驗證方式：
  - `fistRatio`：OPEN 約 2、PINCH 大於 1.5、FIST 小於 1.25；把座標整體縮放 0.5 倍或 2 倍時，結果不變。
  - `FistDetector` 的遲滯：1.3 到 1.45 之間來回時，維持原本的狀態。
  - FIST 每段骨長和 OPEN 相差 20% 以內。
  - replay `fist` 腳本：3000 ms 時為 `fist`、不是 `pressed`；8000 ms 時兩者都是 false。
  - `demo` 腳本的輸出和改動前相同。
  - 寬限時間內偵測不到手時，維持握拳狀態。
- [x] 1.3 Debug 顯示（design 決定 9）：`setInteraction` 改成接收 `HandPose`，顯示握拳狀態、握拳比例和滑鼠狀態。驗證方式：`fps-overlay` 測試涵蓋握拳和比例的文字。

## 2. 模擬：聚集環繞

- [x] 2.1 新增 `fist-gather.ts`，並整合進 `stepSchool`；握拳游標不再讓魚迴避；`ctx` 新增 `screenToWorld`，`App` 傳入 `renderer.screenToWorld`（design 決定 5）。

  驗證方式：
  - `fist-gather.test.ts` 通過 design 決定 5 的驗收測試（5 秒內 70% 落在環內；80% 逆時針；速度和邊界都符合；放開後恢復）。
  - grabbed、fleeing、轉場中的魚都不受聚集力影響。
  - 有兩個中心時，每隻魚選最近的那一個。
  - `cursor-avoidance` 測試加上「fist 游標不產生迴避力」。
  - 回報最後調整的參數值。
- [x] 2.2 抓魚測試（design 決定 6）：在 `grab.test.ts` 補兩個情況：
  - 在魚身上直接進入握拳，不會抓起魚。
  - 抓著魚時改成握拳，魚被放開並逃走（`mode === 'fleeing'`）。

## 3. 渲染：滑鼠手與大小

- [x] 3.1 手套縮為 0.8 倍（design 決定 8）：
  - 新增 `HAND_RENDER_PARAMS.modelScale = 0.8`。
  - `drivePose` 的 placement、landmarks、targets 都一致套用。

  驗證方式：
  - 新增測試：手腕到中指根部的長度 = 未縮放長度 × 0.8。
  - 捏合中點對齊、debug 點對齊、捏合距離等既有測試全部通過。
- [x] 3.2 滑鼠手（design 決定 7）：
  - 新增 `mouse-hand.ts`。
  - `App` 新增第二個 `HandAvatar`。
  - `CursorRenderer` 只畫觸控游標。

  驗證方式：
  - `mouse-hand.test.ts` 涵蓋以下情況：
    - 0.1 秒內權重從 0 到 1。
    - 左鍵捏合時，指尖距離小於門檻。
    - 右鍵握拳時，`fistRatio(joints)` 小於 1.25。
    - 游標消失後淡出，`visible` 為 false。
    - 和 `HandProvider` 讀同一個 replay 姿勢時，joints 一致。
    - `handedness` 為 `'right'`。
  - `cursor-renderer.test.ts`：滑鼠游標不產生多面體，觸控游標照舊。
  - `App` 的 `dispose` 會釋放兩個手套。

- [x] 3.3 **[Claude 接手，Codex 額度不足]** 同時只有一隻手套（design 決定 10）。驗證方式：
  - `cursor-state` 測試：`fistActivation` 在 0.1 秒內從 0 到 1。
  - `cursor-renderer` 測試：
    - `mouseAsPolyhedron` 為 true 時，滑鼠游標產生多面體；為 false 時不產生。
    - 握拳時的縮放和顏色，與未按、按下時都不同。
  - 瀏覽器：replay 的手出現時，滑鼠手淡出、出現多面體；手消失後恢復手套。

## 4. 驗收

- [x] 4.1 **[Claude]** 瀏覽器驗證：
  - `?debug&handReplay=fist`：手套握拳，魚聚集環繞；放開後魚散開。
  - 滑鼠移動、左鍵、右鍵的三種手套姿勢；右鍵沒有跳出選單；左鍵抓魚和以前一樣。
  - 手套比之前小。
  - fps 與更換前相當，沒有 console 錯誤。
  - 截圖確認。
- [x] 4.2 **[User]** 實測：
  - 鏡頭握拳，魚聚集環繞，放開後散開；回報 debug 上的握拳比例（握拳時和張開時各一個值）。
  - 握拳過程中不會誤抓魚（或回報發生的頻率）。
  - 滑鼠三種姿勢，以及右鍵讓魚聚集。
  - 手套大小合適。
- [x] 4.3 **[Claude]** README 更新互動說明（握拳聚集、滑鼠手、右鍵）。驗證方式：README 的互動段落提到握拳與右鍵。

## Workflow follow-up

- 驗收通過後封存（同步各 spec），commit 並 push 到 main，觸發 GitHub Pages 部署。
