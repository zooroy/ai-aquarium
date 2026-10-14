# Spec Delta

## MODIFIED Requirements

### Requirement: 全螢幕魚缸畫面
在非手機裝置上，系統 SHALL 以整個瀏覽器視窗作為魚缸畫面，不顯示捲軸，也不顯示任何鏡頭影像；視窗大小改變時，畫面 SHALL 跟著調整，並維持正確的長寬比。手機上 SHALL 不顯示魚缸，改顯示畫圖頁（見 phone-drawing）。

#### Scenario: 開啟頁面
- **WHEN** 使用者在桌電、筆電或 iPad 上開啟應用程式頁面
- **THEN** 魚缸場景填滿整個視窗，頁面沒有水平或垂直捲軸

#### Scenario: 調整視窗大小
- **WHEN** 使用者把視窗從 1280x800 調整成 800x1000
- **THEN** 畫面在下一幀填滿新的視窗尺寸，場景物件沒有被拉伸變形

#### Scenario: 在手機上開啟
- **WHEN** 使用者在手機上開啟應用程式頁面
- **THEN** 畫面是畫圖頁，沒有魚缸場景
