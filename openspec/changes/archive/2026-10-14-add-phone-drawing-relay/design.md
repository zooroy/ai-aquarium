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
- 工作限制：Codex 沙盒沒有網路，不能安裝套件，也不能登入外部服務。新套件由 Claude 先裝好；Supabase 專案和 GitHub repo 需要使用者的帳號。
- 資源路徑：MediaPipe 的 wasm 和模型（`HAND_PARAMS.wasmPath`、`modelPath`）以及手模型 GLB（`hand-avatar.ts`），都寫成 `/` 開頭的絕對路徑。GitHub Pages 的網站在子路徑 `/ai-aquarium/` 下，這些路徑都需要改。
- **後端的變更**：原本的計畫是 Cloudflare Workers + R2，並已完成實作（`worker/`、`wrangler.jsonc`）。但啟用 R2 需要綁定付款方式，所以改成 GitHub Pages + Supabase，Cloudflare 的部分全部移除。

## Goals / Non-Goals

**Goals：**
- 手機開啟時只下載畫圖頁需要的程式，不載入 `App`、MediaPipe、手部模型或環境模組。
- 後端邏輯全部寫在一份 SQL migration 裡，可以在 node 用 PGlite（WASM 版 Postgres）執行並測試，不需要網路或 Supabase 帳號。
- 前端的轉交客戶端、輪詢和房間代碼也可以注入 `fetch`、計時器和 storage，在 node 測試。
- 桌電和手機共用同一份畫布與工具程式，避免兩邊行為不一致。

**Non-Goals：**
- 即時推播，例如 WebSocket 或 Durable Objects。輪詢的延遲已經足夠。
- 嚴格保證待領數量上限。同時上傳時可能短暫超過 20 隻，可以接受。
- 自訂網域。先用 `zooroy.github.io/ai-aquarium/`。
- 本機跑一套 Supabase（需要 Docker）。本機開發直接連使用者的 Supabase 專案。
- 手機頁離線暫存或稍後自動重送。

## Decisions

### D1. GitHub Pages 放網頁，Supabase 放轉交資料

- **網頁**：
  - GitHub Actions 在 push 到 `main` 時執行 `npm ci` 和 `npm run build`，再用 `actions/upload-pages-artifact` 和 `actions/deploy-pages` 發布 `dist/`。
  - Vite 的 `base` 在正式建置時設為 `/ai-aquarium/`，由環境變數 `VITE_BASE` 決定，本機開發預設為 `/`。
- **Supabase 連線資訊**：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 在建置時注入。
  - 本機開發放在 `.env.local`，不 commit。
  - 正式部署放在 GitHub repo 的 Actions variables。
  - anon key 本來就設計成可以公開；安全性由資料庫權限保護（D2）。
- **選擇理由**：使用者選了 GitHub Pages + Supabase。前端只需要 3–4 個 REST 呼叫，直接用 `fetch` 呼叫 PostgREST 的 RPC 端點即可，不必裝 `supabase-js`（約 50 KB）。

### D2. 後端：資料表加上 security definer 函式（`supabase/migrations/0001_fish_relay.sql`）

- **資料表**：

  ```sql
  create table public.relay_fish (
    id uuid primary key default gen_random_uuid(),
    room text not null check (room ~ '^[A-Za-z0-9_-]{22}$'),
    png bytea not null,
    created_at timestamptz not null default now()
  );
  create index on public.relay_fish (room, created_at);
  ```

  資料表開啟 RLS，而且不建立任何 policy，並 `revoke all ... from anon, authenticated`。前端完全不能直接讀寫這張表，只能呼叫下列函式；所以前端無法列出所有房間。
