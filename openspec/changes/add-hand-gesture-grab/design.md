# Design

## Context

- 階段 ① 已完成（見 `openspec/specs/`）。這次要沿用的現有結構：
  - `InputState` 和 `InputProvider`（`src/input/types.ts`）：這次要新增一個 `hand` 輸入來源，且**不修改這兩個型別**。
  - `stepSchool(fish, dt, ctx)`（`src/simulation/boids.ts`）和 `Fish`（`src/simulation/fish-state.ts`）。
  - `FishRenderer.sync`：目前每幀只寫入 `aSwimPhase` 和 `aSwimFreq`，`aSwimAmp` 一直是預設值。
  - `CursorRenderer`：把游標反投影到 z = 2 的平面上。
  - `AquariumRenderer.projectToScreen`。
- 角色分工見 `AGENTS.md`。Codex 的沙盒沒有網路，所以 npm 安裝和模型下載由 Claude 負責。
- Claude 無法在鏡頭前比手勢，所以驗收需要不依賴真實鏡頭的方法，見 D8。

## Goals / Non-Goals

**Goals:**
- 手勢的數學邏輯（捏合、平滑、座標對應、游標消失前的寬限時間）全部寫成純函式，可以在 node 環境測試。
- 抓魚只依賴 `InputState`，所以手勢、滑鼠、觸控都走同一條路徑。
- 只有 `hand-tracker.ts` 依賴 MediaPipe，其他模組都可以用假資料驅動。

**Non-Goals:**
- 雙手、手勢辨識（例如比讚、揮手）、手的深度控制（往前推讓魚游遠）。
- 用骨架綁定的 glTF 手模型。
- 支援行動裝置的鏡頭。

## Decisions

### D1. 手部偵測：MediaPipe Tasks Vision `HandLandmarker`，固定 1.0.1

- 設定：`runningMode: 'VIDEO'`、`numHands: 1`。先嘗試 `delegate: 'GPU'`，失敗時改用 `'CPU'`。
- 版本固定為 `1.0.1`。最新的 1.1.0 發布不到兩週，先觀察。
- 靜態資源放在專案裡，不依賴 CDN：
  - WASM：用 `scripts/copy-mediapipe-wasm.mjs` 把 `node_modules/@mediapipe/tasks-vision/wasm` 複製到 `public/mediapipe/wasm/`。在 `predev` 和 `prebuild` 時自動執行，複製結果加進 `.gitignore`。
  - 模型：`public/mediapipe/hand_landmarker.task`（float16 版本，約 8 MB），由 Claude 下載並**直接 commit**。這樣部署和 Codex 都不需要網路。
- 替代方案：
  - 從 CDN 載入：沒有採用，因為多了一個外部依賴，離線也無法使用。
  - TF.js handpose：沒有採用，已經不太維護，精準度也比較差。

### D2. 偵測迴圈和渲染迴圈分開

```
 video (getUserMedia, hidden)
   |  requestVideoFrameCallback, 最多 30 Hz
   v
 HandTracker.detect(video, ts) --> HandFrame | null
   |
   v
 HandProvider.ingest(frame, now)   # 平滑、捏合判斷、座標對應、寬限時間
   |
   +--> getPointers()   -> InputManager -> InputState (每個渲染幀)
   +--> getHandPose()   -> HandAvatar    (每個渲染幀)
```

- 偵測先在主執行緒上執行。是否要移到 Web Worker，由第一組的效能驗證決定（D9）。
- 渲染幀只讀取 provider 最新的狀態，不會等待偵測完成。

### D3. 模組與型別

```
src/input/hand/
  types.ts           # HandFrame, HandPose, Landmark
  hand-tracker.ts    # 唯一 import MediaPipe 的檔案；init(video) / detect(video, ts) / dispose()
  one-euro.ts        # OneEuroFilter（純函式）
  pinch.ts           # pinchRatio(landmarks) 與 PinchDetector（遲滯）
  hand-mapping.ts    # 鏡像與中央區域對應到 0..1（純函式）
  hand-provider.ts   # implements InputProvider，另外提供 getHandPose()
  replay-source.ts   # 開發用：程序化產生手勢序列（D8）
src/simulation/grab.ts
src/render/hand/hand-avatar.ts
src/ui/onboarding.ts
```

