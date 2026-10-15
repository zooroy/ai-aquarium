# Tasks

> 每個 `##` 群組是一次 Herdr 派工，由 Codex 實作；Codex 額度用完時由 Claude 接手。標示 **[Claude]** 的任務由 Claude 負責，標示 **[User]** 的任務需要使用者親自操作。
> 每個 Codex 任務完成時，都要回報 `npm test`、`npm run typecheck`、`npm run build` 的輸出。名稱與介面以 design.md 為準。不新增 npm 套件（glTF-Transform 只在 repo 外處理素材時使用，不寫進 package.json）。

## 1. 素材

- [x] 1.1 **[Claude]** 用 glTF-Transform 處理 `/Users/royhsiao/Downloads/project_playtime__glove_hand.glb`（design 決定 5）：刪除第二隻手、prune、貼圖轉 WebP（必要時縮成 512），輸出 `public/models/glove-hand.glb`。驗證方式：
  - 檔案小於 600 KB。
  - 用腳本讀 GLB，確認只剩一個 skin、一個網格，且 design 決定 1 列出的骨頭名稱都在。
  - 在瀏覽器用 GLTFLoader 載入不報錯，貼圖正常顯示。

## 2. 骨架對應與材質

- [x] 2.1 修改 `src/render/hand/hand-rig.ts`（design 決定 1、2、4）：
  - 換成手套的 `ROOT_BONE` 和每指 4 個名稱的 `FINGER_BONES`；刪除 `PALM_BONES`、`estimateTip`、`tipLocal`、`tipCapRatio`；以 `ROOT_BONE` 為起點的線段不驅動。
  - 加入 `MODEL_HANDEDNESS = 'left'`。
  - `drivePose` 的 `left` 參數改名為 `mirror`。
  - 刪除 `writeNativeColors`。
  - 加入拇指捏合修正（design 決定 1b）。

  驗證方式：`hand-rig.test.ts` 改用手套模型後全部通過，包括：
  - 名稱都存在；每指點 2→點 4 的父子關係正確；骨架數改成檢查「手套的骨頭數」而不是 21。
  - 不被驅動的骨頭（包括拇指 CMC 段與 H 骨頭）旋轉維持建模值。
  - 捏合測試照原本 0.02 的門檻通過。
  - 靜止時旋轉不變；驅動後骨頭長度不變。
  - 鏡像時行列式為負。
  - 刪除 `writeNativeColors` 的測試。
- [x] 2.2 修改 `src/render/hand/hand-avatar.ts` 與 `src/config`（design 決定 3、4、6）：
  - 載入 `models/glove-hand.glb`，取第一個 `SkinnedMesh`，移除並 dispose 其他手。
  - 保留原 `MeshStandardMaterial`，設 `transparent`、`FrontSide`；不加 `color` 屬性、不開 `vertexColors`。
  - 鏡像改為 `pose.handedness !== MODEL_HANDEDNESS`。
  - palette 刪除 `hand.base`、`hand.glow`。

  驗證方式：`hand-avatar.test.ts` 改用手套模型後全部通過，包括：
  - 只有一個 `SkinnedMesh`。
  - 材質保留 `map`，`side` 為 FrontSide。
  - 淡出時 `depthWrite` 為 false。
  - 捏住時仍會冒出 8 顆氣泡，材質顏色不變。
  - dispose 釋放資源。
- [x] 2.3 更新 `tests/render/hand/glb-fixture.ts` 讀取 `public/models/glove-hand.glb`，並刪除 `public/models/vr-hand-right.glb`。驗證方式：
  - `grep -r vr-hand src tests` 沒有結果。
  - `npm test`、`npm run typecheck`、`npm run build` 全部通過。

- [x] 2.4 左右手標籤修正（design 決定 7）：
  - `src/config/params.ts` 的 `invertHandednessLabel` 改為 `false`，並更新註解。
  - `src/input/hand/replay-source.ts` 的標籤改為 `'Right'`。
  - 同步修改 `tests/input/hand/handedness.test.ts` 和其他依賴舊對應的測試。

  驗證方式：
  - `labelToHand('Right')` 回傳 `'right'`，`labelToHand('Left', true)` 回傳 `'right'`。
  - replay 解析為右手，仍然會套用鏡像。
  - `npm test`、`npm run typecheck`、`npm run build` 全部通過。

## 3. 驗收

- [x] 3.1 **[Claude]** 在瀏覽器用 `?debug` 開啟。驗證方式：
  - 手套載入、貼圖正常，沒有 console 錯誤。
  - 骨架點和 MediaPipe 點的位置合理（replay 輸入或程式注入的手勢）。
  - fps 與更換前相當。
  - 截圖確認。
- [x] 3.2 **[User]** 開鏡頭實測。驗證方式：
  - 左右手都是正確的手、貼圖正常、沒有破面或內外翻轉。
  - 張手、握拳、比食指時手指跟著彎。
  - 捏住時冒出氣泡、指尖不變色；淡出正常。
  - 有不自然的地方回報給 Claude 調整（骨頭對應或 params）。
- [x] 3.3 **[Claude]** 更新 README 的「骨架手模型」段落（左手模型、右手用鏡像、保留原貼圖）。驗證方式：README 不再出現「只有右手模型」。

## Workflow follow-up

- 驗收通過後 archive（同步 `hand-avatar` spec），commit 並 push 到 main，觸發 GitHub Pages 部署。
