# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。型別、路由與檔案位置以 design.md 為準。Codex 不新增 npm 套件；需要的套件由 Claude 在 0.1 先裝好。

## 0. 準備

- [x] 0.1 **[Claude]** 安裝並設定以下項目：
  - 安裝 `uqr`（dependencies）、`wrangler` 和 `@cloudflare/workers-types`（devDependencies），版本固定。
  - 新增 `wrangler.jsonc`（D1）、`worker/tsconfig.json`、`vite.config.ts` 的 `/api` proxy（D7）。
  - 新增 npm scripts：`dev:worker`、`deploy`；`typecheck` 改成兩個 tsconfig 都檢查。
  - `.gitignore` 加上 `.wrangler/`。

  驗證方式：`npm run typecheck`、`npm test`、`npm run build` 都通過，`npx wrangler deploy --dry-run` 成功。

## 1. 後端轉交 API（純邏輯）

- [x] 1.1 實作 `worker/relay.ts` 的 `handleRelay` 與 `RelayBucket`（D2），以及 `worker/index.ts` 的 R2 轉接；在 params 加入 `RELAY_PARAMS`。驗證方式：用記憶體版的假 bucket 寫單元測試 `tests/worker/relay.test.ts`，涵蓋 fish-relay spec 的每個情境：
  - 房間互相隔離。
  - 房間代碼格式錯誤時回 400。
  - 正確的 PNG 回 201 加 id，查詢得到。
  - JPEG、尺寸錯誤、超過 512 KB 都被拒絕，而且沒有寫入資料。
  - 第 21 隻回 429 `room-full`。
  - 查詢結果由舊到新。
  - 下載、刪除後查詢不到；刪除不存在的魚回 204。
  - 注入的 `now` 超過 24 小時後，查詢不到，且已從 bucket 刪除；過期的魚不計入待領數量。
  - 未知路徑回 404，方法不符回 405，所有回應都有 `Cache-Control: no-store`。

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
- [x] 2.3 實作 `src/relay/relay-client.ts`（D5）。驗證方式：用假的 `fetch` 寫單元測試，涵蓋 upload 的 201、429、400、413、500 和 TypeError 分別對應的結果；list、download、remove 的網址與方法正確，非 2xx 時丟錯。
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

- [ ] 4.1 實作 `src/ui/phone-pair-panel.ts`，並在 `fish-menu` 加上「用手機畫」按鈕（D6）。驗證方式：typecheck 和 build 通過；由 Claude 截圖，並確認 QR code 能被手機掃描。
- [ ] 4.2 在 `custom-fish-feature.ts` 加入 `receive(id, png)` 與 inbox 整合，包括收到時的提示和等待中的提示（D5）。驗證方式：
  - 單元測試或可注入的測試，涵蓋 `receive` 的四種情況：重複 id、已滿、解碼失敗、成功。
  - 等待中的提示從無變有時只出現一次。
  - typecheck 和 build 通過。

## 5. 驗收與部署

- [ ] 5.1 **[Claude]** 本機端到端驗收，用 `npm run dev` 加上 `npm run dev:worker`：
  - 以手機模擬的分頁送魚，桌電分頁 10 秒內收到；重新整理後只有一隻。
  - 已滿 20 隻時的等待提示，刪除一隻後等待的魚會進來。
  - 關掉 worker 時，魚缸照常動，手機頁顯示離線說明。
  - 手機頁的網路請求中沒有 `app` chunk、`.wasm`、`.task` 或 `.glb`。
  - 桌電畫圖面板的行為和之前相同。
- [ ] 5.2 **[User]** 一次性的 Cloudflare 設定：
  - 執行 `! npx wrangler login`。
  - 在後台啟用 R2。
  - 由 Claude 協助建立 bucket 和生命週期規則。
- [ ] 5.3 **[Claude]** 執行 `npm run deploy`，用公開網址驗收：
  - 桌電開啟魚缸，相機可以使用（HTTPS）。
  - **[User]** 用真的 iPhone 掃描 QR code，畫一隻魚送出，桌電收到。