```ts
export interface Landmark { x: number; y: number; z: number; }

export interface HandFrame {
  landmarks: Landmark[];       // 21 個，影像正規化座標（0..1，未鏡像）
  worldLandmarks: Landmark[];  // 21 個，公尺，以手的中心為原點
  timestamp: number;           // ms
}

export interface HandPose {
  visible: boolean;            // 目前偵測到手，或還在寬限時間內
  opacity: number;             // 0..1，用於淡入淡出（hand-avatar spec）
  joints: Landmark[];          // 21 個，已平滑、已鏡像、y 向上，單位公尺
  pointer: { x: number; y: number };  // 和 hand-0 游標相同
  pressed: boolean;
}
```

- `HandProvider` 實作既有的 `InputProvider` 介面：`name = 'hand'`，游標 id 固定為 `'hand-0'`，source 為 `'hand'`。
- 3D 手需要的 21 個關節**不放進 `InputState`**，改由 `getHandPose()` 另外提供。這樣 `InputState` 的型別維持不變，符合 interaction-input spec 的「輸入來源可擴充」。
- `HandProvider.start(target)` 不使用 `target`。鏡頭和 tracker 由 onboarding 流程建立後，再透過 `attach(tracker, video)` 注入；測試時改注入 replay 來源。

### D4. 捏合、平滑和座標對應

- 捏合比例：`ratio = dist(lm[4], lm[8]) / dist(lm[0], lm[9])`，使用影像正規化座標的 x、y，不用 z。
  - 低於 0.25 進入捏住狀態，高於 0.40 離開。
  - 門檻放在 `HAND_PARAMS`。
- 平滑：One Euro Filter，參數放在 `HAND_PARAMS`。
  - 座標是 0..1 的正規化單位，所以 `beta` 要比像素單位常見的值大很多。
  - `beta = 0.02` 實測太小：快速移動後無法在 150 ms 內追上。
  - 參數以單元測試決定，必須同時通過兩項：
    - 靜止抖動測試：手靜止加雜訊時，輸出的變動要明顯變小。
    - 快速移動後的收斂測試：用 300 ms 從畫面一側移到另一側再停下，停下後 150 ms 內誤差小於畫面寬度的 1%。
  - 游標位置的 x、y 各用一個濾波器。
  - 21 個關節的 x、y、z 各用一個濾波器，共 63 個。
  - 捏合比例在進入遲滯判斷之前也先平滑。
- 座標對應：
  - 先鏡像：`mx = 1 - x`。
  - 再把中央區域對應到整個畫面：`(mx - (1 - a) / 2) / a`，`a = 0.7`。
  - 結果夾在 0..1 之間。
- 寬限時間：最後一次偵測到手之後 300 ms 內，維持最後的游標和捏合狀態；超過 300 ms 就移除游標，`HandPose.visible` 設為 false。
- 時間一律從參數傳入（`now`），不直接讀時鐘，方便測試。

### D5. 魚的狀態和抓取控制器

在 `Fish` 加入以下欄位，`createSchool` 給預設值：

```ts
mode: 'swimming' | 'grabbed' | 'fleeing';
panic: number;       // 0..1，驅動擺尾與抖動
fleeTime: number;    // 進入 fleeing 後經過的秒數
```

```
            press (edge) && nearest within radius && no fish grabbed
 swimming -------------------------------------------------------> grabbed
    ^                                                                 |
    |  fleeTime >= fleeDuration (2s)          release / pointer gone  |
    +---------------------------- fleeing <---------------------------+
```

