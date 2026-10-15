# Design

## Context

- **輸入層**：`Pointer` 只有 `pressed`。`PointerProvider` 只看左鍵（`buttons & 1`）。`HandProvider` 用 2D 影像座標算捏合比例（`pinchRatio` + `PinchDetector` 遲滯）。
- **魚群**：`stepSchool(fish, dt, ctx)` 算分離、對齊、聚合、漫遊、邊界和游標迴避：
  - 分離先保留轉向力額度，其餘的力只能用剩下的額度。
  - 游標迴避是額外加上去的，最後一起限制在 `maxSteeringForce`。
- **抓魚**：`GrabController` 只看 `pressed` 的變化。`pressed` 變成 false 就放開，魚會逃走。
- **畫面上的手**：`HandAvatar.sync(pose, dt, screenToWorld)` 依 `HandPose` 驅動手套，一個 instance 就是一隻手。
  - `drivePose` 依手腕到中指根部的長度，把模型縮放到和使用者的手一樣大，再把捏合點對齊目標。
- **游標**：`CursorRenderer` 為滑鼠和觸控游標畫多面體。
- **replay 的手勢**：`replay-source.ts` 內有 `OPEN` 和 `CLOSED`（捏合）兩組 21 點姿勢表。輸出時 x 取負，變成「未鏡像相機中的右手」。

## Goals / Non-Goals

**Goals:**
- 鏡頭握拳和滑鼠右鍵都會產生握拳狀態，魚群聚集並環繞。
- 滑鼠游標改成手套，可做出張開、捏合、握拳三種姿勢。
- 手套顯示大小改為 0.8 倍。

**Non-Goals:**
- 觸控沒有握拳（例如長按）。觸控游標仍是多面體。
- 不改捏合門檻、抓魚規則，也不改魚的速度上限。
- 畫圖面板開啟時，不暫停聚集（只有抓取會暫停）。

## Decisions

### 1. 介面

`src/input/types.ts`：

```ts
export interface Pointer {
  id: string;
  x: number;
  y: number;
  pressed: boolean;    // mouse left button / touching / pinching（握拳時一律 false）
  fist: boolean;       // mouse right button / hand fist；觸控一律 false
  source: InputSource;
}
```

`src/input/hand/types.ts` 的 `HandPose` 新增兩個欄位：

```ts
  fist: boolean;       // 握拳狀態（已套用遲滯）；為 true 時 pressed 必為 false
  fistRatio: number;   // 最近一次的握拳比例（已濾波），沒有資料時為 Infinity；debug 顯示用
```

所有 provider 和測試裡手寫的 `Pointer` 和 `HandPose` 都要補上這些欄位。`fist` 是必填欄位，這樣漏寫時型別檢查就會報錯。

### 2. 握拳判斷（`src/input/hand/fist.ts`）

```ts
export function fistRatio(world: readonly Landmark[]): number; // 四指（8、12、16、20）指尖到手腕距離的平均 ÷ 手腕到中指根部（點 9）的距離；資料不足或掌長為 0 時回傳 Infinity
export class FistDetector { update(ratio: number): boolean; reset(): void; }
```

- **用 3D 世界座標**（`worldLandmarks`，公尺）。手握拳時，手指會往鏡頭方向或遠離鏡頭的方向彎，2D 影像座標看不出來。
- **門檻**：`HAND_PARAMS.fistEnter = 1.25`，`fistExit = 1.5`。
  - 現有姿勢表張開時約 2.0，捏合時約 1.9，都遠高於離開門檻。
  - 真實握拳時的值要靠實測確認，debug 會顯示比例，方便調整。
- **濾波**：比例先經過一個 `OneEuroFilter`，再進入遲滯判斷，和捏合比例的做法相同。
- **`HandProvider` 每次 `ingest` 時**：
  - `fist = fistDetector.update(filteredFistRatio)`。
  - `pinched = pinch.update(filteredPinchRatio)`。捏合判斷照常更新，維持它自己的遲滯狀態。
  - `pose.pressed = pinched && !fist`。
  - `pose.fist = fist`。
