# Proposal

## Why

使用者想把魚缸裡的 3D 手換成他提供的手套模型（Sketchfab「Project Playtime | Glove Hand」，Xoffly，CC BY 4.0），讓手更有角色感。現在的手是重新上色成膚色、平面著色的 VR Hands 右手；新模型有自己的貼圖和顏色，使用者決定保留原樣，不改成純色 Low Poly。

## What Changes

- 手模型改用手套 GLB（`public/models/glove-hand.glb`），取代 `vr-hand-right.glb`。原檔 1.9 MB，貼圖壓縮後目標小於 600 KB。
- 保留手套原本的貼圖材質（顏色、法線、粗糙度貼圖），不再換成膚色平面著色材質。
- 手套檔案裡有兩隻上下鏡像的手，只使用第一隻。
- 手套是**左手**模型：舉左手時直接呈現，舉右手時用鏡像的左手呈現（和現在相反）。
- 骨架對應改成手套的骨頭名稱；手指仍只轉骨頭、不改骨頭長度。
- **移除捏住時的指尖發光**，捏住時只保留氣泡，手套外觀不變。
- 淡入淡出、固定大小、捏合點對齊游標、第一人稱與左右手規則都不變。
- 移除舊的 `vr-hand-right.glb`，測試改用手套模型。
- README 中手模型的描述同步更新（左手模型、鏡像方向）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `hand-avatar`：「Low Poly 3D 手」需求改為手套模型、保留原貼圖、左手模型鏡像為右手；「捏合回饋」移除指尖發光，只保留氣泡。

## Impact

- 程式：`src/render/hand/hand-rig.ts`（骨頭名稱表、模型左右手設定）、`src/render/hand/hand-avatar.ts`（選第一隻手、材質、移除頂點色發光）、`src/config/params.ts`（可能的大小與傾斜參數）、`src/config/palette.ts`（刪除不再使用的膚色與發光色）。
- 素材：新增 `public/models/glove-hand.glb`，刪除 `public/models/vr-hand-right.glb`。
- 測試：`tests/render/hand/glb-fixture.ts`、`hand-rig.test.ts`、`hand-avatar.test.ts` 改用手套模型，骨頭數不再是 21。
- 文件：README 手模型段落。
- 授權：CC BY 4.0，模型造型來自商業遊戲《Project Playtime》；使用者已知情並決定使用。
- 不影響：手部追蹤、抓魚、魚群、手機畫圖、轉交。
