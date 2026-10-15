# Design

## Context

`HandAvatar` 載入 GLB，找出 `SkinnedMesh`，把骨架快照交給 `makeNativeRig`，每幀用 `drivePose` 算出骨頭旋轉和外層 `placement`（含鏡像用的負 x 縮放）。現在的設定都寫死在 `hand-rig.ts` 開頭：`ROOT_BONE`、`PALM_BONES`、`FINGER_BONES`（每指三根骨頭，對應 MediaPipe 每指的前三個點，第四個點指尖由 `estimateTip` 從受最後一根骨頭影響的頂點估算）。材質被換成 `MeshLambertMaterial` + 頂點色，`writeNativeColors` 把頂點色在膚色和發光色之間混合。

手套 GLB 的實測結構（已用腳本讀過）：

- 兩組一樣的骨架和網格（`SK_GloveHand`、`SK_GloveHand.002`），上下鏡像擺放；每組 32 根骨頭、1906 個頂點。
- 單一材質 `M_Glove_Hand.001`：baseColor、metallicRoughness、normal 三張 1024×1024 PNG，`doubleSided: true`，有 TANGENT。
- 骨頭（第一組，名稱尾碼數字在第二組不同）：
  - 手腕 `Hand_L_04`，上面還有 `_rootJoint`、`hand_launcher_01`、`MISC_02` 等不影響頂點的骨頭。
  - 四指各有 `B → M → T → H → H_end`，B 在指根關節（距手腕約 0.57），四節都有頂點。
  - 拇指 `ThumbB → ThumbT → ThumbH → ThumbH_end`。
  - `*_end` 的位置不在手指延長線上（例如 `IndexH_L_end_054` 偏到旁邊），不能拿來當指尖。

## Goals / Non-Goals

**Goals:**
- 換成手套模型，保留原貼圖；現有的 FK 解算、鏡像、淡出、固定大小邏輯盡量不動，只換設定。
- 移除捏住時的指尖發光（使用者決定），捏住只保留氣泡。
- 檔案縮小到 600 KB 以下。

**Non-Goals:**
- 不改變解算的原則（只轉骨頭、保持骨頭長度、外層鏡像）；只讓它支援每指 4 個骨頭名稱和不驅動的線段（見決定 1）。
- 不做左右手兩個模型（仍是一個模型 + 鏡像）。
- 不加作者署名（使用者先前決定不放）。

## Decisions

### 1. 骨頭對應：骨頭位置就是 MediaPipe 關節，指尖用 H 骨頭

實作時量到的事實（用蒙皮後的靜止頂點）：手套每根骨頭影響的頂點，落在**該骨頭到下一根骨頭之間**；四指 `H` 骨頭的頂點最遠只到 H 本身，也就是 **H 就在指尖表面**，拇指的 `ThumbH` 也一樣。手腕到 `B` 約 0.57、`B` 到 `H` 約 0.44，和截圖中掌心與手指的比例相符，所以 `B` 是指根關節（MCP）。最初「B 當掌骨、M/T/H 當三節、指尖從頂點估算」的對應是錯的：估出來的指尖會和 H 重疊，捏合時兩指尖相距 0.033，超過 0.02 的門檻。

新的對應：每根手指直接列出 MediaPipe 的四個點各是哪根骨頭的位置：

| 手指 | 點 1 | 點 2 | 點 3 | 點 4（指尖） |
|---|---|---|---|---|
| 拇指（CMC/MCP/IP/TIP） | `Hand_L_04` | `ThumbB_L_05` | `ThumbT_L_06` | `ThumbH_L_07` |
| 食指（MCP/PIP/DIP/TIP） | `IndexB_L_020` | `IndexM_L_021` | `IndexT_L_022` | `IndexH_L_023` |
| 中指 | `MiddleB_L_08` | `MiddleM_L_09` | `MiddleT_L_010` | `MiddleH_L_011` |
| 無名指 | `RingB_L_012` | `RingM_L_013` | `RingT_L_014` | `RingH_L_015` |
| 小指 | `PinkyB_L_016` | `PinkyM_L_017` | `PinkyT_L_018` | `PinkyH_L_019` |