- 抓取判定（真實鏡頭實測後修正）：原本固定半徑為畫面寬度 8%，實測時捏合還沒碰到魚就把魚吸過來。改為依魚在畫面上的大小判定：
  - 每隻魚的判定半徑 `hit = projectedHalfLength * GRAB_PARAMS.hitScale + GRAB_PARAMS.hitMargin`。
  - `projectedHalfLength`：把 `fish.position` 和 `fish.position + (bodyLength * scale / 2, 0, 0)` 都用 `projectToScreen` 投影，取兩點在畫面寬度比例下的距離（同樣用 `hypot(dx, dy / aspect)`）。魚離鏡頭越遠，判定範圍越小。
  - 預設 `hitScale = 1`、`hitMargin = 0.01`（畫面寬度 1%）。移除 `grabRadius`。
  - 符合 `distance < hit` 的魚當中，選 `distance` 最小的一隻。
- `src/simulation/grab.ts` 的 `GrabController.update(state, fish, dt, ctx)`：
  - `ctx` 包含 `projectToScreen`，以及 `screenToWorld(x, y, z)`。`screenToWorld` 由 renderer 提供，把螢幕座標反投影到指定 z 平面。
  - 自己記錄每個游標上一幀是否按下，用來判斷「剛按下」，並記錄是哪個游標抓住了魚。
  - **grabbed**：
    - 目標位置是 `screenToWorld(pointer, GRAB_PARAMS.holdZ)`，`holdZ = 2`，和游標平面、手的平面一致。
    - 用指數平滑追上目標，時間常數 0.1 秒；z 方向的時間常數 0.2 秒。
    - 位置夾在魚缸範圍內。
    - `panic` 趨近 1。
  - **放開**：
    - `velocity` 設為「遠離游標的方向（world xy）」乘以 `fleeSpeed`（`2 × maxSpeed`）。
    - `forward` 立刻轉向這個方向。逃跑的瞬間會轉向，這是唯一不受單幀最大轉角限制的例外。
    - 進入 fleeing。
  - **fleeing**：
    - 速度上限從 `fleeSpeed` 線性降到 `maxSpeed`，持續 `fleeDuration` 秒。
    - `panic` 線性降到 0。
    - 結束後回到 swimming。
- `stepSchool` 的修改：
  - 先呼叫 `GrabController.update`，再執行群游。
  - `grabbed` 的魚：不計算受力、不積分速度、不套用速度限制，但仍放進空間網格，讓其他魚能和牠保持分離。
  - `fleeing` 的魚：照常計算受力，但速度上限改用當下的逃跑上限。
- 被抓住的魚的 `forward`：維持被抓前的朝向，左右亂擺的效果只在渲染層做（D6），避免影響模擬的測試。

### D6. 驚慌的視覺效果在渲染層實作

`FishRenderer.sync` 依照 `fish.panic`：

- `aSwimFreq *= 1 + 3 * panic`，也就是最多 4 倍。
- `aSwimAmp = defaultAmp * (1 + 2 * panic)`，也就是最多 3 倍。**這需要補上逐幀更新 `aSwimAmp`**。
- 渲染用的位置加上抖動：`panic * jitterAmp * noise(time * jitterFreq, id)`。
- 繞 y 軸加上偏擺：`panic * wobbleAngle * sin(time * wobbleFreq + phase)`。
- 抖動只影響畫面，不寫回模擬狀態。

### D7. 程序化 Low Poly 手

- 外觀：
  - 21 個關節：一個 `InstancedMesh`，用 `IcosahedronGeometry(r, 0)`。指尖稍小，掌根稍大。
  - 20 段骨頭：一個 `InstancedMesh`，用 6 邊形的 `CylinderGeometry`。每幀依照兩端關節計算位置、旋轉，以及沿長軸的縮放。
  - 手掌：用關節 0、1、5、9、13、17 組成扇形三角面，再擠出一點厚度。每幀更新頂點，non-indexed。
  - 材質：`MeshLambertMaterial({ flatShading: true, transparent: true })`，使用 `PALETTE.hand`（新增的暖色系色票）。
