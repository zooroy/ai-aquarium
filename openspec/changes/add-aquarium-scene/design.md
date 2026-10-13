# Design

## Context

- 倉庫裡目前沒有任何程式碼，這個 change 是第一個 change（動機見 proposal.md 的 Why）。
- 實作由 Codex 透過 Herdr 接收任務完成，Codex 看不到規劃時的對話。所以這份文件要把目錄結構、模組邊界和關鍵介面寫到不需要猜的程度。行為以 `specs/` 為準，這裡只寫怎麼做。
- 後續兩個 change 會依賴本次定下的兩個介面：
  - 輸入抽象：階段 ② 的手勢會成為新的輸入來源。
  - 魚的擺尾 shader：階段 ③ 的自訂貼圖魚要共用。

## Goals / Non-Goals

**Goals:**
- 模擬邏輯（Boids、邊界、輸入正規化）是純 TypeScript 模組，不碰 DOM 和 WebGL，可以在 Vitest 的 node 環境中測試。
- 渲染層只負責把模擬狀態畫出來。
- 所有可調參數（數量、速度、半徑、色票）集中在 config，方便調整手感。
- 支援固定亂數種子，讓截圖驗收可以重現。

**Non-Goals:**
- 不做手部追蹤、抓魚、驚慌狀態機、畫魚、資料保存（屬於階段 ② 和 ③）。
- 不做後處理特效（bloom、vignette），等基本畫面確定後再評估。
- 不使用外部 3D 模型檔，本階段所有幾何都用程式生成。
- 不支援行動裝置的效能目標，觸控只保證功能正確。

## Decisions

### D1. 技術棧：Vite + TypeScript + 原生 Three.js，不用 React

- 每幀要用命令式的方式更新大量物件，原生 Three.js 最直接。
- UI 幾乎沒有，用 React 或 R3F 只會增加一層抽象。
- 套件：`three`、`@types/three`、`vite`、`typescript`（strict）、`vitest`。
- 雜訊函式用 `simplex-noise` 套件，配合可帶種子的亂數產生器。
- 不使用其他執行期依賴。

### D2. 目錄結構

```
src/
  main.ts                 # 進入點：WebGL 偵測 -> 建立 App
  app.ts                  # 主迴圈：input -> simulation -> render
  config/
    params.ts             # 所有可調參數（魚數量、速度、半徑...）
    palette.ts            # Cozy 色票
  core/
    random.ts             # 可帶種子的 PRNG（mulberry32），讀取 ?seed=
    tank-bounds.ts        # 依相機與視窗計算可游動範圍
  input/
    types.ts              # Pointer / InputState / InputProvider
    input-manager.ts      # 彙整所有 provider -> InputState
    pointer-provider.ts   # 滑鼠與觸控（Pointer Events）
  simulation/
    fish-state.ts         # 魚的資料：位置、速度、相位、種類
    spatial-grid.ts       # 鄰居查詢用的空間網格
    boids.ts              # 分離 / 對齊 / 聚合 / 漫遊 / 邊界 / 速度限制
    cursor-avoidance.ts   # 螢幕空間的游標迴避力
  render/
    renderer.ts           # WebGLRenderer、相機、resize
    environment/
      sand.ts  rocks.ts  coral.ts  seaweed.ts  bubbles.ts  caustics.ts
      lighting.ts         # 半球光 + 暖色方向光 + 霧
    fish/
      fish-geometry.ts    # 程序化 Low Poly 魚網格
      swim-shader.ts      # 擺尾 shader patch（可重用）
      fish-renderer.ts    # InstancedMesh 同步模擬狀態
    cursor-renderer.ts    # Low Poly 游標物件
  debug/
    fps-overlay.ts        # ?debug 時顯示 fps
tests/                    # 對應 src 結構的 *.test.ts
```

規則：
- `simulation/`、`input/types.ts`、`input/input-manager.ts`、`core/` 不可以 import `three/` 的渲染類別。數學類別（例如 `Vector3`）可以 import。
- 只有 `render/` 可以碰 WebGL。

### D3. 輸入抽象介面

這是階段 ② 會依賴的介面，型別要照這裡定案：