- `ROOT_BONE = 'Hand_L_04'`（點 0，手腕）。
- `FINGER_BONES` 改成每指 4 個名稱（點 1～4）。
- 線段 k（點 k → 點 k+1）由點 k 的骨頭旋轉來驅動；但點 k 的骨頭是 `ROOT_BONE` 時不驅動，保留建模時的角度。手套沒有拇指掌骨的骨頭，所以拇指 CMC→MCP 這段固定，只有 MCP→IP、IP→TIP 兩段會彎。四指的三段都會彎。
- 指尖直接用 H 骨頭的位置，刪除 `estimateTip`、`tipLocal` 和 `HAND_RENDER_PARAMS.tipCapRatio`。`makeNativeRig` 不再需要頂點與權重。
- 刪除 `PALM_BONES`。不被驅動的骨頭（手腕以外的所有非線段骨頭、H 骨頭、拇指 CMC 段）都保留建模時的旋轉。
- 手掌框架照舊用點 0、5、9、17（手腕、食指 B、中指 B、小指 B）；縮放照舊用點 0→9 的距離。
- 前一輪的兩個修正保留：方向不再用骨頭本地 +Y（手套食指 H 的 +Y 和手指方向夾角的餘弦只有 -0.22）；頂點若有需要，一律用蒙皮後的靜止位置。glTF 的蒙皮網格不受網格節點本身的 transform 影響，手套網格節點上層有 Sketchfab 的 y/z 旋轉，直接乘 `matrixWorld` 會偏 1.5 以上。

理由：手套的骨頭本身就放在關節上，直接對應比從頂點估算更準，也更簡單。代價是解算要支援「某一段不驅動」，以及每指 4 個名稱；`solveRotations`、`retargetLandmarks`、`actualLandmarks` 都要跟著改，但演算法本身（只轉骨頭、保持長度）不變。

`loadedBoneName` 已處理名稱中的點；手套名稱沒有點，不受影響。

### 1b. 拇指捏合修正

只對齊每段方向時，手套和使用者的手指比例不同（加上拇指 CMC 段固定），捏合時兩指尖仍差約 0.33 個掌長（replay 5000ms：0.026，門檻 0.25 掌長 = 0.02），畫面上看得到縫。

做法：方向解算完成後，對拇指做一次小範圍的 CCD IK：
- 目標點 = 實際食指指尖 + (使用者拇指尖 − 使用者食指尖) × (模型掌長 / 使用者掌長)。也就是讓拇指相對食指的位置和使用者一致；捏住時目標就落在食指尖上。
- 拇指和食指輪流做 CCD，每次只改旋轉、不改長度：
  - 拇指：依序轉 `ThumbT`、`ThumbB`，把拇指尖轉向「食指尖 + 偏移」。
  - 食指：依序轉 `IndexT`、`IndexM`、`IndexB`，把食指尖轉向「拇指尖 − 偏移」。
  - 輪流重複 `pinchAssistIterations` 次（預設 8）。
  - 實作時發現只轉拇指搆不到：replay 5000ms 時使用者兩指尖只差 0.05 個掌長，但只轉拇指後模型仍差 0.275 個掌長。手套拇指根部固定、只剩兩節，搆不到食指尖，所以食指也要一起靠過去。
- 權重 w：使用者拇指與食指指尖的距離 ≤ 0.3 掌長時 w = 1，≥ 0.6 掌長時 w = 0，中間線性。目標點取「未修正的拇指尖」和上述目標點之間的 lerp。手張開時拇指仍完全照方向解算。
- 新增參數 `HAND_RENDER_PARAMS.pinchAssistNear = 0.3`、`pinchAssistFar = 0.6`、`pinchAssistIterations = 8`。
- 測試：捏合時拇指與食指的方向對齊和 debug 目標點檢查排除拇指與食指（點 2～8），其他手指照舊；捏合距離照原門檻；手張開（w = 0）時拇指方向仍要對齊。

替代方案：放寬測試門檻。不採用，因為規格要求「捏合時兩指相碰」，畫面上的縫是真的看得到。

### 2. 模型的左右手設定

在 `hand-rig.ts` 加 `MODEL_HANDEDNESS = 'left'`。`drivePose` 的 `left` 參數語意改為「需要鏡像」：`HandAvatar` 傳入 `pose.handedness !== MODEL_HANDEDNESS`。`drivePose` 內部邏輯不變（鏡像 = 繞手掌框架轉到本地、x 取負、外層 x 負縮放）。建議把參數改名為 `mirror`，測試同步改名。

### 3. 只用第一隻手

載入後走訪模型，取**第一個** `SkinnedMesh`（現在的寫法是取最後一個）。另一隻手的網格與骨架所在的節點從模型移除並 dispose，避免畫兩隻、也避免多算骨架。

更好的做法是在素材處理時就刪掉第二隻手（見決定 5）；程式仍保留「只取第一個」，讓檔案就算有兩隻也正確。

### 4. 材質，移除發光

