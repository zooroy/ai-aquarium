# Tasks

> 派工單位：每個 `##` 群組是一次 Herdr 派工，由 Codex 實作。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，必須回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。型別以 design.md D3、D5 為準；`src/input/types.ts` 不可以修改。

## 1. 依賴、資源與效能驗證

- [x] 1.1 **[Claude]** 安裝 `@mediapipe/tasks-vision@1.0.1`（固定版本），下載 float16 的 `hand_landmarker.task` 到 `public/mediapipe/`。驗證方式：`package.json` 的版本是固定值，模型檔存在且大小約 7～8 MB
- [x] 1.2 新增 `scripts/copy-mediapipe-wasm.mjs`，並設定 `predev`、`prebuild` scripts，把 WASM 複製到 `public/mediapipe/wasm/`，同時加進 `.gitignore`（D1）。驗證方式：`npm run build` 後 `dist/mediapipe/wasm/` 和模型檔都存在
- [x] 1.3 實作 `src/input/hand/types.ts`（D3）和 `src/input/hand/hand-tracker.ts`：初始化時先試 GPU、失敗改用 CPU，`detect(video, ts)` 回傳 `HandFrame | null`，並提供 `dispose()`。另外加一個暫時的除錯入口：網址帶 `?debug&camera` 時直接開鏡頭並持續偵測，overlay 顯示偵測更新率和每次偵測的耗時（D9）。驗證方式：typecheck 和 build 通過；node 測試涵蓋把 MediaPipe 結果轉成 `HandFrame` 的函式
- [x] 1.4 **[Claude]** 效能驗證：在 1920x1080 下用 `?debug&camera` 量 30 秒。fps 至少 45、偵測至少 20 Hz 就維持主執行緒；不達標時依 D9 的備案新增任務，並回報使用者

## 2. 手勢的純邏輯

- [x] 2.1 實作 `one-euro.ts`。驗證方式：單元測試確認靜止加雜訊的輸入，輸出變動幅度明顯變小；步階輸入在 150 ms 內收斂到 1% 以內
- [x] 2.2 實作 `pinch.ts`：`pinchRatio` 和有遲滯的 `PinchDetector`（D4）。驗證方式：單元測試涵蓋 hand-tracking spec 的捏合、門檻之間不跳動、放開，以及把手形等比例縮放（模擬遠近）時比例差異在 0.05 以內
- [x] 2.3 實作 `hand-mapping.ts`：鏡像，並把中央 70% 區域對應到 0..1 再夾住邊界。驗證方式：單元測試涵蓋鏡像方向、中央區域邊緣對應到畫面邊緣、超出範圍時被夾住
- [x] 2.4 實作 `replay-source.ts`：程序化的張開和捏合手形、依路徑移動、偵測不到手的時段，並內建 `demo`、`jitter`、`dropout` 三個腳本（D8）。驗證方式：單元測試確認捏合手形的 `pinchRatio` 小於 0.25、張開手形大於 0.40，且偵測不到手的時段輸出 null
- [x] 2.5 實作 `hand-provider.ts`：實作 `InputProvider`（游標 id 為 `hand-0`，source 為 `hand`），提供 `getHandPose()`，包含平滑、捏合判斷、座標對應、300 ms 寬限時間和 opacity 淡入淡出（D3、D4）。驗證方式：用 replay 來源做端到端測試，涵蓋 hand-tracking spec 的單手、鏡像、游標位置、捏合、平滑（手靜止時的變動小於 0.3%）、短暫偵測失敗和手移出鏡頭

## 3. 抓魚模擬

- [x] 3.1 在 `Fish` 加入 `mode`、`panic`、`fleeTime`，並讓 `createSchool` 給預設值；在 `params.ts` 加入 `GRAB_PARAMS`（D5）。驗證方式：既有測試全部通過
- [x] 3.2 實作 `src/simulation/grab.ts` 的 `GrabController`：偵測剛按下、在抓取半徑內選最近的魚、一次只抓一隻、跟隨（xy 0.1 秒、z 0.2 秒）、夾在範圍內、放開後逃走、游標消失時放開（D5）。驗證方式：單元測試涵蓋 fish-grab spec 的所有情境（包含按住後移動不會抓魚、兩個游標、拖到邊界外）
- [x] 3.3 修改 `stepSchool`：被抓住的魚跳過受力計算和速度限制，但仍參與其他魚的分離；逃走中的魚使用逐漸遞減的速度上限，並把 `panic` 降回 0。驗證方式：單元測試涵蓋 fish-schooling 修改後的情境（被抓住的魚不被拉動、其他魚避開被抓住的魚、放開 2 秒後速度回到範圍內），既有的 boids 測試也要通過

## 4. 呈現