```ts
export type InputSource = 'mouse' | 'touch' | 'hand';

export interface Pointer {
  id: string;          // e.g. 'mouse', 'touch-3', 'hand-0'
  x: number;           // 0..1, left -> right
  y: number;           // 0..1, top -> bottom
  pressed: boolean;    // mouse button down / touching / pinching
  source: InputSource;
}

export interface InputState {
  pointers: readonly Pointer[];
}

export interface InputProvider {
  readonly name: string;
  start(target: HTMLElement): void;
  stop(): void;
  getPointers(): Pointer[];   // provider 自己的最新游標快照
}

export class InputManager {
  register(provider: InputProvider): void;
  getState(): InputState;     // 每幀呼叫一次，合併所有 provider
}
```

- 滑鼠和觸控統一用 Pointer Events 處理，以 `pointerType` 區分。
- canvas 設定 `touch-action: none`，並隱藏原生游標（`cursor: none`）。
- `pointerleave` 時移除滑鼠游標；`pointerup` 和 `pointercancel` 時移除觸控游標。
- 替代方案：分開處理 mouse 和 touch 事件。沒有採用，因為 Pointer Events 已經統一了兩者，程式碼比較少。

### D4. 主迴圈

```
requestAnimationFrame
  dt = min(elapsed, 1/30)          # 分頁切回來時避免大跳躍
  state = inputManager.getState()
  simulation.step(dt, state, projectToScreen)
  fishRenderer.sync(simulation.fish)
  environment.update(time)
  cursorRenderer.sync(state)
  renderer.render()
```

- 模擬用變動的 dt，不用固定步長。理由：Boids 在小 dt 範圍內很穩定，dt 上限已經限制在 1/30 秒。
- 迴避計算需要知道魚在螢幕上的位置，所以把 `projectToScreen(worldPos) -> {x, y}`（正規化 0..1）當成函式參數注入模擬，模擬本身不依賴相機物件。測試時可以傳入簡單的正交投影。

### D5. 座標系與魚缸範圍

- 透視相機，FOV 45°，位置 `(0, 0, 14)`，看向原點。
- 可游動範圍是一個長方體：
  - z 在 `[-8, 3]`
  - x、y 依照相機在 z = 0 處的可視範圍乘以 0.9 計算，扣掉頂部水面和底部沙地的留白
  - 視窗大小改變時重新計算
- 魚的模型座標：頭朝 +X，身長 1 單位。在 world 中依照種類縮放 0.6～1.4 倍。
- 遠處的魚會因為透視自然變小，再加上霧化，就能達成 spec 要求的景深效果。

### D6. Boids 實作

- 鄰居查詢用均勻空間網格（格子大小等於感知半徑），把複雜度從 O(n²) 降到大約 O(n)。60 隻魚其實用暴力法也可以，但階段 ③ 會增加自訂魚，所以先做好。
- 所有力（分離、對齊、聚合、漫遊、邊界、游標迴避）加權相加後，限制最大轉向力，再把速度限制在 `[minSpeed, maxSpeed]` 之間。
- 邊界用「距離邊界越近，排斥力越大」的軟性推力，不做位置截斷。另外保留一道保險：位置超出範圍時才截回範圍內。
- 朝向：每幀把目前朝向往速度方向 slerp，並限制單幀最大轉角，滿足 spec 的平順轉向要求。
- 漫遊：每隻魚有自己的雜訊相位，取 simplex noise 當作方向擾動。
- 游標迴避：在螢幕空間計算魚和游標的距離，在迴避半徑內就施加 world 座標 xy 平面上、遠離游標方向的力；越近力越大。

### D7. Low Poly 魚的網格與擺尾 shader

- **網格**：用程式生成。沿 X 軸放 5～6 個橢圓截面環，每個環 6 個頂點，頭端和尾端收成一點，再加上三角形的尾鰭、背鰭和胸鰭。總共約 100～200 個三角形。輸出不共用頂點的幾何（non-indexed），平面著色才不會被平滑掉。
- **材質**：`MeshLambertMaterial({ flatShading: true })`。flat shading 的法線是在 fragment shader 裡用導數計算的，所以頂點擺動之後稜面仍然正確。
- **擺尾 shader**：寫成 `applySwimShader(material)`，透過 `onBeforeCompile` 注入 vertex 位移：
  ```
  t = clamp((headX - position.x) / bodyLength, 0, 1)   // 0 = head, 1 = tail
  amp = baseAmp * t * t
  position.z += sin(position.x * waveK - uTime * freq + phase) * amp
  ```
  - 每隻魚的 `phase` 和 `freq`（跟著速度提高）用 `InstancedBufferAttribute` 傳入。
  - 階段 ② 的驚慌效果只要調大 `freq` 和 `amp`，不用改 shader 結構。
  - 階段 ③ 的自訂魚會是個別的 `Mesh`，直接對它的材質呼叫同一個 `applySwimShader`。這就是把 shader 寫成獨立函式的原因。