- 保留 GLTFLoader 產生的 `MeshStandardMaterial`（貼圖、法線貼圖、粗糙度），只設定 `transparent = true`；`opacity` 和 `depthWrite` 的淡出邏輯照舊。
- 改成 `side = FrontSide`。鏡像時 three.js 會依行列式翻轉正反面，FrontSide 才不會看到手套內側；現有測試也檢查 FrontSide。
- 刪除 `writeNativeColors`、`color` 頂點屬性與 `vertexColors`；`PALETTE.hand.base`、`PALETTE.hand.glow` 不再使用，刪除。捏住時的氣泡（`advanceHandBubbles`）不變。
- 不做發光的原因：使用者決定不需要；氣泡已足夠表示捏住。

### 5. 素材處理

用 glTF-Transform（`@gltf-transform/core`、`functions`、`extensions` 4.x 加 `sharp`，裝在 repo 外的暫存目錄，只在處理素材時執行，不加入 `package.json`）寫的小腳本：

1. 刪除第二隻手（`SK_GloveHand.002` 子樹）及未使用的資源（`prune`）。
2. 貼圖轉 WebP（`webp`），必要時縮成 512（`resize`）。three.js 的 GLTFLoader 支援 `EXT_texture_webp`；iOS Safari 14 以上與桌面瀏覽器都支援 WebP。
3. 輸出到 `public/models/glove-hand.glb`，目標小於 600 KB。實際結果：保留 1024 解析度、WebP 品質 85，318 KB。

實測發現：原檔的兩隻手都使用貼圖上半部的灰色手套區塊，下半部的粉紅色區塊兩隻手都沒有用到，所以模型原本的外觀就是灰色。

原始檔保留在使用者的 Downloads，不放進 repo。

### 6. 大小、位置與傾斜

`drivePose` 依手腕到中指根的距離縮放模型，所以手套會自動配合游標大小；捏合中點對齊游標的邏輯不變。實測後若手套看起來太大或太小，只調 `HAND_RENDER_PARAMS`（例如新增 `modelScale`），不改演算法。`displayTiltAcross` / `displayTiltUp` 目前是 0，維持。

### 7. 左右手標籤不再反轉（實測修正）

使用者實測（舉右手、掌心朝鏡頭）時，畫面是手套沒有花紋的手心，而且拇指在左、手指朝上。手套只有在**沒有鏡像**時，才會這樣呈現（這是左手手套的手心）。所以使用者的右手被判成了左手。

原因是 `HAND_PARAMS.invertHandednessLabel = true`。這個設定假設 MediaPipe 在沒有鏡像的影像上，會把右手標成 `Left`。但實測的 MediaPipe Tasks 對沒有鏡像的影像，標籤本身就是對的：右手是 `Right`。舊的 VR 手是單色的，手心和手背看起來一樣，所以一直沒發現這個問題。座標轉換 `(-x, -y, z)` 是旋轉、不是鏡像，手的左右形狀沒有被改變，所以不需要修改。

修正：
- `invertHandednessLabel` 改為 `false`，註解改成「MediaPipe Tasks 在未鏡像影像上的標籤即為使用者實際的手」。
- replay 的合成手勢是右手的形狀，標籤改為 `Right`，維持「replay 是右手、呈現手背」。
- 測試同步修改：
  - `labelToHand` 的預設值改為不反轉；明確傳入 `true` 時仍會反轉。
  - `HandednessFilter` 與 replay 相關的測試，標籤改用不反轉的對應。

## Risks / Trade-offs

- [對應後的手指方向或彎曲軸看起來不自然] → 先用 `debugRig` 確認骨架點與 MediaPipe 點重合；再請使用者開鏡頭實測，依回報微調名稱表或參數。
- [拇指少一段可彎的關節，CMC→MCP 固定] → 拇指根部的動作主要由手掌框架帶動，影響不大；實測若不自然再討論。
- [鏡像時法線貼圖的凹凸方向反了] → 手套的法線貼圖起伏小，視覺上影響有限；若明顯，可在鏡像時把 `material.normalScale.x` 取負。
- [WebP 貼圖在舊瀏覽器無法顯示] → 本專案已要求 WebGL2 + MediaPipe 的新瀏覽器，影響可忽略。
- [模型造型來自商業遊戲] → 使用者已知情並決定使用。
- [手套比原本的 VR Hands 多約 4 倍頂點、PBR 材質較貴] → 只有一隻手，仍在預算內；實作後確認 fps 和之前一樣。

## Migration Plan

刪除 `vr-hand-right.glb`，所有引用改成 `glove-hand.glb`。要回復時 revert 這次 commit 即可。