- **其他行為**：`resetFilters` 也要重設握拳的濾波和偵測器。在寬限時間內偵測不到手時，維持原本的握拳狀態，和捏合一樣。
- **輸出**：`getPointers()` 輸出的 `fist` 取自 `pose.fist`。

### 3. 姿勢表（`src/input/hand/hand-poses.ts`）

把 `OPEN`、`CLOSED`（改名為 `PINCH`）從 `replay-source.ts` 移到這個檔案，並新增 `FIST`：

```ts
export const OPEN_POSE: readonly (readonly number[])[];
export const PINCH_POSE: readonly (readonly number[])[];
export const FIST_POSE: readonly (readonly number[])[];
/** 回傳「未鏡像相機中的右手」世界座標（x 已取負），和 replay 的 worldLandmarks 相同慣例。 */
export function blendPose(pinch: number, fist: number): Landmark[];
```

- **混合方式**：結果 = OPEN + pinch·(1−fist)·(PINCH−OPEN) + fist·(FIST−OPEN)。兩個權重都先限制在 0..1。
- **FIST 姿勢**：
  - 四指指尖收到手掌前方（往 −z，也就是掌心那一側）。
  - 各指的 PIP、DIP 跟著彎曲，大拇指壓在食指和中指的中節上。
  - 指尖與手腕的距離要符合真實握拳的比例，`fistRatio` 約 0.9 到 1.1。
  - 骨長要和 OPEN 大致相同（每段差 20% 以內），避免手套被拉長。
  - 第 4 點和第 8 點的中點（捏合點）不能和手腕重合，手套的位置才有意義。
- **replay**：
  - `ReplayKeyframe` 新增可選的 `fist?: number`（0..1，預設 0），內插方式和 `pinch` 相同。
  - 新增腳本 `fist`：0 ms 時張開，1000 ms 轉為握拳，維持到 6000 ms，7000 ms 張開，10000 ms 結束，位置固定在 (0.5, 0.5)。
  - 現有的 `demo`、`jitter`、`dropout` 輸出不變（既有測試保護）。

### 4. 滑鼠右鍵（`PointerProvider`）

- **滑鼠和筆**：
  - `pressed = (buttons & 1) !== 0 && (buttons & 2) === 0`。
  - `fist = (buttons & 2) !== 0`。
- **觸控**：`pressed = true`，`fist = false`。
- **右鍵選單**：`start` 時在 target 上監聽 `contextmenu` 並 `preventDefault()`，`stop` 時移除監聽。
- **按鍵狀態**：在 pointer events 中，同時按兩個鍵時，第二個鍵的變化會以 `pointermove` 送出，所以每個事件都重新讀 `buttons`，不需要額外狀態。

### 5. 聚集環繞（`src/simulation/fist-gather.ts`）

```ts
export function gatherCenters(pointers: readonly Pointer[], screenToWorld: (x: number, y: number, z: number) => Vector3): Vector3[]; // 每個 fist 游標一個中心，深度 FIST_GATHER_PARAMS.centerZ
export function computeGatherForce(fish: Fish, centers: readonly Vector3[]): Vector3 | null; // 不參與或沒有中心時回傳 null
```

**參與與中心**
- 只有 `mode === 'swimming'`、而且不在轉場中（`!isTransitioning`）的魚參與。
- 每隻魚選擇 3D 距離最近的中心。

**每隻魚受到的力（以中心為原點，d = 位置 − 中心）**
- **徑向**：r = (d.x, d.y)，在面向相機的平面上。力 = r̂ · (radius − |r|) · `radialGain`，太遠時拉近、太近時推遠。
  - |r| 接近 0 時，用 `fish.phase` 決定方向。