- 座標轉換：
  - world landmarks（公尺）的 y 原本向下，要翻成向上；x 要鏡像。
  - 乘上固定比例 `HAND_PARAMS.worldScale`，讓手在畫面上約佔視窗高度的 25%。
  - 整隻手平移到捏合中點（關節 4 和 8 的中點），對齊 `screenToWorld(pointer, holdZ)`。
  - 因為形狀來自 world landmarks，手離鏡頭遠近不會影響大小，符合 hand-avatar spec 的「固定大小」。
- 捏合回饋：
  - 關節 4 和 8 的 instance 顏色改為發光色，並提高 emissive。
  - 捏住的那一刻，從捏合點噴出 6～10 顆小氣泡，約 0.8 秒後淡出消失。
- 淡入淡出：材質的 opacity 跟著 `HandPose.opacity`，約 0.3 秒內完成。
- 畫面順序（重播驗收後修正）：原本手在 z = 2，但魚的可游動範圍到 z = 3，魚會游到手的前面。改為：
  - 魚缸的 `TANK_PARAMS.maxZ` 從 3 降到 1.5。
  - `GRAB_PARAMS.holdZ` 改為 2.5，手、被抓住的魚、滑鼠和觸控游標的平面都用這個值。
  - 被抓住的魚，z 方向的上限放寬到 `holdZ`；x、y 仍然夾在魚缸範圍內。
  - 這樣手一定在所有游動中的魚前方。
- 外觀（重播驗收後修正）：第一版的骨頭和關節太細，像骨架。改為：
  - 骨頭半徑約為相鄰關節距離的 30%～35%。
  - 關節半徑略大於骨頭半徑。
  - 手掌厚度加大。
  - 整體看起來要像粗胖的木頭或黏土玩具手。
- 外觀（真實鏡頭實測後修正）：使用者回饋「面太多、太複雜」。簡化為：
  - **移除 21 顆關節球**，不再使用關節的 `InstancedMesh`。
  - 只保留手指的 15 段骨頭（大拇指 1-2、2-3、3-4；其他四指各 3 段），移除手掌內部的骨頭（0-1、0-5、0-17、5-9、9-13、13-17），由手掌覆蓋。
  - 骨頭用 **5 邊形**、上下端不分段的 `CylinderGeometry`，稍微收窄（指尖端半徑約為根部的 85%）；兩端各延伸約一個半徑，讓相鄰指節互相重疊，關節處不會出現縫隙。
  - 手掌維持關節 0、1、5、9、13、17 擠出的單一扁平塊，不加額外細節。
  - 捏合發光改為作用在大拇指和食指的最末段骨頭（3-4、7-8）。
- 外觀（第二次實測後修正，取代上面兩版）：使用者認為獨立柱子拼成的手不好看，提供參考圖 `assets/hand-reference.png`（箱型建模的 Low Poly 手），顏色維持膚色。改為**每幀重建的一體成形網格**：
  - 一個 `Mesh` + 一個 `BufferGeometry`（non-indexed、flat shading），每幀只更新 position（和捏合用的 vertex color），頂點數固定，不重新配置 buffer。移除骨頭的 `InstancedMesh`。
  - 手的局部座標框架：`across` = 食指根部（5）指向小指根部（17）的方向；`up` = 手腕（0）指向中指根部（9）；`normal` = `across × up`（手掌法線）。
  - **手指截面環**：每根手指在每個關節放一個 4 頂點的長方形環（寬 > 厚，預設寬約為指節長度的 0.9 倍、厚約 0.6 倍；同一根手指從根部到末段寬度略減）。環的方向：沿骨頭方向取相鄰兩段方向的平均（斜接），寬度軸 = `across` 去掉骨頭方向分量後正規化。相鄰兩段共用同一個環，所以關節處連續、沒有縫。
  - **指尖**：最後一個環縮小約 0.55 倍並往前推一點，再用一個面封口，形成斜切收窄的指尖。
  - **手掌**：以 0、1、5、9、13、17 往外擴一點組成外輪廓，沿 `normal` 擠出厚度（約等於手指根部的厚度），上下兩面各內縮一圈形成倒角。四根手指根部的環落在手掌上緣（5、9、13、17），大拇指從 1 長出，看起來和手掌連在一起。
  - 面數目標：整隻手約 150～250 個三角形。
  - 顏色：`PALETTE.hand.base` 調成柔和膚色（例如 `0xf0c4a4` 附近），平面著色讓每個面的明暗不同就足以呈現稜面，不畫描邊。
  - 捏合回饋：大拇指和食指最末段的頂點顏色改為 `PALETTE.hand.glow`，並維持捏合氣泡。
