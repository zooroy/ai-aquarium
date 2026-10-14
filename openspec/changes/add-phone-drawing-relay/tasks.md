# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。型別、路由與檔案位置以 design.md 為準。Codex 不新增 npm 套件；需要的套件由 Claude 在 0.1 先裝好。

## 0. 準備

- [x] 0.1 **[Claude]** （已被 0.2 取代）安裝 `uqr`、`wrangler` 和 workers-types，並加入 Cloudflare 的設定。
- [x] 0.2 **[Claude]** 改用 GitHub Pages + Supabase 的準備工作（design D1、D7）：
  - 移除 Cloudflare 相關的檔案、套件與 scripts。
  - 安裝 `@electric-sql/pglite`（devDependencies），版本固定。
  - `vite.config.ts` 加上 `base`。
  - 新增 `.env.example`；`.gitignore` 加上 `.env.local`。

  驗證方式：`npm run typecheck`、`npm test`、`npm run build` 都通過。

## 1. 後端轉交（SQL）

- [x] 1.1 **[Claude]** （已被 1.2 取代）Cloudflare Worker 版的轉交 API。
- [x] 1.2 撰寫 `supabase/migrations/0001_fish_relay.sql` 與 `0002_fish_relay_cron.sql`（D2）。驗證方式：寫單元測試 `tests/supabase/fish-relay.test.ts`，用 PGlite 執行 0001；測試前先建立 `anon` 角色，並以 `set role anon` 呼叫函式。涵蓋 fish-relay spec 的每個情境：
  - 房間互相隔離。
  - 房間代碼格式錯誤時回報 `invalid-room`。
  - 正確的 PNG 回傳 id，查詢得到。
  - JPEG、尺寸錯誤、超過 512 KB、base64 格式錯誤都被拒絕，而且沒有寫入資料。
  - 第 21 隻回報 `room-full`。
  - 查詢結果由舊到新。
  - 下載、刪除後查詢不到；刪除不存在的魚不會出錯。
  - 把 `created_at` 改成 25 小時前之後，查詢不到，已被刪除，也不計入待領數量。
  - `anon` 直接 `select` 資料表會被拒絕。
  - SQL 裡的常數和 `RELAY_PARAMS` 一致。

## 2. 前端轉交模組（純邏輯）

- [x] 2.1 實作 `src/core/device-mode.ts`（D3）和 `DEVICE_PARAMS`。驗證方式：單元測試涵蓋：
  - iPhone（觸控、短邊 390）為 draw。
  - iPad（觸控、短邊 820）為 tank。
  - 桌電（非觸控、短邊 1080）為 tank。
  - 網址參數 `mode=draw` 和 `mode=tank` 優先；無效的參數值被忽略。
- [x] 2.2 實作 `src/relay/room-code.ts`（D5）。驗證方式：單元測試涵蓋：
  - 16 bytes 轉成 22 字元的 base64url。
  - `isRoomCode` 的正反例。
  - storage 已有合法代碼時沿用；沒有或不合法時產生新的並寫回。
  - storage 讀寫會丟錯時，仍回傳合法的暫時代碼。
- [x] 2.3 實作 `src/relay/relay-client.ts`（Cloudflare 版，已被 2.5 取代）。
- [x] 2.5 把 `relay-client.ts` 改成呼叫 Supabase 的 RPC（D5），並把資源路徑改用 `BASE_URL`（D7）。驗證方式：用假的 `fetch` 寫單元測試，涵蓋：
  - upload 的成功、`room-full`、`invalid-image`、500 和 TypeError 分別對應的結果。
  - 每個呼叫的網址、headers 與 JSON body 正確。
  - Blob 和 base64 互轉後內容相同。
  - 非 2xx 或 `download` 回傳 null 時丟錯。
  - 缺少環境變數時，`createRelayClientFromEnv()` 回傳 `undefined`，手機頁和魚缸都能正常處理。
- [x] 2.4 實作 `src/relay/fish-inbox.ts`（D5）。驗證方式：用假的 client 和計時器寫單元測試：
  - `placed` 和 `invalid` 會呼叫 remove。
  - 遇到 `full` 時停止這一輪、不呼叫 remove，並呼叫 `onWaiting(true)`；下一輪沒有 `full` 時呼叫 `onWaiting(false)`。
  - list 或 download 丟錯時，排程仍然繼續。
  - 上一輪還沒結束時不會開始下一輪。
  - 頁面不可見時不查詢。
  - `stop()` 之後不再查詢。

## 3. 畫圖編輯器與手機頁

- [x] 3.1 從 `drawing-panel.ts` 抽出 `src/ui/drawing-editor.ts`（D4），`drawing-panel.ts` 改用它，桌電的行為不變。驗證方式：typecheck 和 build 通過；由 Claude 在瀏覽器確認桌電畫圖面板的畫、復原、清除、取消、放進魚缸都和之前相同。
- [x] 3.2 實作 `src/phone/phone-page.ts`（D4），把 `main.ts` 改成依 `resolveDeviceMode` 動態載入（D3）。畫圖頁要涵蓋以下狀態：
  - 沒有房間代碼時的說明。
  - 編輯中、送出中、成功、失敗（分成離線、房間已滿、其他）。

  驗證方式：typecheck 和 build 通過，build 後手機頁與魚缸是不同的 chunk；由 Claude 用 390×844 的手機模擬截圖驗收。

## 4. 桌電配對與接收

- [x] 4.1 實作 `src/ui/phone-pair-panel.ts`，並在 `fish-menu` 加上「用手機畫」按鈕（D6）。驗證方式：typecheck 和 build 通過；由 Claude 截圖，並確認 QR code 能被手機掃描。
- [x] 4.2 在 `custom-fish-feature.ts` 加入 `receive(id, png)` 與 inbox 整合，包括收到時的提示和等待中的提示（D5）。驗證方式：
  - 單元測試或可注入的測試，涵蓋 `receive` 的四種情況：重複 id、已滿、解碼失敗、成功。
  - 等待中的提示從無變有時只出現一次。
  - typecheck 和 build 通過。

## 5. 驗收與部署

- [x] 5.1 **[Claude]** 本機端到端驗收（Cloudflare 版，用 wrangler dev）：
  - 送魚、收魚、重新整理不重複。
  - 已滿時等待，刪除一隻後等待的魚會進來。
  - 後端斷線時魚缸照常運作。
  - 手機頁沒有載入魚缸的檔案。
  - 桌電畫圖面板的行為不變。
- [ ] 5.2 **[User]** 註冊 Supabase，建立免費專案，提供 Project URL 和 anon key；如果要用 CLI 套用 SQL，執行 `! npx supabase login`。
- [x] 5.3 **[Claude]** 套用 migration 並啟用 pg_cron，寫入 `.env.local`，然後用真正的 Supabase 重做一次 5.1 的送魚、收魚、已滿、離線檢查。
- [x] 5.4 **[Claude]** 建立公開 repo `zooroy/ai-aquarium`，設定 Actions variables，開啟 Pages，push 後確認 Actions 成功。用 `https://zooroy.github.io/ai-aquarium/` 驗收：
  - 魚缸、相機（HTTPS）、手模型都正常。
  - 手機頁正常。
- [ ] 5.5 **[User]** 用真的 iPhone 掃描 QR code，畫一隻魚送出，桌電收到。