- **函式**：都是 `security definer` 加上 `set search_path = ''`，只 `grant execute ... to anon`。錯誤一律用 `raise exception '<code>'`，PostgREST 會回 400，錯誤代碼放在 JSON 的 `message` 欄位。

  | 函式 | 回傳 | 錯誤代碼 |
  |---|---|---|
  | `relay_upload(p_room text, p_png text)`，`p_png` 是 base64 | `uuid` | `invalid-room`、`too-large`、`invalid-image`、`room-full` |
  | `relay_list(p_room text)` | `setof uuid`，由舊到新 | `invalid-room` |
  | `relay_get(p_room text, p_id uuid)` | `text`，即 base64；找不到時為 null | `invalid-room` |
  | `relay_delete(p_room text, p_id uuid)` | `void`，不存在也成功 | `invalid-room` |

- **驗證**：
  - 房間代碼：`^[A-Za-z0-9_-]{22}$`。
  - 大小：解碼後的位元組數不超過 524288（512 KB）。
  - PNG：前 8 bytes 是 PNG 簽章，第 12–15 bytes 是 `IHDR`，第 16–23 bytes 讀成 big-endian 的寬高，必須是 512×256。
  - 不完整解碼圖片：桌電端解碼失敗時，會把那隻魚當成無效並刪除（見 D5）。
  - base64 格式錯誤：`decode()` 會丟錯，函式捕捉後回報 `invalid-image`。
- **上限與過期**：
  - 所有函式都只看 `created_at > now() - interval '1 day'` 的資料列。
  - `relay_upload` 計算這個房間尚未過期的數量，達到 20 就回報 `room-full`。
  - `relay_list` 會順便刪除這個房間已過期的資料列。
  - 另外用 `pg_cron` 每小時執行一次 `delete ... where created_at < now() - interval '1 day'`，負責清掉沒人再查詢的房間。pg_cron 排程放在獨立的檔案 `0002_fish_relay_cron.sql`，因為 PGlite 沒有 pg_cron，測試只載入 0001。
- **常數**：20 隻、512 KB、1 天寫在 SQL 裡。`RELAY_PARAMS` 保留同樣的值給前端使用，兩邊要一致，測試會檢查。
- **選擇理由**：
  - 為什麼存成 bytea，不用 Supabase Storage：Storage 的權限是依路徑設定，要做到「只有知道房間代碼的人能存取」、同時「不能列出所有房間」比較麻煩；而且上傳和計數要分成多個請求，沒辦法在一個交易裡完成。用資料表加函式，驗證、計數和寫入都在同一個交易裡。
  - 為什麼傳 base64：PostgREST 的 RPC 只接受 JSON。圖片最大 512 KB，base64 後約 700 KB，可以接受。

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
- `relay-client.ts`，`createRelayClient({ url, anonKey, fetchFn = fetch })`：
  - 呼叫 `POST {url}/rest/v1/rpc/<函式>`，headers 帶 `apikey` 和 `Authorization: Bearer <anonKey>`，body 是 JSON。
  - Blob 和 base64 的轉換在客戶端內部處理。
  - `upload(room, png)` 回傳 `{ ok: true; id } | { ok: false; reason: 'offline' | 'room-full' | 'invalid' | 'error' }`：
    - `fetch` 丟出 TypeError：`offline`。
    - 錯誤 `message` 為 `room-full`：`room-full`。
    - `message` 為 `invalid-room`、`too-large` 或 `invalid-image`：`invalid`。
    - 其他情況：`error`。
  - `list(room): Promise<string[]>`、`download(room, id): Promise<Blob>`、`remove(room, id): Promise<void>`：失敗時丟錯，由呼叫端處理；`download` 的回傳值是 null 時也丟錯。
  - `createRelayClientFromEnv()`：讀取 `import.meta.env` 的兩個變數。缺少任一個時回傳 `undefined`；呼叫端會隱藏「用手機畫」、不啟動收件匣，手機頁則顯示「目前無法送出」。
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
- 網址是 `${location.origin}${import.meta.env.BASE_URL}?mode=draw&room=<code>`，例如 `https://zooroy.github.io/ai-aquarium/?mode=draw&room=…`。加上 `mode=draw`，iPad 掃描時也會開啟畫圖頁。
- **選擇理由**：`uqr` 沒有依賴，可以直接輸出 SVG。`qrcode` 套件比較大，而且要用 canvas。