- 外觀（使用者指定模型，取代上面所有版本）：使用者提供 `public/models/low-poly-hands.glb`（Poly Pizza「Low poly hands」，Anastasiia Ku，CC BY 3.0，預覽圖 `assets/glb-preview.png`）。模型由 obj2gltf 轉出：兩個 node 各一隻手（左、右），各約 414 頂點、162 三角形，**沒有骨架、沒有動畫**，姿勢是張開手掌、手指伸直。做法是**執行期程序化綁骨**：
  - 載入：`GLTFLoader` 非同步載入，載入完成前不顯示手；載入失敗時 `console.warn` 並退回不顯示手（抓魚仍可用）。
  - 左右手判斷：模型的兩隻手依幾何判斷左右（例如大拇指在手掌哪一側，配合手掌法線）。執行期依鏡像後關鍵點的手掌框架叉積正負號判斷使用者是哪一隻手，選用對應的網格。
  - 靜止姿勢關鍵點：寫一個離線腳本 `scripts/derive-hand-rest-pose.mjs`，分析模型頂點，推算出每隻手 21 個關鍵點的靜止位置（手腕、各指根部、各關節、指尖），輸出成 `src/render/hand/hand-rest-pose.ts` 常數。模型的指節有明顯的頂點環，可以用來定位關節。
  - 模型前處理（7.7 實作時發現）：模型去重後每隻手只有 83 個頂點位置，部分手指缺少第二指間關節的頂點環，長面無法在中途折彎。前處理腳本在缺少的關節位置，用垂直於指骨的平面切開手指的面，補入一圈截面頂點（只切開、不移動頂點，所以靜止外形完全不變），輸出前處理後的幾何給執行期使用。原始 GLB 保留不動。如果某根手指切面失敗，該指改用兩段骨頭（中段和末段合併），並在腳本輸出中回報。
  - 骨架：`SkinnedMesh` + `Skeleton`。一根手掌骨（手腕到手掌框架），加上 15 根指節骨（每指 3 段）。每個頂點綁到靜止姿勢中最近的骨頭段；靠近關節的頂點可以混合相鄰兩根骨頭（權重和為 1），讓彎曲處平順不撕裂。
  - 每幀驅動：每根骨頭的世界變換由當前關鍵點算出。位置在骨頭起點，旋轉把靜止方向轉到當前方向（滾轉角由手掌框架決定），整體大小沿用 `HAND_PARAMS.worldScale`，讓手在畫面上的大小和以前一致。對齊捏合中點的方式不變。
  - 保持模型比例（使用者回饋「跟 hand.glb 完全不一樣」後修正）：骨頭不再拉長或縮短去配合偵測到的關鍵點。`articulateJoints(rest, current)` 先讓手掌整塊做剛體變換（旋轉加等比縮放），再從手掌往指尖做正向運動學：每一節維持模型的靜止長度，只跟隨偵測到的方向。最後再把模型的捏合中點對齊游標。這樣模型的形狀和原檔一致，只有關節角度在變。
  - 材質：換成 `MeshLambertMaterial({ flatShading: true })`，顏色 `PALETTE.hand.base`。捏合時大拇指和食指末段的頂點以 vertex color 改成 glow。淡入淡出時 `transparent`；opacity 為 1 時 `depthWrite = true`，避免同一網格前後順序畫錯。
  - 移除程序化網格 `hand-mesh.ts`，以及只有它用到的參數。
  - 授權標示：開場卡片底部加一行小字；專案根目錄的 `CREDITS.md` 已由 Claude 新增。