- **切向**：t̂ = (−r̂.y, r̂.x)。z 軸朝向觀看者，所以從畫面看是逆時針。力 = (t̂ · `orbitSpeed` − 速度的 xy 分量) · `tangentGain`。
- **深度**：每隻魚的目標深度 = center.z + `depthSpread` · sin(phase)，力 = (目標深度 − z) · `depthGain`。
  - 魚群會分散在不同深度，形成一個厚環。60 隻魚加上 1.6 的分離半徑，單層的圈排不下。
- **合力**：三者相加後，限制在 `maxSteeringForce` 以內。

**在 `stepSchool` 中的整合**
- `ctx` 新增 `screenToWorld`，每幀只計算一次 `gatherCenters`。
- 對參與環繞的魚：
  - 對齊、聚合、漫遊乘上 `FIST_GATHER_PARAMS.flockScale`。
  - 聚集力乘上 `gatherWeight` 後加進 `force`。
  - 分離仍然優先保留額度，邊界力照常計算。速度上限、轉向限制和邊界限制都不變，所以規格的速度和邊界情境自然成立。
- `computeAvoidanceForce` 略過 `fist === true` 的游標。

**初始參數（`FIST_GATHER_PARAMS`，可依測試和實測調整）**
- `centerZ: -1.5`：在可游動範圍內，位於手的後方，從畫面看魚圈圍著手。
- `radius: 3.5`，`band: 1.5`：規格裡的「環繞範圍」就是 world xy 距離中心 radius ± band。
- `orbitSpeed: 1.4`：介於最低 0.6 與最高 1.8 之間。
- `depthSpread: 2.5`。
- `radialGain`、`tangentGain`、`depthGain`、`gatherWeight`、`flockScale`：由 Codex 調整到測試通過，回報最後的數值。

**驗收測試（寫在 `tests/simulation/fist-gather.test.ts`）**
- 用固定種子產生 60 隻魚。
- 在畫面中央放一個 fist 游標，以 dt = 1/60 跑 5 秒。
- 至少 70% 的 swimming 魚，xy 距離落在 radius ± band 內。
- 這些魚當中，至少 80% 的角速度方向和逆時針一致。
- 每一幀的速度都在 [minSpeed, maxSpeed] 之間，位置都在範圍內。
- 放開後再跑 2 秒，聚集力為 null，而且 avoidance 恢復作用。

### 6. 抓魚

`GrabController` 不用修改：握拳時 `pressed` 是 false，原本的放開流程就會讓魚逃走。只補測試：
- 在魚身上直接進入握拳，不會抓起魚。
- 抓著魚時，同一個游標變成握拳，魚被放開並逃走。

### 7. 滑鼠手（`src/render/hand/mouse-hand.ts`）

```ts
export class MouseHandPose {
  update(pointer: Pointer | undefined, dt: number): HandPose;
  reset(): void;
}
```

- **姿勢權重**：
  - `pinch` 朝目標 `pressed ? 1 : 0` 線性移動，`fist` 朝目標 `fist ? 1 : 0` 線性移動。
  - 速度為每秒 1 / `CURSOR_PARAMS.transitionDuration`，也就是 0.1 秒走完。
- **淡入淡出**：
  - `opacity` 依 `HAND_PARAMS.fadeSeconds` 淡入淡出。
  - 游標消失後，位置停在最後的位置繼續淡出，`visible = false`。
- **關節**：
  - `joints` = `blendPose(pinch, fist)` 再做 `(-x, -y, z)` 轉換，和 `HandProvider` 對 `worldLandmarks` 做的轉換一樣。
  - 測試要比對：同一個姿勢，滑鼠手的 joints 和 `HandProvider` 讀 replay 的結果（不含濾波誤差）一致。
- **其他欄位**：
  - `handedness: 'right'`，所以手套會鏡像，手背朝向畫面。
  - `pressed = pointer?.pressed ?? false`，用來觸發氣泡。
  - `fist = pointer?.fist ?? false`，`fistRatio = Infinity`。
  - `pointer` 是滑鼠的位置。

