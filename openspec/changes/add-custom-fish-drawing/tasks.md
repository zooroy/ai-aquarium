# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。型別與檔案位置以 design.md D2、D5、D7、D9 為準。不新增 npm 套件。

## 1. 模板、UV 與畫圖模型（純邏輯）

- [x] 1.1 實作 `src/drawing/fish-template.ts`（D1）：由魚的幾何算出 `FRAME`、`xyToUv()`、`fishSilhouetteTriangles()`；在 `createFishGeometry()` 加上 `uv` 屬性；`CUSTOM_FISH_PARAMS` 加入 FRAME 邊距與貼圖尺寸。驗證方式：
  - 單元測試確認所有頂點的 UV 都在 0..1 內。
  - 頭部（+x）的 u 大於尾部，背鰭頂端的 v 最大。
  - 左右兩側對應頂點的 UV 相同。
  - 輪廓三角形的總面積大於 0，而且都在 0..1 內。
  - 既有的魚幾何測試仍然通過。
- [x] 1.2 實作 `src/drawing/drawing-model.ts`（D2）：筆畫的新增、延伸、結束，復原（至少 20 筆，上限 50 筆後合併），清除（可復原），以及遠距點插值；在 params 和 palette 加入筆刷大小、`PALETTE.brush`（10～12 色）、`PALETTE.customFishBase`。驗證方式：單元測試涵蓋 fish-drawing spec 的復原與清除情境、插值後相鄰點的距離不超過筆刷半徑、超過上限時的合併行為。

## 2. 儲存與模擬

- [ ] 2.1 實作 `src/storage/custom-fish-store.ts`（D7）：介面、`MemoryStore`、`IndexedDbStore`、`createStore()`（失敗時退回記憶體，並回報「無法保存」）。驗證方式：
  - 單元測試涵蓋 `MemoryStore` 的新增、列出（依 createdAt 排序）、刪除。
  - `createStore()` 在注入的工廠拋錯，或 `indexedDB` 不存在時，退回 `MemoryStore`，且 `persistent === false`。
  - `IndexedDbStore` 只需要 typecheck 與 build 通過，由 Claude 在瀏覽器驗收。
- [ ] 2.2 實作 `src/simulation/custom-fish.ts`（D5）：`Fish.customId`、`spawnCustomFish()`、`removeCustomFish()`，以及上限檢查函式。驗證方式：
  - 單元測試確認生成的魚在魚缸中央附近，速度為 `maxSpeed`，`variant` 為 -1，id 不重複。
  - 刪除後陣列少一隻。
  - 刪除被抓住的魚後，`GrabController` 下一幀會放開而且不會出錯。
  - 第 21 隻會被上限擋下。
  - 既有的 boids 測試全部通過。
- [ ] 2.3 在 `GrabController` 加入 `setEnabled()`（D6）。驗證方式：單元測試涵蓋 fish-grab spec「畫圖時暫停抓取」的兩個情境，以及重新啟用的那一刻，已經按住的游標不會誤抓。

## 3. 自訂魚渲染

- [ ] 3.1 把 `FishRenderer` 裡每隻魚的姿態、擺尾頻率與幅度、驚慌抖動與偏擺計算，抽成 `src/render/fish/swim-pose.ts` 的純函式，`FishRenderer` 改用它（D4）。驗證方式：既有的 `FishRenderer` 測試全部通過，並新增測試確認抽出的函式和原本的輸出相同。
- [ ] 3.2 實作 `posterize-shader.ts` 與 `CustomFishRenderer`（D4）：每隻魚一個 Mesh，共用 UV 幾何；每隻魚的材質有自己的 map 和擺尾 uniform；在 map 之後做色階化（`levels`、`strength` 參數）；提供 `add(customId, texture)`、`remove(customId)`、`sync(fish, time)`、`dispose()`。驗證方式：
  - 單元測試確認 `sync` 只處理有 `customId` 的魚。
  - 擺尾 uniform 和 swim-pose 的計算一致。
  - `remove` 會釋放 geometry 以外的材質與貼圖。
  - shader 字串含有色階化的片段。
  - build 成功。

## 4. 介面與整合

- [ ] 4.1 實作 `src/ui/notice.ts`（共用的右下角提示框），開場畫面改用它（D8）。驗證方式：既有的開場畫面測試全部通過。
- [ ] 4.2 實作 `src/ui/drawing-panel.ts`（D2、D3、D8）：用輪廓三角形畫遮罩與輪廓線；色票、筆刷大小、橡皮擦、復原、清除；Pointer Events 加上 coalesced events；`touch-action: none`；「取消」與「放進魚缸」（輸出 512×256 PNG Blob）；面板事件不傳到魚缸。驗證方式：把 DOM 以外可以測的部分（筆刷像素大小換算、正規化座標換算）寫單元測試；build 成功；外觀由 Claude 截圖驗收。
- [ ] 4.3 實作 `src/ui/my-fish-panel.ts`（D8）：縮圖清單、目前數量（n/20）、刪除前在面板內確認。驗證方式：build 成功；由 Claude 截圖驗收。
- [ ] 4.4 在 `app.ts` 整合（D5～D8）：
  - 開場畫面關閉後，顯示「畫一隻魚」和「我的魚」按鈕。
  - 啟動時從 store 載入並生成自訂魚。
  - 放進魚缸時，先檢查上限，再生成魚、寫入 store、建立貼圖。
  - 刪除時，同時從魚缸、renderer 和 store 移除。
  - 面板開啟時，停用抓取。
  - 無法保存時顯示提示。
  - 支援 `?handReplay` 和 `?debug`（overlay 加上自訂魚數量）。

  驗證方式：`npm test`、`npm run typecheck`、`npm run build` 都通過。

## 5. 驗收

- [ ] 5.1 **[Claude]** 畫圖與呈現：
  - 截圖確認面板、輪廓、色票的選取狀態。
  - 用模擬的指標事件畫一條橫跨魚身中央的紅色條紋和一筆畫出輪廓外的線，確認輪廓外沒有顏色。
  - 復原與清除。
  - 放進魚缸後，確認魚的側面中央有條紋，而且有稜面明暗。
- [ ] 5.2 **[Claude]** 保存與管理：
  - 重新整理後魚還在。
  - 在清單中刪除，重新整理後也不會出現。
  - 用 IndexedDB 內容模擬 20 隻，確認達到上限的提示。
  - 用 `initScript` 讓 `indexedDB.open` 失敗，確認「不會被保存」的提示，且主控台沒有未處理的錯誤。
- [ ] 5.3 **[Claude]** 互動與效能：
  - 面板開啟時不能抓魚，關閉後可以。
  - 自訂魚可以被抓起、驚慌、逃走。
  - 20 隻自訂魚、1920×1080 下量 30 秒，fps 和沒有自訂魚時相差不超過 10%。
- [ ] 5.4 **[User]** 實際畫幾隻魚：回饋畫筆手感、色票、筆刷大小、色階化強度，以及魚在魚缸中的樣子。Claude 依回饋調整參數。

## Workflow follow-up

- 全部驗收通過後，commit，再執行 `/openspec-archive-change` 封存，並同步 spec。
