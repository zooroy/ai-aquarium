# Design

## Context

- 入口：`src/main.ts` 靜態 import `App`，一載入就建立 Three.js 場景。`index.html` 只有一個 `#aquarium` canvas，`html, body` 設為 `overflow: hidden`。
- 畫圖：
  - `src/ui/drawing-panel.ts` 把畫布、工具列和按鈕寫在同一個函式裡，固定包在 `createLayer()` 的疊加卡片中，沒辦法單獨拿出畫布和工具。
  - `src/drawing/*` 和 `src/ui/fish-canvas.ts` 是純邏輯或 Canvas 2D。不過 `fish-template.ts` 用了 Three.js 的 `Vector3` 和魚的頂點資料，手機頁也會載入這一小部分 Three.js 數學程式；這是可以接受的。
- 自訂魚：
  - `src/ui/custom-fish-feature.ts` 的 `place(record)` 負責解碼 PNG、建立貼圖、生成模擬魚，並用 `loaded` Map 防止重複。
  - `add(png)` 負責新魚的保存與提示。
  - `CustomFishRecord.id` 是字串，沒有格式限制。
- 建置：沒有 `vite.config.ts`，只有 `vitest.config.ts`（node 環境）。`dist` 約 45 MB，其中最大的檔案是 MediaPipe wasm，約 12 MB。
- 工作限制：Codex 沙盒沒有網路，不能安裝套件，也不能登入 Cloudflare。新套件由 Claude 先裝好；部署與 R2 設定需要使用者的帳號。

## Goals / Non-Goals

**Goals：**
- 手機開啟時只下載畫圖頁需要的程式，不載入 `App`、MediaPipe、手部模型或環境模組。
- 後端邏輯寫成純函式，透過注入的儲存介面運作，可以在 node 用假的 bucket 測試，不需要 wrangler 或網路。
- 前端的轉交客戶端、輪詢和房間代碼也可以注入 `fetch`、計時器和 storage，在 node 測試。
- 桌電和手機共用同一份畫布與工具程式，避免兩邊行為不一致。

**Non-Goals：**
- 即時推播，例如 WebSocket 或 Durable Objects。輪詢的延遲已經足夠。
- 嚴格保證待領數量上限。同時上傳時可能短暫超過 20 隻，可以接受。
- 自訂網域。先用 `*.workers.dev`。
- 手機頁離線暫存或稍後自動重送。

## Decisions

### D1. 一個 Worker 同時提供網頁和 API

- 採用 Cloudflare Workers 的靜態資源功能，Cloudflare 目前建議用它取代 Pages。`wrangler.jsonc` 的設定如下：
  - `main: "worker/index.ts"`。
  - `assets: { directory: "./dist", run_worker_first: ["/api/*"] }`：只有 `/api/*` 會進入 Worker；其他請求直接由靜態資源回應，不計入 Worker 請求額度。
  - `r2_buckets: [{ binding: "FISH", bucket_name: "ai-aquarium-fish" }]`。
- 網頁和 API 同源，所以不需要 CORS，相機也有 HTTPS 可用。
- **選擇理由**：使用者選的是「Cloudflare（Pages + Workers + R2）」，重點是全部放在 Cloudflare。另一個做法是 Pages 加 Pages Functions，但那要維護兩套設定。單一 Worker 部署一個指令就完成，本機用 `wrangler dev` 也能完整模擬。

### D2. 後端：純函式 handler 加上注入的 bucket

```ts
// worker/relay.ts（只用標準 Request/Response，不依賴 workers-types）
export interface RelayBucket {
  put(key: string, body: ArrayBuffer): Promise<void>;
  get(key: string): Promise<{ body: ArrayBuffer } | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;   // 回傳完整 key，字典序
}
export function handleRelay(request: Request, bucket: RelayBucket, now: number): Promise<Response>;
```

