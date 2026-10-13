# Tasks

> 派工單位：每個 `##` 群組是一次 Herdr 派工，由 Codex 實作。標示 **[Claude]** 的任務由 Claude 負責，屬於文件或驗收工作。
> 每個 Codex 任務完成時，必須回報 `npm test` 和 `npm run typecheck` 的完整輸出。介面以 design.md D3 為準，不可以自行修改；目錄結構以 D2 為準。

## 1. 專案骨架與協作文件

- [x] 1.1 **[Claude]** 撰寫 `AGENTS.md`：角色分工、開發指令、不可修改 `openspec/` 規劃文件、回報格式、D2 目錄規則。驗證方式：檔案存在，且內容涵蓋以上各點
- [x] 1.2 建立 Vite + TypeScript（strict）專案，加入依賴 `three`、`@types/three`、`simplex-noise`、`vitest`，並設定 `dev`、`build`、`test`、`typecheck` 四個 scripts。驗證方式：`npm run build`、`npm run typecheck` 成功，`npm test` 能執行（放一個冒煙測試）
- [x] 1.3 依 D2 建立目錄，並建立 `config/params.ts`、`config/palette.ts`，填入初始參數和 Cozy 色票。驗證方式：typecheck 通過

## 2. 核心工具（純 TS）

- [x] 2.1 實作 `core/random.ts`：mulberry32 PRNG，從網址的 `?seed=` 讀取種子，沒有種子時隨機產生。驗證方式：單元測試確認同一個種子產生相同序列，且數值落在 [0,1)
- [x] 2.2 實作 `core/tank-bounds.ts`：依相機 FOV、位置與視窗長寬比計算可游動範圍（D5）。驗證方式：單元測試涵蓋橫向和直向兩種長寬比，範圍隨長寬比改變，且 z 固定在 [-8, 3]

## 3. 輸入抽象（interaction-input）

- [x] 3.1 依照 D3 撰寫 `input/types.ts`，並實作 `input/input-manager.ts`，合併多個 provider 的游標。驗證方式：單元測試涵蓋沒有 provider 時沒有游標、多個 provider 的游標會合併，以及註冊假 provider 的情境
- [x] 3.2 實作 `input/pointer-provider.ts`，用 Pointer Events 處理滑鼠與觸控，包含座標正規化、按下狀態、`pointerleave`／`pointerup`／`pointercancel` 時移除游標，並設定 `touch-action: none` 和 `cursor: none`。驗證方式：單元測試用模擬事件涵蓋 spec 中滑鼠與觸控的所有情境，包括 1000x500 視窗的 (250,125) 換算成 (0.25,0.25)

## 4. 魚群模擬（fish-schooling 邏輯）

- [x] 4.1 實作 `simulation/fish-state.ts`，以及用帶種子亂數產生初始魚群的函式（預設 60 隻，分布在範圍內）。驗證方式：單元測試確認數量正確，且所有位置都在範圍內
- [x] 4.2 實作 `simulation/spatial-grid.ts`。驗證方式：單元測試確認鄰居查詢結果和暴力法一致
- [x] 4.3 實作 `simulation/boids.ts`：分離、對齊、聚合、漫遊、軟邊界、轉向力上限、速度上下限、平順朝向（D6）。驗證方式：單元測試涵蓋太近的兩隻魚距離會增加、固定種子跑 5 秒後方向差異變小、跑 2000 步都不出界、速度始終在範圍內、單幀轉角不超過 30 度
- [x] 4.4 實作 `simulation/cursor-avoidance.ts`，用注入的 `projectToScreen` 計算螢幕空間的迴避力。驗證方式：單元測試用正交投影，確認半徑內的魚往遠離游標的方向移動、半徑外的魚不受影響、沒有游標時沒有作用力

## 5. 渲染基礎與環境（aquarium-scene）

