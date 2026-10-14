# Design

## Context

- 魚的幾何：`createFishGeometry()`（`src/render/fish/fish-geometry.ts`）用 `FISH_RENDER_PARAMS.rings` 組成六角截面的身體，加上尾鰭、背鰭和兩片胸鰭。頂點的 `color` 屬性是 body/fins/belly 的 one-hot 區域權重，沒有 UV。魚頭朝 +x，身體高度沿 y，左右側沿 z。
- 一般魚用 `FishRenderer` 渲染：每種配色一個 `InstancedMesh`，擺尾 shader 由 `applySwimShader()` 注入。這個 shader 已經支援非 instanced 的路徑，用 `uSwimPhase`、`uSwimFreq`、`uSwimAmp` uniform。`FishRenderer.sync` 遇到 `groups[item.variant]` 不存在的魚會直接略過。
- 模擬：`Fish` 有 `id`、`variant`、`scale`、`mode` 等欄位；`stepSchool` 和 `GrabController` 不在乎魚的外觀。
- UI：開場畫面（`src/ui/onboarding.ts`）是純 DOM 疊加，失敗提示在右下角。
- 測試在 node 環境（Vitest），沒有 DOM、Canvas、IndexedDB；Codex 沙盒沒有網路，不能新增套件。
- 角色分工：Codex 實作，Claude 驗收；DOM 與畫面效果由 Claude 截圖驗收。

## Goals / Non-Goals

**Goals：**
- 畫布輪廓和魚缸中魚的側面完全一致，畫在哪裡，魚身上就出現在哪裡。
- 畫圖、遮罩、復原、儲存、生成與刪除的邏輯都寫成純函式，或透過可注入的介面，能在 node 測試。
- 20 隻自訂魚時，fps 仍然和沒有自訂魚時相近。

**Non-Goals：**
- 多種模板。資料模型保留 `template` 欄位，但只實作 `default`。
- 重新編輯已存的魚。
- 筆壓、透明度、圖層、填色桶。
- 在 node 裡測真正的 IndexedDB。

## Decisions

### D1. 模板與側面投影 UV：都由同一份魚幾何導出

- **側面投影**：把魚幾何的每個頂點投影到 xy 平面（丟掉 z），用固定的包圍框正規化成 UV：
  - `u = (x - FRAME.minX) / (FRAME.maxX - FRAME.minX)`
  - `v = (y - FRAME.minY) / (FRAME.maxY - FRAME.minY)`
  - `FRAME` 由幾何的 xy 包圍框加一點邊距算出，放在 `CUSTOM_FISH_PARAMS`。
  - `createFishGeometry()` 加上 `uv` 屬性。一般魚不使用 UV，不受影響。
- **兩側共用**：左右兩側的頂點 xy 相同，所以 UV 相同，另一側自然左右相反，這是預期行為。
- **畫布輪廓**：純函式 `fishSilhouetteTriangles()` 回傳所有三角形投影到 UV 空間後的座標。DOM 層把這些三角形填滿，畫在一張離屏 canvas 上當遮罩，並描出外框當輪廓線。這樣遮罩和魚身完全一致，以後換模板也只要換幾何。
- **畫布與貼圖尺寸**：貼圖 512×256（2:1）。顯示用的畫布依視窗縮放，但內部永遠以 512×256 繪製。筆畫座標存成 0..1 的正規化值，和顯示尺寸無關。
- **選擇理由**：另一個做法是手動畫一個輪廓 SVG。但那樣很容易和 3D 魚身對不上，所以不採用。

### D2. 畫圖模型：筆畫清單（純邏輯，`src/drawing/`）

```ts
interface Stroke { color: number | 'erase'; size: 'small' | 'medium' | 'large'; points: { u: number; v: number }[] }
interface Drawing { template: 'default'; base: number; strokes: Stroke[] }
```

- 畫一筆就是 `beginStroke`、`extendStroke`、`endStroke`。復原就是移除最後一筆，最多保留 50 筆可復原。超過時，把最舊的筆畫合併成一張點陣底圖，以免記憶體無限增加。
- 清除也算一個動作，可以被復原。這是額外的貼心設計，spec 沒有要求。
- **繪製**：DOM 層依序把筆畫畫上去：
  - 先填底色，再用 `lineJoin/lineCap = round` 畫每一筆的折線。
  - 每段都用直線連起來，所以快速移動也連續。
  - 橡皮擦等於用底色畫。
  - 最後用遮罩以 `destination-in` 裁掉輪廓外的部分。
