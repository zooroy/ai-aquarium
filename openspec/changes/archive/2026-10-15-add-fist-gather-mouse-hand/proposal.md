# Proposal

## Why

現在和魚的互動只有「抓」一種，魚群對游標也只會躲開。使用者想加一個讓魚靠過來的手勢：握拳時，魚群游過來圍著手繞圈。

用滑鼠操作時，畫面上只有一顆多面體游標，和鏡頭模式的手套對不起來。所以滑鼠也要改成手套模型，並且也能做出捏合（抓魚）和握拳（聚集魚）。

另外，手套目前在畫面上偏大。

## What Changes

- **握拳手勢（鏡頭）**：手部追蹤新增握拳判斷，四根手指都彎起來時為握拳。
  - 握拳優先於捏合：握拳時游標不算按下，所以握拳不會抓魚。
  - 捏著魚時改成握拳，那隻魚會被放開。
- **滑鼠右鍵＝握拳**：
  - 按住右鍵時，滑鼠游標進入握拳狀態，放開後解除。
  - 魚缸上不再出現瀏覽器的右鍵選單。
  - 左鍵維持「按下＝捏住」，抓魚流程和現在一樣。
- **魚群聚集環繞**：
  - 任何游標進入握拳狀態時，魚缸中自由游動的魚會游到這隻手周圍，形成一圈魚，並繞著手轉圈。
  - 握拳的游標不會再把魚推開。
  - 放開後，魚回到一般群游。
- **滑鼠游標改成手套**：
  - 來源為滑鼠的游標改用手套模型呈現（右手、手背朝向畫面）。
  - 平常是張開的手；按左鍵時拇指和食指捏合；按右鍵時握拳。各姿勢之間平順轉換。
  - 觸控游標維持多面體。
- **手套縮小到 0.8 倍**：鏡頭的手和滑鼠的手都一樣，捏合點仍然對齊游標。
- **游標狀態多一個欄位**：每個游標新增「是否握拳」，所有輸入來源都要填。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `interaction-input`：
  - 游標狀態新增握拳欄位。
  - 滑鼠右鍵對應握拳，並抑制右鍵選單。
  - 滑鼠游標改由手套呈現，觸控仍是多面體。
- `hand-tracking`：新增握拳判斷，並規定握拳優先於捏合。
- `fish-schooling`：
  - 新增「握拳聚集環繞」。
  - 「迴避游標」排除握拳中的游標。
- `fish-grab`：「輸入來源一致」補充：握拳不抓魚，抓著魚時握拳會放開。
- `hand-avatar`：
  - 手套大小改為原本的 0.8 倍。
  - 新增「滑鼠手」：用同一個手套模型，呈現張開、捏合、握拳三種姿勢。

## Impact

- **輸入層**：
  - `src/input/types.ts`（`Pointer` 新增 `fist`）
  - `src/input/pointer-provider.ts`（右鍵、右鍵選單）
  - `src/input/hand/hand-provider.ts`（握拳判斷）
  - 新增 `src/input/hand/fist.ts`
  - 姿勢表從 `replay-source.ts` 抽到新的 `src/input/hand/hand-poses.ts`，並新增握拳姿勢與 replay 的 `fist` 腳本。
- **模擬**：
  - 新增 `src/simulation/fist-gather.ts`。
  - 修改 `src/simulation/boids.ts`（加入聚集力，握拳游標不算迴避）。
  - 修改 `src/simulation/cursor-avoidance.ts`。
- **渲染**：
  - 新增 `src/render/hand/mouse-hand.ts`（由滑鼠游標合成 `HandPose`）。
  - 修改 `src/render/cursor-renderer.ts`（不再畫滑鼠游標）。
  - 修改 `src/render/hand/hand-rig.ts`（模型縮放）。
  - 修改 `src/app.ts`（第二個 `HandAvatar`）。
  - 修改 `src/debug/fps-overlay.ts`（顯示握拳）。
- **設定**：`src/config/params.ts` 新增握拳門檻、聚集環繞、滑鼠手、`modelScale` 等參數。
- **測試**：所有手寫 `Pointer` 物件的測試都要補 `fist` 欄位。
- **不影響**：手機畫圖、轉交、自訂魚的投放與離開。