- [x] 4.1 修改 `FishRenderer`：依 `panic` 調整頻率和幅度，並**每幀更新 `aSwimAmp`**；加入只在畫面上的抖動和偏擺（D6）。驗證方式：單元測試確認 panic 為 1 時頻率約為 4 倍、幅度約為 3 倍，panic 為 0 時和原本相同
- [x] 4.2 實作 `src/render/hand/hand-avatar.ts`：關節、骨頭、手掌，flat shading，加入 `PALETTE.hand`；處理座標轉換與對齊捏合點；捏合時指尖發光並噴出氣泡；依 opacity 淡入淡出（D7）。驗證方式：單元測試涵蓋座標轉換（鏡像、y 翻轉、捏合中點對齊目標）和骨頭的變換計算；build 成功
- [x] 4.3 修改 `CursorRenderer`，跳過 source 為 `hand` 的游標。驗證方式：單元測試確認 hand 游標不會建立 mesh
- [x] 4.4 在 `app.ts` 整合：`HandProvider` 註冊到 `InputManager`，`GrabController` 接上主迴圈，`HandAvatar` 每幀同步，`renderer` 提供 `screenToWorld`；網址帶 `?handReplay=<name>` 時跳過開場畫面並使用重播來源。驗證方式：`npm test`、`npm run typecheck`、`npm run build` 都通過

## 5. 開場畫面

- [x] 5.1 實作 `src/ui/onboarding.ts`：說明、隱私說明、兩個按鈕、載入中提示；選滑鼠模式時不請求權限；選鏡頭模式時建立隱藏的 video、初始化 tracker 並 attach 到 `HandProvider`；四種失敗分類都退回滑鼠模式並顯示約 5 秒的提示（D10）。完成後移除 1.3 的暫時除錯入口，改由 onboarding 開啟鏡頭（overlay 的偵測 Hz 保留在 `?debug`）。驗證方式：單元測試用假的 `getUserMedia` 和假的 tracker，涵蓋 camera-onboarding spec 的所有情境；build 成功

## 6. 驗收

- [x] 6.1 **[Claude]** 重播驗收：用 `?handReplay=demo&seed=42` 截圖，確認 3D 手的外觀、捏合回饋、抓住魚時的驚慌、魚移到手的深度、拖動、放開後逃走，並確認 hand 游標沒有多面體；用 `?handReplay=dropout` 確認寬限時間和淡出效果
- [x] 6.2 **[Claude]** 滑鼠驗收：用模擬事件在魚身上按下、拖動、放開，確認抓取、驚慌和逃走；在空處按下再移到魚上，確認不會抓魚
- [x] 6.3 **[Claude]** 開場畫面驗收：截圖確認兩個按鈕和隱私說明；確認「用滑鼠玩」不會跳出權限詢問；用拒絕權限的情境確認退回滑鼠模式並顯示提示；確認頁面上沒有任何鏡頭影像
- [ ] 6.4 **[User]** 真實鏡頭實測：用自己的手試捏魚、拖動、放開，回饋捏合靈敏度、抖動、可動區域和延遲。Claude 依回饋調整 `HAND_PARAMS`，必要時開修正任務
- [x] 6.5 **[Claude]** 效能複驗：完整功能加上鏡頭模式，在 1920x1080 下量 30 秒，確認至少 45 fps、偵測至少 20 Hz

## 7. 真實鏡頭實測後的修正

- [x] 7.1 抓取判定改為依魚在畫面上的大小（design D5 的「抓取判定」）：在 `GRAB_PARAMS` 加入 `hitScale`、`hitMargin`，移除 `grabRadius`。驗證方式：單元測試涵蓋 fish-grab spec 的「抓取目標」所有情境，包含捏在魚身旁邊但沒碰到時不抓、遠處小魚的判定範圍比較小、重疊時抓中心最近的一隻；既有的抓取測試同步更新
- [x] 7.2 簡化 3D 手（design D7 的「外觀（真實鏡頭實測後修正）」）：移除關節球、只保留 15 段手指骨頭、5 邊形收窄的稜柱並互相重疊、捏合發光改到末段骨頭。驗證方式：單元測試確認骨頭數量為 15、沒有關節 mesh、骨頭兩端有延伸；既有的座標轉換測試通過；build 成功
- [x] 7.3 **[Claude]** 驗收：用 `?handReplay=demo&seed=42` 截圖確認手的造型簡潔且沒有縫隙；用模擬滑鼠事件確認在魚身旁邊按下不會抓魚、在魚身上按下會抓起

## Workflow follow-up

- 全部驗收通過後，commit，再執行 `/openspec-archive-change` 封存，並同步 spec。
- 接著開始階段 ③ `add-custom-fish-drawing` 的規劃。