- **渲染方式**：每種配色一個 `InstancedMesh`，至少三種配色，顏色用 `instanceColor` 或分開的材質。每幀從模擬狀態寫入 instance 矩陣。
- 替代方案：用 glTF 骨架動畫的魚。沒有採用，因為需要外部素材，而且每隻魚要跑一個 mixer，效能較差。

### D8. 環境

全部用程式生成，並使用 `palette.ts` 裡的色票。

| 元素 | 作法 |
|---|---|
| 沙地 | 細分的 `PlaneGeometry`，用 simplex 雜訊位移成起伏，轉成 non-indexed 以 flat shading 呈現 |
| 岩石 | `IcosahedronGeometry(r, 0)` 隨機擾動頂點，再隨機縮放 |
| 珊瑚 | 低段數的 `ConeGeometry` 或 `CylinderGeometry` 組成分枝，暖色系 |
| 水草 | 細長、分成多段的 box，套用和魚相同概念的擺動 shader，沿 y 方向擺動，根部固定 |
| 氣泡 | `InstancedMesh` 的小多面體，往上升時左右微幅晃動，超過水面高度就重生到底部 |
| 焦散 | 對沙地材質用 `onBeforeCompile` 加上隨時間流動的程序化網紋圖樣（2 層 voronoi 或 sin 干涉），以加亮的方式疊加 |
| 光照 | `HemisphereLight`（上方暖色、下方青色）加一盞暖色 `DirectionalLight` |
| 霧 | `THREE.Fog`，顏色和 `scene.background` 相同，都是水色 |

- 裝飾物分布在前景（z > 0）和背景（z < -4），製造景深層次。
- 擺放用帶種子的亂數，固定種子時畫面完全相同。

### D9. 游標呈現

- 每個游標用一顆 `IcosahedronGeometry(0.25, 0)`，半透明的淡色材質。
- 把游標位置從螢幕座標反投影到 z = 2 的平面上，放在魚群前方。
- 按下時放大 1.4 倍並提高自發光，用約 100ms 的補間動畫過渡。

### D10. 測試與驗收策略

| 類型 | 工具 | 範圍 |
|---|---|---|
| 單元測試 | Vitest（node 環境） | random、tank-bounds、spatial-grid、boids 各條規則、cursor-avoidance、input-manager、pointer-provider（用模擬的事件） |
| 型別檢查 | `tsc --noEmit` | 全部 |
| 建置 | `vite build` | 必須成功 |
| 視覺驗收 | Claude 用瀏覽器開 `?seed=42` 截圖 | 風格、光照、霧、環境動態、游標 |
| 效能驗收 | 開 `?debug` 看 fps overlay | spec 中的 55fps 要求 |

npm scripts 統一為：`dev`、`build`、`test`、`typecheck`。每個任務完成時，Codex 必須回報 `npm test` 和 `npm run typecheck` 的輸出。

- spec 裡「方向趨於一致」「距離增加」這類情境，用固定種子在 node 環境中跑幾百步模擬，再斷言統計值。

## Risks / Trade-offs

- [「Cozy」的感覺很主觀，單元測試驗不出來] → 視覺任務獨立拆出來，用截圖驗收，預期會來回調整色票和光照；參數都集中在 `palette.ts` 和 `params.ts`，調整時不用動邏輯。
- [flat shading 加上 vertex 位移，在低面數時可能閃爍得太明顯] → 擺動幅度和網格段數都做成參數，用截圖確認。
- [焦散 shader 在整合顯示卡上的成本] → 先只做在沙地上，fps 不足時改成預先產生的動態貼圖。
- [螢幕空間迴避在透視下，遠處的魚看起來被很遠的游標推開] → 這是預期行為（spec 是以螢幕距離定義的）；如果手感不好，之後再把迴避半徑依深度縮放。
- [Codex 看不到這份規劃以外的脈絡] → 每個 task 都要寫明檔案、驗收標準和測試指令；介面以這份 D3 為準，不允許自行更改。

## Open Questions

- 水色的背景要不要做成垂直漸層（上淺下深）？做的話需要一個背景平面，並和霧色協調。等第一版截圖出來再決定，不影響其他任務。
- 預設魚數量 60 是猜的。等效能量測後再微調，只需要改 `params.ts`。
