# Spec Delta

## Purpose

在魚缸中用一隻 Cozy Low Poly 風格的 3D 手呈現使用者的手勢，讓使用者清楚看到自己的手在哪裡、有沒有捏住，並和整體美術風格一致。

## ADDED Requirements

### Requirement: Low Poly 3D 手
偵測到手時，魚缸中 SHALL 顯示使用者指定的 Low Poly 手模型（Poly Pizza「Low poly hands」，Anastasiia Ku，CC BY 3.0），重新上色為柔和膚色並使用平面著色。模型 SHALL 在執行期依手部關鍵點變形，讓手指能彎曲；外觀 SHALL 保持原模型的造型，關節處不出現破面或撕裂。左右手 SHALL 使用模型中對應的那一隻。

#### Scenario: 手的外觀
- **WHEN** 鏡頭模式下使用者舉起手
- **THEN** 魚缸中出現 Low poly hands 模型的手，膚色、稜面清楚，手指隨使用者的手勢彎曲，沒有破面或撕裂

### Requirement: 手勢同步
3D 手的五根手指 SHALL 即時反映使用者手指的彎曲和張開；畫面上的手 SHALL 是使用者那隻手的鏡像，舉右手時畫面上是右手的樣子。

#### Scenario: 比手勢
- **WHEN** 使用者依序張開手掌、握拳、比出食指
- **THEN** 3D 手依序呈現相同的手勢

#### Scenario: 捏合時兩指相碰
- **WHEN** 使用者做出捏合手勢
- **THEN** 3D 手的大拇指和食指指尖靠在一起

### Requirement: 固定大小與位置
3D 手的捏合點（大拇指和食指指尖的中點）SHALL 對齊手的游標位置；手在畫面上的大小 SHALL 固定，不因為手和鏡頭的距離改變。手 SHALL 顯示在魚群前方。

#### Scenario: 手前後移動
- **WHEN** 使用者把手從距離鏡頭 40 公分移到 80 公分
- **THEN** 畫面上 3D 手的大小幾乎不變

### Requirement: 捏合回饋
手進入捏住狀態時，大拇指和食指指尖 SHALL 發光，並在捏合點冒出一小串氣泡；離開捏住狀態時，發光 SHALL 消失。

#### Scenario: 捏住
- **WHEN** 手進入捏住狀態
- **THEN** 兩個指尖發光，捏合點冒出氣泡

#### Scenario: 放開
- **WHEN** 手離開捏住狀態
- **THEN** 指尖恢復原本的顏色

### Requirement: 手離開時淡出
手的游標從輸入狀態中移除時，3D 手 SHALL 在約 0.3 秒內淡出，不可以突然消失；手再次出現時 SHALL 淡入。

#### Scenario: 手移出鏡頭
- **WHEN** 手的游標被移除
- **THEN** 3D 手在約 0.3 秒內淡出消失

### Requirement: 模型授權標示
因為手模型使用 CC BY 3.0 授權，頁面 SHALL 標示作者、來源與授權。

#### Scenario: 開場畫面的標示
- **WHEN** 使用者看到開場畫面
- **THEN** 卡片底部有一行小字：3D 手模型「Low poly hands」by Anastasiia Ku（Poly Pizza，CC BY 3.0）