- `worker/index.ts` 把 `env.FISH`（R2Bucket）包成 `RelayBucket`，再呼叫 `handleRelay`。只有這個檔案需要 `@cloudflare/workers-types`，型別檢查由 `worker/tsconfig.json` 獨立處理。
- **路由**：所有回應都帶 `Cache-Control: no-store`，錯誤回應的格式是 `{ error: string }`。

  | 方法與路徑 | 成功 | 失敗 |
  |---|---|---|
  | `POST /api/rooms/:room/fish`（body 是 PNG 原始位元組） | `201 { id }` | `400 invalid-room` / `400 invalid-image` / `413 too-large` / `429 room-full` |
  | `GET /api/rooms/:room/fish` | `200 { fish: [{ id }] }`，由舊到新 | `400 invalid-room` |
  | `GET /api/rooms/:room/fish/:id` | `200 image/png` | `404 not-found` |
  | `DELETE /api/rooms/:room/fish/:id` | `204`，不存在也回 204 | `400` |
  | 其他 `/api/*` 路徑 | | `404`；方法不符時回 `405` |

- **格式**：
  - 房間代碼：`^[A-Za-z0-9_-]{22}$`，即 16 bytes 的 base64url。
  - 魚的 id：`<13 位數毫秒時間>-<UUID>`。
  - key：`rooms/<room>/<id>.png`。

  因為時間是固定長度，字典序就是上傳順序。
- **PNG 驗證**：
  - 先看 `Content-Length`；超過 `RELAY_PARAMS.maxPngBytes`（512 KB）就直接回 413。讀出 body 後再檢查一次實際長度。
  - 前 8 bytes 必須是 PNG 簽章。第 12–15 bytes 必須是 `IHDR`，寬高從第 16–23 bytes 以 big-endian 讀出，必須是 512×256。
  - 不完整解碼圖片：桌電端解碼失敗時，會把那隻魚當成無效並刪除（見 D5）。
- **過期**：
  - `list` 時把 id 時間超過 `RELAY_PARAMS.expireMs`（24 小時）的 key 濾掉，並順便刪除。
  - 另外在 R2 設定生命週期規則，`rooms/` 前綴 1 天後過期，當作保險。
  - 上傳時計算的待領數量不包含已過期的 key。
- **選擇理由**：R2 可以直接用前綴列出某個房間的物件，不需要另外的索引。KV 的 list 和寫入免費額度太少；D1 對存圖片來說太麻煩。

### D3. 依裝置分流與程式分割

- `src/core/device-mode.ts`，純函式：

  ```ts
  export type DeviceMode = 'tank' | 'draw';
  export function resolveDeviceMode(input: { search: string; coarsePointer: boolean; screenShortSide: number }): DeviceMode;
  ```

  - 判斷順序：網址參數 `mode=draw` 或 `mode=tank` 優先。否則，`coarsePointer && screenShortSide < DEVICE_PARAMS.phoneMaxShortSide`（600）時為 `draw`，其他情況為 `tank`。
  - `main.ts` 用 `matchMedia('(pointer: coarse)').matches` 判斷觸控，用 `Math.min(screen.width, screen.height)` 取得螢幕短邊。iPad 的短邊至少 744，所以會顯示魚缸。
- `main.ts` 改成動態載入：
  - `tank` 模式：`import('./app')`，接著做 WebGL 檢查和建立 App，和原本相同。
  - `draw` 模式：`import('./phone/phone-page')`，移除 `#aquarium` canvas。
  - Vite 會自動把兩邊拆成不同的 chunk。
- **驗收方式**：用手機模擬開啟頁面，確認網路請求中沒有 `app` chunk、`hand_landmarker.task`、`.wasm` 或 `.glb`。

### D4. 畫圖編輯器抽成共用元件

- 新增 `src/ui/drawing-editor.ts`，從 `drawing-panel.ts` 搬出畫布、色票、筆刷、橡皮擦、復原、清除，以及指標事件處理：

  ```ts
  export function createDrawingEditor(): {
    element: HTMLElement;        // 畫布 + 色票列 + 工具列
    reset(): void;               // 新的空白畫布，保留上次的顏色
    exportPng(): Promise<Blob>;  // 會先結束進行中的筆畫
    dispose(): void;
  };
  ```