**在 `App` 中的使用**
- 新增第二個 `HandAvatar`（`mouseAvatar`，不開 debugRig）。
- 每幀把 `state.pointers` 中第一個 `source === 'mouse'` 的游標交給 `MouseHandPose.update`，結果再交給 `mouseAvatar.sync`。
- 兩個 `HandAvatar` 各自載入 GLB（第二次載入來自 HTTP 快取），`dispose` 時兩個都要釋放。

`CursorRenderer` 只畫 `source === 'touch'` 的游標。

### 8. 手套大小

- `HAND_RENDER_PARAMS.modelScale = 0.8`。
- `drivePose` 算出的縮放乘上這個值。`placement`、`landmarks`、`targets`（debug 點）都要一致地跟著縮小，捏合點仍對齊目標。
- 鏡頭的手和滑鼠手都會套用。
- 測試：手腕到中指根部的實際長度 = 未縮放長度 × 0.8，誤差 1e-6；捏合中點對齊的測試照舊。

### 9. Debug 顯示

`setInteraction` 的顯示改成以下格式：
- `手:握拳(右)`、`手:捏住(右)` 或 `手:張開(右)`。
- 鏡頭的手存在時，再加上 `｜握拳比例:1.12`（取 `HandPose.fistRatio`，小數兩位）。

要拿到比例，`setInteraction` 改傳整個 `HandPose`（取代原本的 `side` 參數）。滑鼠游標存在時，加上 `｜滑鼠:握拳`、`｜滑鼠:按下` 或 `｜滑鼠:未按`。

### 10. 同時只有一隻手套（使用者實測回饋）

使用者實測發現，開著鏡頭時，畫面同時有鏡頭的手和滑鼠手，看起來不協調。改成鏡頭的手優先：

- **判斷依據**：`App` 每幀取得 `handPose.visible`，作為「鏡頭的手存在」。這個值包含 300 ms 的寬限時間，手短暫偵測失敗時不會來回切換。
- **鏡頭的手存在時**：
  - `MouseHandPose.update(undefined, dt)`，滑鼠手淡出。
  - `CursorRenderer.sync(state, dt, { mouseAsPolyhedron: true })`，滑鼠游標以多面體顯示。
- **鏡頭的手不存在時**：照決定 7，滑鼠是手套，`CursorRenderer` 只畫觸控游標。
- **多面體的握拳外觀**：
  - `CursorVisualState` 新增 `fistActivation`，和 `activation` 一樣在 `transitionDuration` 內線性變化。
  - 縮放 = 1 + (pressedScale − 1)·activation + (fistScale − 1)·fistActivation。
  - 顏色從 `PALETTE.cursor` 線性混到 `PALETTE.cursorFist`。
  - 新增參數 `CURSOR_PARAMS.fistScale = 0.7` 和色票 `PALETTE.cursorFist`。
- **替代方案（不採用）**：「最近在動的那個顯示手套」。鏡頭的手一直有微小抖動，兩隻手套會來回閃。

## Risks / Trade-offs

- **[真實握拳的比例跟預設門檻不合]** → debug 顯示比例，實測後只調 `fistEnter`、`fistExit`。
- **[握拳過程中先經過捏合，短暫抓到一條魚又放開]** → 先接受，請使用者實測。如果太常發生，再在捏合判斷加上「中指沒有彎曲」的條件（另開討論，不在這次範圍）。
- **[60 隻魚擠在一圈太密，分離力讓魚一直推擠抖動]** → 用 depthSpread 做成厚環，並保留分離優先。如果畫面不好看，只調整 radius、band、depthSpread。
- **[第二隻手套增加繪製成本]** → 只有滑鼠在魚缸上時才繪製（`root.visible`）。實作後確認 fps。
- **[macOS 的 Ctrl+左鍵也會觸發右鍵選單]** → `contextmenu` 一律 preventDefault。但 Ctrl+左鍵在 `buttons` 中仍然是左鍵，所以會被當成捏合，不是握拳。這是可以接受的。

## Migration Plan

純前端修改，直接部署。要回復時 revert 這次 commit 即可。
