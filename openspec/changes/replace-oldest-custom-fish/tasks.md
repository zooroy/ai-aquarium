# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作；Codex 額度用完時由 Claude 接手。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。型別、函式名稱與參數以 design.md 為準。不新增 npm 套件。

## 1. 掉落、游走與換魚（純邏輯）

- [ ] 1.1 在 `Fish` 加入 `dropping` 和 `leaving` 兩種狀態，以及 `transition` 欄位；`stepSchool` 略過這兩種狀態，鄰居計算也排除牠們（D1）。在 `src/core/tank-bounds.ts` 加入 `visibleTopY`、`visibleHalfWidth`。驗證方式：
  - 單元測試確認 `dropping` 和 `leaving` 的魚在 `stepSchool` 後位置不變，而且不影響鄰居的分離力。
  - `GrabController` 不會選中這兩種狀態的魚。
  - 被抓住的魚改成 `leaving` 後，下一幀 `GrabController` 會放開，不會出錯。
  - `visibleTopY` 在 `z = 0` 時等於 `tan(22.5°) × 14`。
  - 既有測試全部通過。
- [ ] 1.2 實作 `src/simulation/fish-transitions.ts`（D2、D3）：`spawnDroppingFish`、`stepDropping`、`startLeaving`、`stepLeaving`、`stepTransitions`、`chooseFishToRetire`，並修改 `canAddCustomFish`；在 params 加入 D5 列出的參數。驗證方式：單元測試涵蓋：
  - 生成時 y 在 `visibleTop` 之上；x 在中央 60% 內；1.6 秒內抵達 `targetY`，接著轉成 `swimming`，速度為水平方向乘以 `maxSpeed`；掉落過程中 y 單調遞減。
  - `startLeaving` 往最近的一側；`stepLeaving` 在超過 `visibleHalfWidth + leaveMargin` 時回傳完成；超過 `leaveTimeout` 也會完成。
  - `stepTransitions` 只回傳完成游走的 `customId`。
  - `chooseFishToRetire` 跳過 `leaving` 和不存在的魚。
  - `canAddCustomFish` 不計入 `leaving` 的魚。

## 2. 入水水花

- [ ] 2.1 實作 `src/render/environment/splash.ts` 和 `SPLASH_PARAMS`（D4）。驗證方式：
  - 單元測試確認 `advanceSplashBubble` 會往上飄、水平速度遞減、超過 `life` 後就不再顯示。
  - 連續 burst 超過物件池大小時，不建立新的 Mesh。
  - `dispose` 會釋放幾何和材質。
  - build 通過。

## 3. 整合

- [ ] 3.1 修改 `custom-fish-feature.ts` 與 `app.ts`（D5）：
  - `place` 加上 `drop` 選項。
  - 加入 `makeRoom` 和 `update(dt)`。
  - 移除上限阻擋和等待提示；加入換魚提示。
  - 每幀步進轉場；接上 splash。

  驗證方式：
  - 把換魚決定與提示文字抽成純函式，寫單元測試：已滿時本機畫的魚和手機的魚各顯示正確的提示；未滿時不換魚。
  - typecheck 和 build 通過。
  - 由 Claude 在瀏覽器驗收。

## 4. 驗收與部署

- [ ] 4.1 **[Claude]** 瀏覽器驗收（在獨立的分頁環境，不動到使用者的魚缸）：
  - 新魚從上方掉落，有氣泡水花，落到上方三分之一左右後開始群游。
  - 掉落中抓不到。
  - 已滿 20 隻時放入新魚，最舊的一隻游出畫面；「我的魚」仍是 20 隻；重新整理後游走的魚不在、新魚還在。
  - 最舊的魚被抓住時換魚，抓取會放開。
  - 手機送魚時已滿，桌電直接換魚；雲端沒有殘留。
  - 重新整理時已保存的魚不會掉落。
  - fps 和換魚前相近。
- [ ] 4.2 **[Claude]** push 到 `main`，確認 Actions 部署成功，並在正式網址快速確認一次掉落和換魚。
- [ ] 4.3 **[User]** 用真的 iPhone 送一隻魚，看牠從上方掉進桌電魚缸。
