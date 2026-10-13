# Proposal

## Why

我們要打造一個網頁水族館：整個瀏覽器視窗是一座虛擬大魚缸，魚群自由游動，使用者可以用手勢捏住魚互動，也可以自己畫魚放進魚缸。專案目前是空的。這個 change 先建立所有後續功能都會依賴的基礎：Cozy Low Poly 3D 場景、會群游的魚，以及跟輸入來源無關的互動抽象層。

## 整體願景與分階段

| 階段 | Change | 內容 |
|---|---|---|
| ① | `add-aquarium-scene`（本 change） | Low Poly 場景、Boids 魚群、滑鼠輸入、`InputState` 抽象 |
| ② | `add-hand-gesture-grab`（後續） | 用 MediaPipe 追蹤手部；程序化 Low Poly 3D 手；捏住魚時魚驚慌抖動、跟著手移動，放開後逃走 |
| ③ | `add-custom-fish-drawing`（後續） | 提供魚的模板，在魚形畫布上用多色畫筆塗色；以側面投影 UV 貼到 Low Poly 魚身，並在 shader 裡做色階化；資料存進 IndexedDB |

已確定的全域決定：

- 魚缸是純虛擬場景，鏡頭只用來追蹤手，不顯示鏡頭畫面。
- 美術風格是 Cozy Low Poly 3D：flat shading、暖色粉彩、漸層霧。
- 只在單一裝置上執行，純前端，沒有後端。

## What Changes

- 建立前端專案骨架：Vite + TypeScript + Three.js，並附上可以執行的測試工具 Vitest。
- 全螢幕 Low Poly 魚缸場景：
  - 沙地地形、岩石、珊瑚、會擺動的水草、上升的氣泡
  - 半球光加一盞暖色方向光，再加上由近到遠的漸層霧
  - 沙地上有簡單的動態焦散光紋
- Low Poly 魚：
  - 在 vertex shader 裡讓魚身沿著身體軸向擺尾
  - 魚身在深度上分布，遠處的魚較小、被霧化
- Boids 群游：
  - 分離、對齊、聚合三條規則，加上漫遊和魚缸邊界迴避
  - 有群游數量上限，效能目標是 60fps
- 輸入抽象 `InputState`：
  - 所有輸入來源都轉成同一種結構，包含游標位置和是否按下或捏住；結構預留多個游標的空間
  - 本階段只實作滑鼠和觸控
  - 游標顯示成一個 Low Poly 小物件，魚會避開游標附近的區域
- 開發協作文件：在 design 和 tasks 裡寫清楚介面、目錄結構和每個任務的驗收標準，讓工程師代理不需要額外脈絡就能實作。

## 開發分工

- **Claude Code**：分析需求與設計架構、撰寫 OpenSpec 文件、拆解任務、透過 Herdr 指派給 Codex、審查程式碼與測試結果、驗收後安排下一個任務。不直接撰寫產品功能程式碼。
- **Codex（Engineer）**：依照 tasks 實作程式碼、建立元件、執行測試、修正 bug、回報結果。
- 視覺和動畫類的任務無法只靠單元測試驗收，會再搭配瀏覽器截圖驗收。

## Capabilities

### New Capabilities

- `aquarium-scene`：魚缸環境的呈現，包括場景構成、Low Poly 美術風格、光照、霧、焦散，以及水草、氣泡等環境動態效果，還有 RWD 全螢幕。
- `fish-schooling`：魚的群游行為與游動動畫，包括 Boids 規則、邊界迴避、數量上限、擺尾動畫，以及對游標的迴避反應。
- `interaction-input`：跟輸入來源無關的互動輸入抽象 `InputState`，包括滑鼠和觸控的實作，以及游標的呈現。階段 ② 的手勢會成為它的另一個輸入來源。

### Modified Capabilities

（無，專案目前沒有任何 spec）

## Impact

- **新增程式碼**：整個前端專案。目前倉庫裡只有 `openspec/` 和 `hello.txt`。
- **新增依賴**：`three`、`vite`、`typescript`、`vitest`。
- **對後續 change 的約束**：
  - `InputState` 的介面決定階段 ② 的手勢要怎麼接進來。
  - 魚的實體和 shader 結構決定階段 ③ 的自訂貼圖和色階化要怎麼套用。
  - 這兩個介面在 design.md 裡要先定案。
- **素材**：環境物件可以用 CC0 授權的 Low Poly 素材（Quaternius、Kenney、Poly Pizza），或用程式生成。魚的模板到階段 ③ 再自己製作。
- **非本次範圍**：手部追蹤、抓取和驚慌的狀態機、畫魚編輯器、資料保存。