### D7. 開發與部署流程

- 移除 `worker/`、`wrangler.jsonc`、`wrangler`、`@cloudflare/workers-types`、`dev:worker` 和 `deploy` script，以及 `vite.config.ts` 的 `/api` proxy。
- `vite.config.ts` 設定 `base: process.env.VITE_BASE ?? '/'`。
- 靜態資源路徑改用 `import.meta.env.BASE_URL` 組合，包括 MediaPipe 的 wasm 與模型、手模型 GLB。
- `.env.example` 列出 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`；`.env.local` 加入 `.gitignore`。
- 新增 `.github/workflows/pages.yml`：
  - 觸發條件：push 到 `main`，或手動執行。
  - 步驟：Node 22，`npm ci`，`npm test`，建置（設定 `VITE_BASE=/ai-aquarium/`，從 repo variables 讀入兩個 Supabase 變數），最後發布。
- 本機用真的手機測試：用 `npm run dev -- --host` 啟動，桌電用區網 IP 開啟。這種方式只能用滑鼠模式，因為非 localhost 的 http 不能開相機。
- **參數**：放在 `src/config/params.ts`。

  ```ts
  export const RELAY_PARAMS = { pollIntervalMs: 5000, maxPending: 20, maxPngBytes: 512 * 1024, expireMs: 24 * 60 * 60 * 1000, roomCodeBytes: 16 } as const;
  export const DEVICE_PARAMS = { phoneMaxShortSide: 600 } as const;
  ```

## Risks / Trade-offs

- [Supabase 免費專案一週沒有請求會暫停] → 魚缸開著時，每 5 秒的查詢就算活動。如果一週都沒人用，要到 Supabase 後台按 Restore。暫停期間魚缸照常運作，只是收不到手機的魚，手機頁會顯示送出失敗。
- [輪詢的用量] → Supabase 免費方案不限 API 請求次數，每月 egress 5 GB。查詢結果只有幾個 uuid，圖片只在領取時下載一次，用量很小。
- [anon key 是公開的] → 資料表不開放直接存取，只開放 4 個函式，而且每個都要帶房間代碼。代碼有 128 位元，無法猜到。每個房間最多 20 隻待領，每張圖最大 512 KB。
- [repo 公開] → 程式碼和資產任何人都看得到。repo 裡沒有任何密鑰：Supabase 的 URL 和 anon key 放在 Actions variables，`.env.local` 不 commit。
- [GitHub Pages 的子路徑] → 所有資源都用 `BASE_URL` 組合。驗收時在 `/ai-aquarium/` 下確認相機、手模型、手機頁都正常。
- [手機頁仍載入 three.core，壓縮後約 57 KB] → 透過 `fish-template` 載入。可以接受，之後再優化。
- [PGlite 和 Supabase 的 Postgres 版本不同] → migration 只用基本的 plpgsql 和內建函式，例如 `decode`、`get_byte`、`gen_random_uuid`。部署後再用真正的 Supabase 做一次端到端驗收。

## Migration Plan

1. 使用者在 supabase.com 免費註冊，建立專案（區域選 Northeast Asia (Tokyo)）。
2. 套用 SQL：
   - 有兩種方式：(a) 使用者把 `0001`、`0002` 貼到 SQL Editor 執行；(b) 使用者執行 `npx supabase login` 後，由 Claude 用 `npx supabase link` 加上 `db push` 套用。
   - 用 Dashboard 的 Database → Extensions 啟用 `pg_cron`。
3. 使用者提供 Project URL 和 anon key：由 Claude 寫入 `.env.local`，並設定為 GitHub repo variables。
4. Claude 執行 `gh repo create zooroy/ai-aquarium --public --source . --push`，再用 `gh api` 開啟 Pages，來源選 GitHub Actions。
5. **回滾**：
   - 網頁：revert commit 後重新 push。
   - 資料庫：資料表只存暫時資料，可以直接 drop。
   - 本機 IndexedDB 的資料格式沒有變。