- 外觀（改用有骨架的模型，取代上面所有版本）：使用者改選 `public/models/vr-hand-right.glb`（Sketchfab「VR Hands: Bouldering (R) Rigged」，Cheezguzzler，CC BY 4.0，預覽 `assets/vr-hand-preview.png`）。檔案自帶 skin：一個 `SkinnedMesh`（504 頂點、252 三角形，有 `JOINTS_0`、`WEIGHTS_0`）、21 個關節、反向綁定矩陣；只有右手；附一段用不到的動畫 `No_RAction`。不再需要程序化綁骨。
  - 骨頭對應（以 glTF node 名稱為準，靜止姿勢下手指朝 +y、掌心朝 +z 附近；以實際載入的世界座標驗證）：

    | MediaPipe | 骨頭 | 說明 |
    |---|---|---|
    | 0 手腕 | `GLTF_created_0_rootJoint` | 整隻手的根；`Bone_18` 是手掌骨 |
    | 1→2 | `Bone.017_21` | 大拇指掌骨，起點在手腕，直接掛在 rootJoint 下 |
    | 2→3 | `Bone.018_20` | |
    | 3→4 | `Bone.019_19` | 指尖沒有骨頭，靜止指尖位置由網格估算 |
    | 5 食指根 | `Bone.001_5` 的末端 = `Bone.005_4` 起點 | `Bone.001` 是掌骨，跟手掌一起剛體運動 |
    | 5→6、6→7、7→8 | `Bone.005_4`、`Bone.006_3`、`Bone.007_2` | 指尖由網格估算 |
    | 中指 9..12 | `Bone.002_9`（掌骨）、`Bone.008_8`、`Bone.009_7`、`Bone.010_6` | |
    | 無名指 13..16 | `Bone.003_13`（掌骨）、`Bone.011_12`、`Bone.012_11`、`Bone.013_10` | |
    | 小指 17..20 | `Bone.004_17`（掌骨）、`Bone.014_16`、`Bone.015_15`、`Bone.016_14` | |

  - 驅動方式：只設定骨頭的**旋轉**，不改骨頭長度，所以模型比例永遠和原檔一致。
    - 根：由手掌框架（across、up、normal）決定整隻手的旋轉，並用等比縮放讓手掌長度對應 `HAND_PARAMS.worldScale` 下的大小。
    - 手掌骨和四根掌骨保持靜止姿勢的相對旋轉，跟手掌一起剛體運動。
    - 每節手指骨：計算「靜止姿勢下骨頭方向」到「目前關鍵點方向」的旋轉（在父骨頭的座標系中計算，swing），依階層由近到遠套用。滾轉維持靜止姿勢，不另外計算。
    - 最後用模型實際的大拇指尖、食指尖位置（由骨頭變換後的估算指尖）求捏合中點，把整隻手平移到游標位置。
  - 左手：把目前的關鍵點沿手的 across 方向鏡像成右手姿勢去驅動，再把根節點的 x 縮放設為 -1。Three.js 會依矩陣行列式自動翻轉正反面，所以不需要 DoubleSide。
  - 材質：`MeshLambertMaterial({ flatShading: true })`，`PALETTE.hand.base`；捏合時大拇指和食指末節（依 `JOINTS_0` 權重）以 vertex color 改成 glow；opacity 為 1 時 depthWrite 開啟。
  - 不播放模型內建動畫。
  - 移除上一版的程序化綁骨：`hand-rig.ts` 的綁骨與權重計算、`hand-rest-pose.ts`、`scripts/derive-hand-rest-pose.mjs`、`scripts/hand-model.mjs`、`public/models/low-poly-hands*.glb`，以及只有它們用到的參數。
  - 授權標示：開場卡片與 `CREDITS.md`（Claude 已更新）改為 Cheezguzzler、Sketchfab、CC BY 4.0。
- `CursorRenderer` 跳過 `source === 'hand'` 的游標。

### D8. 不需要真實鏡頭的驗收方法：手勢重播

