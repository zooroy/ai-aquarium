# Design

## Context

- `Fish.mode` 目前有 `'swimming' | 'grabbed' | 'fleeing'`：
  - `stepSchool`（`src/simulation/boids.ts`）略過 `grabbed` 的魚，鄰居計算也排除 `grabbed`。
  - 位置最後會被夾在 `bounds` 內，所以魚游不出畫面。
- `GrabController` 只會選 `swimming` 和 `fleeing` 的魚當作抓取候選。如果被抓的魚的 `mode` 不再是 `grabbed`，下一幀就會自動放掉，見 `grab.ts` 第 50 行。
- `spawnCustomFish()` 把新魚放在魚缸中央附近，並設為 `swimming`。`canAddCustomFish()` 計算所有帶 `customId` 的魚。
- `custom-fish-feature.ts`：
  - `loaded` Map 依加入順序保存自訂魚：先放 store 依 `createdAt` 排序後的清單，之後的新魚加在後面。所以第一個就是最舊的一隻。
  - 上限阻擋在 `menu.draw` 和 `add()` 兩處。手機的魚已滿時回傳 `'full'`，並顯示等待提示。
- 畫面：
  - 相機在 `z = 14`，FOV 45°，看向原點。
  - `TankBounds` 是可視範圍乘上 `visibleAreaRatio`（0.9），再扣掉上下留白，所以 `bounds.max.y` 比畫面上緣低。
  - 場景沒有可見的水面，整個畫面都是水中。
- 環境模組（`src/render/environment/`）都實作 `EnvironmentModule { update(time); dispose() }`，泡泡用 `MeshLambertMaterial` 加上 flatShading 的 icosahedron。

## Goals / Non-Goals

**Goals：**
- 掉落與游走的運動、選出最舊的魚、換魚的決定，都寫成純函式，可以在 node 測試。
- 掉落中與游走中的魚完全不受群游和抓取影響，也不會讓 `GrabController` 出錯。
- 水花效果的成本很低：固定大小的物件池，不在每次水花時建立新的 Mesh。

**Non-Goals：**
- 真正的水面或水面波紋。
- 掉落時的物理碰撞，例如撞到其他魚。
- 游走動畫的淡出效果。魚直接游出畫面外，看不見後再移除。

## Decisions

### D1. Fish 新增兩種狀態

```ts
mode: 'swimming' | 'grabbed' | 'fleeing' | 'dropping' | 'leaving';
transition?: { elapsed: number; startY: number; targetY: number; direction: Vector3 };
```

- **`dropping`**：`startY`、`targetY` 是掉落的起點與終點高度。`direction` 是落定後的水平游動方向（單位向量）。
- **`leaving`**：`direction` 是 ±x，往離魚最近的一側；`x = 0` 時往 +x。
- **其他系統的處理**：
  - `stepSchool` 略過 `dropping` 和 `leaving` 的魚：不計算受力、不更新位置，鄰居計算也排除牠們，和 `grabbed` 的處理方式相同。
  - `GrabController` 的候選條件本來就只有 `swimming` 和 `fleeing`，不需要修改，只要補測試。
- **選擇理由**：另一個做法是把轉場中的魚另外存在一個陣列。但所有渲染器和 `fps-overlay` 都只讀 `Fish[]`，用 mode 區分改動最少。

### D2. 掉落（`src/simulation/fish-transitions.ts`）

- `spawnDroppingFish(record, bounds, random, nextId, visibleTop)`：
  - 起點：
    - `x`：在 bounds 寬度中央 `dropSpreadX`（60%）的範圍內隨機。
    - `z`：在 `[mid z, maxZ - dropFrontInset]` 之間，偏向前方，比較看得清楚。
    - `startY = visibleTop(z) + dropStartMargin`。`visibleTop(z)` 由呼叫端提供，表示這個 z 深度上畫面上緣的世界座標 y。
  - `targetY = bounds.max.y - (bounds.max.y - bounds.min.y) * dropTargetRatio`（1/3）。
  - `direction`：隨機的水平方向。
- 純函式 `visibleTopY(fovDeg, cameraY, cameraZ, z)` 放在 `src/core/tank-bounds.ts`，值為 `cameraY + tan(fov/2) * (cameraZ - z)`。app 用 `TANK_PARAMS` 建立 `visibleTop`。
- `stepDropping(fish, dt)`：
  - `t = elapsed / dropDuration`（1.6 秒）。
  - `y = startY + (targetY - startY) * easeOutCubic(t)`；x、z 不變。
  - `forward` 的俯仰角從 `-dropPitch`（約 -60°，頭朝下）線性轉到 0，水平方向等於 `direction`。
  - `t >= 1` 時改成 `swimming`，`velocity = direction * maxSpeed`，並刪除 `transition`。
- **水花**：`spawnDroppingFish` 不處理畫面。由呼叫端在生成時觸發水花，位置是 `(x, visibleTop(z) - splashDepth, z)`，也就是剛進入畫面的地方（見 D4）。
- **選擇理由**：時間驅動的緩出曲線，可以保證約 1.6 秒內一定落定，不會因為受力參數而飄走或卡住；而且容易測試。