- `drawing-panel.ts` 改成用這個元件，再加上標題、說明、「取消」和「放進魚缸」。桌電的行為和現在完全相同。
- `src/phone/phone-page.ts` 也用這個元件，自己組版面：
  - 全螢幕容器，`overflow-y: auto`、`overflow-x: hidden`，背景用 Cozy 色。
  - 標題、說明、編輯器、「送進魚缸」按鈕。
  - 依狀態切換畫面：編輯中、送出中、成功（「再畫一隻」）、失敗（說明加「重試」），以及沒有房間代碼時的說明畫面。
  - 按鈕高度至少 44px，方便手指點。
- 手機上的色票和工具列會自動換行。畫布寬度是 100%，維持 2:1。

### D5. 前端轉交模組（`src/relay/`）

- `room-code.ts`：
  - `createRoomCode(bytes: Uint8Array): string`：把 16 bytes 轉成 base64url。
  - `isRoomCode(s)`。
  - `loadRoomCode(storage, randomBytes)`：從 `localStorage` 的 `ai-aquarium.roomCode` 讀取；沒有或格式不對就產生新的並寫回。讀寫都包在 try/catch 裡，失敗就回傳只用於這次瀏覽的暫時代碼。
  - **例外**：房間代碼的亂數用 `crypto.getRandomValues`，不用帶種子的 PRNG。這是安全需求：代碼必須無法預測，而且不能受 `?seed=` 影響。程式裡要加註解說明。
- `relay-client.ts`，`createRelayClient(fetchFn = fetch, base = '')`：
  - `upload(room, png)` 回傳 `{ ok: true; id } | { ok: false; reason: 'offline' | 'room-full' | 'invalid' | 'error' }`：
    - `fetch` 丟出 TypeError：`offline`。
    - 429：`room-full`。
    - 400 或 413：`invalid`。
    - 其他非 2xx：`error`。
  - `list(room): Promise<string[]>`、`download(room, id): Promise<Blob>`、`remove(room, id): Promise<void>`：失敗時丟錯，由呼叫端處理。
- `fish-inbox.ts`，`createFishInbox({ client, room, receive, isVisible, onWaiting, setTimer, clearTimer, intervalMs })`：
  - `receive(id, png)` 回傳 `'placed' | 'full' | 'invalid'`。
  - **每次查詢**：先 `list`，再依序處理每隻魚。
    - 下載後呼叫 `receive`。
    - `placed` 或 `invalid`：`remove`。
    - `full`：停止這一輪，並呼叫 `onWaiting(true)`。
    - 這一輪沒有遇到 `full`：呼叫 `onWaiting(false)`。
  - 下載失敗只略過那一隻魚。任何錯誤都只用 `console.warn` 記錄，排程一定會繼續。
  - 用 `setTimeout` 串接，不用 `setInterval`，確保上一輪結束才排下一輪。`isVisible()` 為 false 時跳過這一輪。頁面從隱藏變回可見時，立刻查詢一次。
- **整合**（`custom-fish-feature.ts`）：
  - 新增 `receive(id, png)`：
    - `loaded.has(id)`：直接回 `placed`，讓 inbox 刪除遠端，避免重複。
    - `!canAddCustomFish`：回 `full`。
    - 其他情況：用 `{ id, createdAt: Date.now(), template: 'default', png }` 呼叫 `place`。解碼失敗回 `invalid`。成功後保存到 store，失敗時沿用「不會被保存」的提示，然後顯示「收到一隻從手機來的魚！」，回 `placed`。
    - 用遠端 id 當作本機 record id。這樣即使保存成功、刪除遠端失敗，下次查詢時 `loaded.has` 也會擋掉重複。
  - `onWaiting(true)` 從 false 變成 true 時，顯示一次「有手機送來的魚在等待，請先在「我的魚」刪除一隻。」，不會每輪都跳。
  - inbox 在 `ready`（本機魚載入完成）之後才啟動，在 `dispose` 時停止。

### D6. QR code 面板

