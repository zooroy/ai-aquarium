# Spec Delta

## MODIFIED Requirements

### Requirement: Low Poly 游標呈現
每一個來源為滑鼠或觸控的游標 SHALL 在魚缸中顯示為一個 Low Poly 風格的小物件，位置跟隨游標；按下狀態時 SHALL 有明顯不同的外觀（例如放大或發光），系統原生的滑鼠指標 SHALL 在魚缸上隱藏。來源為 `hand` 的游標 SHALL 由 3D 手呈現，不顯示多面體游標。

#### Scenario: 游標外觀
- **WHEN** 使用者在魚缸上移動滑鼠
- **THEN** 系統原生指標不顯示，改為一個跟著移動的 Low Poly 游標物件

#### Scenario: 按下時的回饋
- **WHEN** 使用者按住滑鼠左鍵
- **THEN** 游標物件的外觀明顯改變，放開後恢復原狀

#### Scenario: 手的游標不顯示多面體
- **WHEN** 鏡頭模式下偵測到手
- **THEN** 魚缸中只顯示 3D 手，手的位置沒有多面體游標