- **筆刷大小**：小 6 px、中 14 px、大 28 px，以 512 寬為基準，放在 params。
- **色票**：`PALETTE.brush` 10 色 Cozy 低飽和色，再加一個白色和一個深色描邊色。底色 `PALETTE.customFishBase`。
- **純函式可測**：筆畫的增減、復原與清除，以及點的插值（太遠的兩點中間補點，防止極端情況）。

### D3. 輸入：Pointer Events

- 畫布設定 `touch-action: none`，用 `pointerdown`、`pointermove`、`pointerup` 和 `setPointerCapture`，所以滑鼠和觸控用同一套程式。
- 用 `getCoalescedEvents()` 補點，讓快速移動時更平滑。
- 只處理主要指標，第二根手指忽略。
- 面板是疊加在魚缸上的 DOM。面板上的指標事件不會傳到魚缸 canvas 的 `PointerProvider`，作法和開場畫面一樣，用 `stopPropagation`。

### D4. 自訂魚的渲染：每隻一個 Mesh，加上色階化 shader

- 新增 `CustomFishRenderer`（`src/render/fish/custom-fish-renderer.ts`）。每隻自訂魚一個 `Mesh`，所有魚共用同一份加了 UV 的幾何。
- 每隻魚有自己的 `MeshLambertMaterial({ flatShading: true, map })`，`map` 是由 PNG 建立的 `Texture`，`colorSpace` 為 sRGB。
- 擺尾套用 `applySwimShader()` 的非 instanced 路徑，每幀更新該材質的 `uSwimPhase`、`uSwimFreq`、`uSwimAmp`，計算方式和 `FishRenderer` 相同。共用的計算抽成純函式，兩邊一起用，避免公式不一致。
- **色階化**：在 fragment shader 的 `map_fragment` 之後，把貼圖顏色量化成每個頻道 `levels` 階（預設 6），再和原色混合（`mix(orig, quantized, strength)`，預設 strength 0.6）。光照仍由 Lambert 和平面著色處理，所以保留稜面明暗。參數放在 `CUSTOM_FISH_PARAMS`。
- 驚慌時的抖動與偏擺，和一般魚使用同一套計算，抽成共用函式。
- **選擇理由**：最多 20 隻，就是 20 個 draw call，成本很低。如果用 `InstancedMesh` 加上 `DataArrayTexture`，要處理圖層配置和重新上傳，太複雜。如果之後上限大幅提高，再考慮改用 texture array。

### D5. 模擬整合

- `Fish` 加上 `customId?: string`。自訂魚的 `variant` 設為 `-1`，`FishRenderer` 會略過，由 `CustomFishRenderer` 依 `customId` 渲染。
- **生成**：`spawnCustomFish(record, bounds, random, nextId)` 是純函式。
  - 位置在魚缸中央附近，加上小幅亂數。
  - 方向是隨機的水平方向，速度是 `maxSpeed`。
  - `scale` 固定為 `CUSTOM_FISH_PARAMS.scale`（預設 1.2），讓手繪花紋看得清楚。
  - 「先往前游一小段」靠初速自然達成，不另外寫狀態。
- `id` 從目前最大 id 加 1 開始。所有亂數都用 `core/random`。
- **刪除**：`removeCustomFish(fish, customId)` 從陣列移除那隻魚。如果牠正被抓住，`GrabController` 在下一幀會發現魚不在陣列中並自動放開；這個行為已經存在，要加測試確認。
- 啟動時，從儲存中依 `createdAt` 排序後一隻一隻生成。

### D6. 抓取暫停

- `GrabController.setEnabled(enabled: boolean)`：
  - 停用時放開目前抓住的魚，照常進入 fleeing，逃走方向依最後的游標位置。
  - 停用期間忽略所有新的按下。
  - 重新啟用時，把「上一幀已按下」的記錄設為目前狀態，避免啟用那一刻被當成剛按下而誤抓。
- 面板或清單開啟時停用，關閉後啟用。

### D7. 儲存：可注入的 `CustomFishStore`