- `replay-source.ts` 提供 `createReplaySource(script)`，依時間輸出程序化生成的 `HandFrame`：
  - 用一組「張開手掌」的標準手形，加上「捏合」的手形，兩者之間插值。
  - 手形沿著腳本指定的路徑移動。
  - 可以插入「偵測不到手」的時段。
- 網址帶 `?handReplay=<name>` 時，App 跳過開場畫面，改用重播來源驅動 `HandProvider`。內建三個腳本：
  - `demo`：張開手、移到魚群、捏住、拖動、放開。
  - `jitter`：靜止的手加上雜訊，用來驗證平滑效果。
  - `dropout`：中途有 200 ms 和 500 ms 偵測不到手，用來驗證寬限時間。
- 單元測試也用同一套產生器，對 `HandProvider` 做端到端測試。
- 真實鏡頭的手感（遲滯門檻、平滑參數、可動區域）由使用者實測後回饋，參數都集中在 `HAND_PARAMS`，方便調整。

### D9. 第一組：效能驗證

- 在 `?debug` 的 overlay 上加顯示偵測更新率（Hz）和每次偵測的耗時（ms）。
- Claude 在 1920x1080 下，開著鏡頭量 30 秒的 fps：
  - 用瀏覽器的假鏡頭串流，或使用者的真實鏡頭。
  - 沒有手的時候，偵測仍會持續找手，所以成本相近。
- 判斷標準：fps 至少 45，且偵測更新率至少 20 Hz，才維持在主執行緒執行。
  - 不達標時，先調降偵測頻率或影像解析度。
  - 還是不達標，就把 `HandTracker` 移到 Web Worker，用 `ImageBitmap` 傳送影像。這需要新增任務，並回報使用者。

### D10. 開場畫面

- 純 DOM 疊加在畫面上。`src/ui/onboarding.ts` 和對應的 CSS 都放在 `index.html` 或同一個模組裡，不引入 UI 框架。
- 樣式：圓角半透明卡片，配合 Cozy 色票，中文文案。
- 狀態流程：

  ```
  choosing --"用滑鼠玩"--> mouse
  choosing --"開啟鏡頭"--> loading --成功--> camera
                               |
                               +--失敗--> mouse + 提示（約 5 秒後消失）
  ```

- 失敗分類，各自對應不同的提示文案：
  - `NotAllowedError`：權限被拒絕
  - `NotFoundError`：找不到鏡頭
  - 不是安全來源（`isSecureContext === false`）
  - 模型或 WASM 載入失敗
- 鏡頭用的 `<video>` 元素設定 `display: none`，不會加進可見的版面。

## Risks / Trade-offs

- [Claude 無法用真實的手驗收] → 用 D8 的重播模式驗證邏輯和畫面；最後安排一個由使用者實測的驗收任務，並把參數集中，方便依回饋調整。
- [MediaPipe 和 Three.js 搶同一顆 GPU，fps 下降] → 第一組先實測；有偵測頻率、解析度、Worker 三段備案（D9）。
- [模型檔 8 MB 讓首次載入變慢] → 只有按下「開啟鏡頭」才下載，滑鼠模式不受影響；載入時顯示提示。
- [固定比例的 world landmarks 對不同人的手大小不同] → 手在畫面上的大小會有些差異，這是可以接受的；捏合判斷用的是比例，不受影響。
- [被抓住的魚瞬間轉向逃走，可能看起來突兀] → 這是刻意的「受驚」效果；如果太突兀，再改成在 0.1 秒內完成轉向。
- [`Fish` 新增欄位，會影響既有的測試和建立函式] → `createSchool` 給預設值，既有測試應該不需要修改；如果需要修改，Codex 要在回報中說明。

## Open Questions

- 手的色票要用蜜桃色或奶茶色，由第一版截圖決定，只需要改 `palette.ts`。
- 可動區域 70% 和捏合門檻 0.25 / 0.40，要依使用者實測調整，只需要改 `HAND_PARAMS`。