- [x] 5.1 實作 `render/renderer.ts`（全螢幕 canvas、相機、resize 時更新相機和魚缸範圍）、`main.ts` 的 WebGL 偵測與錯誤提示，以及 `app.ts` 主迴圈（D4，dt 上限 1/30）。驗證方式：`npm run dev` 開啟後畫面填滿視窗且沒有捲軸；停用 WebGL 時顯示說明文字；build 成功
- [x] 5.2 實作 `environment/lighting.ts`（半球光、暖色方向光、霧、背景色）和 `environment/sand.ts`（雜訊起伏，non-indexed，flat shading）。驗證方式：build 成功，並附上 `?seed=42` 的截圖回報
- [x] 5.3 實作岩石、珊瑚、水草（擺動 shader）、上升氣泡，分布在前景和背景（D8）。驗證方式：build 成功，並附上截圖回報
- [x] 5.4 實作 `environment/caustics.ts`：沙地上流動的焦散。驗證方式：build 成功，並附上相隔 2 秒的兩張截圖，可以看出光紋位置不同
- [x] 5.5 實作 `debug/fps-overlay.ts`，在網址帶 `?debug` 時顯示 fps。驗證方式：開 `?debug` 時能看到 fps 數字，沒帶時不顯示

## 6. 魚的渲染

- [x] 6.1 實作 `render/fish/fish-geometry.ts`：程序化 Low Poly 魚網格（D7，約 100～200 個三角形，頭朝 +X，身長 1）。驗證方式：單元測試確認三角形數量在範圍內、包圍盒的 x 長度約為 1、幾何是 non-indexed
- [x] 6.2 實作 `render/fish/swim-shader.ts`：`applySwimShader(material)`，以 instance 屬性傳入 phase 和 freq，擺動幅度由頭到尾遞增。驗證方式：typecheck 通過，並對一般 `Mesh` 和 `InstancedMesh` 都能套用（6.3 的截圖會一起驗證）
- [x] 6.3 實作 `render/fish/fish-renderer.ts`：至少三種配色的 `InstancedMesh`，每幀同步位置、朝向、縮放，擺尾頻率隨速度提高。驗證方式：build 成功，並附上截圖回報

- [x] 6.4 修正群游手感（6.3 截圖驗收時發現）：魚擠成重疊的密集球體、很多魚垂直游動。調整分離、聚合、漫遊的參數，並加入俯仰角上限，讓魚以水平游動為主。驗證方式：單元測試確認固定種子跑 10 秒後，最近鄰居的平均距離不小於設定值、所有魚的俯仰角都不超過上限；`?seed=42` 跑 10 秒後截圖，可以看到多個鬆散的小群，且魚以水平方向為主

## 7. 游標呈現與整合

- [x] 7.1 實作 `render/cursor-renderer.ts`：Low Poly 半透明多面體，反投影到 z = 2，按下時有放大和發光的補間動畫（D9）。驗證方式：build 成功，並附上按下前後的截圖
- [x] 7.2 在 `app.ts` 串起 input、simulation、render 的完整迴圈，`projectToScreen` 使用實際相機。驗證方式：`npm test`、`npm run typecheck`、`npm run build` 全部通過，並回報手動確認魚會避開滑鼠游標的結果

## 8. 整合驗收

- [x] 8.1 **[Claude]** 視覺驗收：開 `?seed=42` 截圖，逐一對照 `aquarium-scene` 和 `fish-schooling` spec 的情境（全螢幕、Low Poly 稜面、光照冷暖、霧、環境動態、配色多樣、擺尾）。不符合的項目開成修正任務，再派給 Codex
- [x] 8.2 **[Claude]** 互動驗收：用瀏覽器操作滑鼠，確認游標外觀、按下回饋、迴避和離開後恢復，並用觸控模擬確認兩指的情境
- [x] 8.3 **[Claude]** 效能驗收：開 `?debug`，在 1920x1080 下觀察 30 秒，平均至少 55 fps；如果不達標，調整 `params.ts` 或開成最佳化任務

## Workflow follow-up

- 全部驗收通過後，執行 `/openspec-archive-change` 封存這個 change，把 spec 同步到 `openspec/specs/`。
- 接著開始階段 ② `add-hand-gesture-grab` 的規劃。