### D3. 游走與換魚

- `startLeaving(fish)`：設成 `leaving`，`direction = (sign(x) || 1, 0, 0)`。
- `stepLeaving(fish, dt, visibleHalfWidth)`：
  - 速度朝 `direction`，大小為 `maxSpeed * leaveSpeedMultiplier`（1.5）；y、z 不變。
  - `forward` 用指數平滑轉向 `direction`，轉向速率與 `orientationResponse` 相同。
  - 回傳 `true`（完成）的條件：`|x| > visibleHalfWidth(z) + leaveMargin`，或 `elapsed > leaveTimeout`（8 秒，保險用）。
  - `visibleHalfWidth(z)` 是 `visibleTopY` 的水平版本，同樣是純函式，要乘上 aspect。
- `stepTransitions(fish, dt, ctx): string[]`：步進所有 `dropping` 和 `leaving` 的魚，回傳游走完成的 `customId`。
- `canAddCustomFish` 改成只計算非 `leaving` 的自訂魚。
- `chooseFishToRetire(oldestFirstIds, fish): string | undefined`：依照順序，回傳第一個仍在 `fish` 中、而且不是 `leaving` 的 id。

### D4. 入水水花（`src/render/environment/splash.ts`）

- `createSplash(scene)` 回傳 `{ burst(position: Vector3): void; update(time): void; dispose(): void }`。
- 使用固定的物件池，共 `SPLASH_PARAMS.poolSize`（48）顆小泡泡；每次 burst 使用 `perBurst`（14）顆，池子不夠時重複使用最舊的。
- 每顆泡泡的初速：水平隨機往外，加上向上 `rise`。它會逐漸減速、往上飄，並在 `life`（1.2 秒）內變小到消失，用 `scale` 處理，所有泡泡共用同一個材質。
- 單顆泡泡的運動是純函式 `advanceSplashBubble(state, dt)`，方便測試。
- 顏色使用 `PALETTE.bubbles`，和環境泡泡一致。

### D5. 整合

- `custom-fish-feature.ts`：
  - **`place(record, { drop })`**：
    - `drop: true`：用 `spawnDroppingFish`，並呼叫 `ctx.splash(position)`。
    - `drop: false`：用原本的 `spawnCustomFish`，給重新整理時載入用。
  - **`makeRoom()`**：
    - 非 `leaving` 的自訂魚達到 20 隻時，用 `chooseFishToRetire([...loaded.keys()], ctx.fish)` 選出最舊的一隻，然後：
      - `startLeaving`：如果牠正被抓住，mode 改變後 `GrabController` 下一幀會自動放開。
      - `loaded.delete`，並 revoke 它的 URL。
      - `store.remove`，`menu.setCount`。
    - 回傳是否換了魚。
  - **`add` 和 `receive`**：放入新魚前先 `makeRoom()`。
    - 有換魚時的提示：本機畫的魚是「魚缸滿了，最舊的一隻魚游走了。」；手機的魚是「收到一隻從手機來的魚！最舊的一隻魚游走了。」
    - 移除 `menu.draw` 的上限阻擋、`limit` 和 `waiting` 提示，以及 `createRisingEdge`。
    - `receive` 不再回傳 `full`；只有 dispose 期間 `place` 拒絕時，才會回傳 `full`。
  - **`update(dt)`**：呼叫 `stepTransitions`，對完成游走的 id 執行 `removeCustomFish` 和 `renderer.remove`。
- `app.ts`：
  - 建立 splash 模組。
  - 傳給 feature：`splash`、`visibleTop(z)`、`visibleHalfWidth(z)`。
  - 每幀先呼叫 `customFish.update(dt)`，再呼叫 `stepSchool`。
- **參數**：
  - `CUSTOM_FISH_PARAMS` 新增：`dropDuration`、`dropTargetRatio`、`dropSpreadX`、`dropFrontInset`、`dropStartMargin`、`dropPitch`、`leaveSpeedMultiplier`、`leaveMargin`、`leaveTimeout`、`splashDepth`。
  - 新增 `SPLASH_PARAMS`。

## Risks / Trade-offs

- [`FishRenderer` 和 `CustomFishRenderer` 的姿態計算可能對 `dropping` 時大角度的俯仰處理不好] → `computeSwimPose` 依 `forward` 決定朝向，已經有極點保護（`poleThreshold`）。`dropPitch` 限制在 60°，避免接近垂直。由 Claude 截圖驗收。
- [游走的魚被 `TankBounds` 夾住] → `stepSchool` 不處理 `leaving` 的魚，`stepLeaving` 也不夾位置，所以魚能游出畫面。
- [短時間內連續放入多隻魚] → 每次都選下一隻非 `leaving` 的最舊的魚，所以可能同時有好幾隻在游走，數量最多就是放入的數量，可以接受。
- [手機送魚時，桌電頁面隱藏] → 隱藏時不查詢，回到前景時才收到並掉落，使用者剛好看得到。

## Migration Plan

純前端改動，push 到 `main` 後自動部署。IndexedDB 和 Supabase 的資料格式都不變。

## Open Questions

（無）