- 在選單的「我的魚」後面加上「用手機畫」按鈕。
- 新增 `src/ui/phone-pair-panel.ts`，使用 `createLayer` 卡片：
  - QR code：`uqr` 的 `renderSVG(url)`，寬度約 240px，白底，四周保留安靜區。
  - 說明：「用手機相機掃描，畫好的魚會游進這個魚缸。」
  - 縮短顯示的網址，方便沒有相機時手動輸入。
  - 「關閉」按鈕。
  - 透過 `openChanged` 和其他面板一樣暫停抓魚。
- 網址是 `${location.origin}/?mode=draw&room=<code>`。加上 `mode=draw`，iPad 掃描時也會開啟畫圖頁。
- **選擇理由**：`uqr` 沒有依賴，可以直接輸出 SVG。`qrcode` 套件比較大，而且要用 canvas。

### D7. 開發與部署流程

- 新增 `vite.config.ts`，設定 `server.proxy['/api'] = 'http://localhost:8787'`，對應 `wrangler dev` 的預設埠。Vitest 繼續用 `vitest.config.ts`。
- npm scripts：
  - `dev:worker`：`wrangler dev`。
  - `deploy`：`npm run build && wrangler deploy`。
  - `typecheck`：同時檢查前端 tsconfig 和 `worker/tsconfig.json`。
- `.gitignore` 加上 `.wrangler/`。
- 本機用真的手機測試：用 `npm run dev -- --host` 啟動，桌電用區網 IP 開啟，QR code 才會指向區網位址。這種方式只能用滑鼠模式，因為非 localhost 的 http 不能開相機。
- **參數**：放在 `src/config/params.ts`，Worker 也從這裡 import；params.ts 沒有任何 import，可以安全打包進 Worker。

  ```ts
  export const RELAY_PARAMS = { pollIntervalMs: 5000, maxPending: 20, maxPngBytes: 512 * 1024, expireMs: 24 * 60 * 60 * 1000, roomCodeBytes: 16 } as const;
  export const DEVICE_PARAMS = { phoneMaxShortSide: 600 } as const;
  ```

## Risks / Trade-offs

- [啟用 R2 可能要求綁定付款方式] → 在免費額度內（10 GB 儲存、每月 100 萬次 Class A 操作）不會收費。如果使用者不想綁卡，可以改用 Durable Objects 的 SQLite 儲存，但要修改這份 design。
- [輪詢的費用] → 一個魚缸每 5 秒查詢一次：Worker 請求每天 100k 的免費額度可支撐約 138 小時的開啟時間；R2 list 屬於 Class A 操作，每個魚缸每月約 50 萬次（每天開 8 小時）。頁面隱藏時會暫停查詢。魚缸數量變多時，再改用 Durable Objects 推播。
- [任何人拿到房間代碼都能送魚] → 代碼有 128 位元，無法猜到；每個房間最多 20 隻待領，每張圖最大 512 KB。QR code 外流的情況（例如直播畫面）不在這次範圍內，之後可以加「換一個代碼」。
- [同時上傳時可能超過 20 隻] → 最多超過幾隻，桌電端仍然受 20 隻上限保護，可以接受。
- [手機頁仍載入少量 Three.js 數學程式] → 透過 `fish-template` 載入，tree-shaking 後體積很小。驗收時確認手機頁沒有載入 `app` chunk。
- [MediaPipe wasm 約 12 MB] → 低於 Workers 靜態資源單檔 25 MiB 的限制。

## Migration Plan

1. 本機：`npm run dev` 加上 `npm run dev:worker`。`wrangler dev` 用本機模擬的 R2，不需要帳號。
2. 使用者一次性設定：
   - 執行 `! npx wrangler login`。
   - 在 Cloudflare 後台啟用 R2。
   - 建立 bucket：`npx wrangler r2 bucket create ai-aquarium-fish`。
   - 設定生命週期規則：`rooms/` 前綴 1 天過期。
3. 部署：`npm run deploy`，得到 `https://ai-aquarium.<帳號子網域>.workers.dev`。
4. **回滾**：`wrangler rollback`，或在後台切回前一版。本機 IndexedDB 的資料格式沒有變，不需要資料遷移。

## Open Questions

- 使用者的 Cloudflare 帳號是否已啟用 R2，部署時才需要確認，不影響實作。