```ts
interface CustomFishRecord { id: string; createdAt: number; template: 'default'; png: Blob }
interface CustomFishStore { list(): Promise<CustomFishRecord[]>; add(r: CustomFishRecord): Promise<void>; remove(id: string): Promise<void> }
```

- `IndexedDbStore`：資料庫 `ai-aquarium`，版本 1，object store `customFish`，keyPath 為 `id`。只在瀏覽器使用。
- `MemoryStore`：在 node 測試中使用，也作為瀏覽器的備援。
- 開啟 IndexedDB 失敗、拋錯，或 `indexedDB` 不存在時，改用 `MemoryStore`，並記錄「目前無法保存」。之後每次新增魚，都顯示「這隻魚不會被保存」的提示。
- 新增時如果寫入失敗，魚照樣加入魚缸，並顯示同樣的提示。
- 上限檢查在加入之前做，以「目前魚缸中的自訂魚數量」為準，上限是 `CUSTOM_FISH_PARAMS.maxCount = 20`。
- `id` 用 `crypto.randomUUID()`。在 node 測試中注入產生器。
- 不用 fake-indexeddb，因為不能新增套件；IndexedDB 的實際行為由 Claude 在瀏覽器驗收。

### D8. UI 版面

- 右上角兩個圓角小按鈕：「畫一隻魚」和「我的魚（n/20）」，Cozy 卡片風格。開場畫面關閉後才顯示。
- **畫圖面板**：
  - 置中的圓角半透明卡片。
  - 畫布在上，工具列在下：色票、筆刷大小、橡皮擦、復原、清除，再加上「取消」和「放進魚缸」。
  - 手機寬度時，工具列可以換行，畫布寬度等於卡片寬度。
- **我的魚清單**：卡片中排列縮圖，每張下面有刪除按鈕。刪除前用面板內的確認列再確認一次，不用 `window.confirm`。
- 縮圖直接用存下來的 PNG，疊上輪廓線。
- 提示沿用開場畫面右下角的小提示框樣式。把它抽成共用的 `showNotice()`，開場畫面也改用它。

### D9. 檔案結構

```
src/drawing/
  fish-template.ts      # FRAME、fishSilhouetteTriangles、xy→uv（純函式）
  drawing-model.ts      # Stroke/Drawing、復原、清除、插值（純函式）
src/storage/
  custom-fish-store.ts  # 介面、MemoryStore、IndexedDbStore、createStore（失敗退回）
src/simulation/
  custom-fish.ts        # spawnCustomFish、removeCustomFish（純函式）
src/render/fish/
  custom-fish-renderer.ts
  posterize-shader.ts
  swim-pose.ts          # 從 FishRenderer 抽出的共用姿態、擺尾與驚慌計算
src/ui/
  drawing-panel.ts      # DOM：畫布、工具列
  my-fish-panel.ts      # DOM：縮圖清單、刪除
  notice.ts             # 共用提示框
```

### D10. 驗收方式

- **node 測試**：
  - UV 與輪廓（輪廓三角形的 UV 在 0..1 內，頭尾和背鰭的位置正確）。
  - 筆畫模型。
  - `MemoryStore` 與 `createStore` 的失敗退回（注入一個會拋錯的工廠）。
  - 上限檢查、生成與刪除。
  - 抓取暫停。
  - 共用擺尾計算和原本 `FishRenderer` 的結果相同。
- **Claude 截圖驗收**：
  - 開啟面板、畫一條橫跨中央的條紋、放進魚缸，確認魚身側面中央出現條紋。
  - 重新整理後魚還在、刪除、達到上限。
  - 面板開啟時不能抓魚。
  - 用模擬的 IndexedDB 失敗確認提示。
  - 20 隻自訂魚時的 fps。

## Risks / Trade-offs

- **胸鰭蓋住身體花紋**：胸鰭也用同一個側面投影，所以會顯示身體同位置的花紋。花紋看起來會延續到鰭上，可以接受。
- **兩側左右相反**：寫字會在另一側反過來。這已經寫進 proposal 和 spec，是已知的限制。
- **非常細的筆畫在色階化後可能變淡**：strength 預設 0.6，保留大部分原色，可以調整。
- **IndexedDB 在某些無痕模式不可用**：已經有記憶體備援和提示。
- **畫布縮放造成座標誤差**：筆畫座標用正規化值存，顯示尺寸改變不影響內容。
