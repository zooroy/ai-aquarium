# verification-pipeline Specification

## Purpose
在程式碼合併到 `main` 和部署之前，自動檢查型別、程式碼規則、單元測試、建置、相依套件安全與瀏覽器裡的基本行為，並留下可查閱的驗收證據。

## Requirements

### Requirement: PR 與 main 的自動檢查
對 `main` 開的 pull request 每次更新時，以及每次 push 到 `main` 時，系統 SHALL 自動執行以下檢查：型別檢查、lint、單元測試、正式建置、相依套件安全檢查、瀏覽器 smoke 測試。任何一項失敗時，該次執行 SHALL 顯示為失敗，並且可以看出是哪一項失敗。

#### Scenario: PR 全部通過
- **WHEN** 開發者對 `main` 開了 pull request，所有檢查都通過
- **THEN** PR 頁面上的檢查狀態顯示為通過

#### Scenario: 型別錯誤
- **WHEN** PR 裡有一個 TypeScript 型別錯誤
- **THEN** 檢查失敗，失敗的步驟是型別檢查，錯誤訊息指出檔案和行號

#### Scenario: 推送新的 commit
- **WHEN** 開發者對已經開啟的 PR 推送新的 commit
- **THEN** 檢查會對最新的 commit 重新執行

### Requirement: 檢查沒過不能合併
`main` SHALL 設定分支保護：必須經由 pull request 合併，而且上述檢查全部通過後才能合併。部署到 GitHub Pages SHALL 只在 `main` 有新的 commit 時進行，PR 的檢查 SHALL NOT 觸發部署。

#### Scenario: 檢查失敗的 PR
- **WHEN** PR 的任何一項檢查失敗
- **THEN** GitHub 不允許合併這個 PR

#### Scenario: PR 不會部署
- **WHEN** PR 的檢查執行完畢
- **THEN** GitHub Pages 上的網站維持不變，直到 PR 合併進 `main`

### Requirement: 專案規則的 lint 檢查
lint SHALL 在 `src/` 和 `tests/` 上檢查以下專案規則，違反時回報錯誤：
- 不使用 `any` 型別。
- 除了帶種子的亂數模組以外，不直接呼叫 `Math.random()`。
- `src/simulation/`、`src/core/`、`src/input/types.ts`、`src/input/input-manager.ts` 不 import Three.js 的渲染類別。數學類別仍可使用。

開發者 SHALL 能在本機用一個指令執行同樣的 lint。

#### Scenario: 直接使用 Math.random
- **WHEN** `src/simulation/` 底下的檔案呼叫 `Math.random()`
- **THEN** lint 回報錯誤，指出檔案和行號

#### Scenario: 純邏輯目錄 import 渲染類別
- **WHEN** `src/simulation/` 底下的檔案從 `three` import `Mesh`
- **THEN** lint 回報錯誤；同一個檔案從 `three` import `Vector3` 不會報錯

#### Scenario: 目前的程式碼
- **WHEN** 在這個 change 完成時的 `main` 上執行 lint
- **THEN** 沒有任何錯誤

### Requirement: 魚缸頁的瀏覽器 smoke 測試
smoke 測試 SHALL 在沒有鏡頭的 headless 瀏覽器中，對正式建置的網站驗證以下行為：
- 魚缸頁可以載入並畫出場景。
- 可以用滑鼠模式開始玩，操作說明卡可以關閉。
- 滑鼠在魚缸上移動、按左鍵、按右鍵都不會出錯。

整個過程 SHALL 沒有未捕捉的頁面錯誤，也沒有 console error。測試 SHALL 使用固定的亂數種子。

#### Scenario: 魚缸載入
- **WHEN** 測試開啟魚缸頁
- **THEN** 出現開場畫面和「用滑鼠玩」按鈕，畫布持續在更新（相隔一段時間的兩張畫布截圖不同）

#### Scenario: 用滑鼠開始玩
- **WHEN** 測試按下「用滑鼠玩」，再按說明卡上的「開始玩」
- **THEN** 開場畫面和說明卡都消失

#### Scenario: 滑鼠操作
- **WHEN** 說明卡關閉後，測試在魚缸上移動滑鼠、按住左鍵拖曳、按住右鍵
- **THEN** 沒有任何頁面錯誤或 console error

### Requirement: 手機畫圖頁的瀏覽器 smoke 測試
smoke 測試 SHALL 驗證以 `?mode=draw` 開啟網站時，會顯示手機畫圖頁而不是魚缸，而且沒有未捕捉的頁面錯誤或 console error。測試環境沒有轉交服務的設定時，頁面仍 SHALL 能載入。

#### Scenario: 開啟畫圖頁
- **WHEN** 測試以 `?mode=draw` 開啟網站，而且沒有提供轉交服務的設定
- **THEN** 頁面上沒有魚缸的畫布，顯示「畫一隻魚」標題和轉交服務無法使用的提示，沒有任何錯誤

### Requirement: 情境對照與驗收報告
專案 SHALL 維護一份對照表，用「capability＋情境名稱」對照 `openspec/specs/` 和進行中 change 的 spec 裡的情境和驗證方式：自動驗證的情境標出對應的 smoke 測試，其他情境標為手動驗收。每次 CI 執行 SHALL 產生一份 Markdown 驗收報告，並和瀏覽器測試報告一起保存為該次執行的 artifact。報告 SHALL 列出：
- 每個對照到的情境及其結果（通過、失敗、手動驗收）。
- 每個 capability 的情境總數、自動驗證數、手動驗收數、尚未對照數。
- 每項檢查的結果。
- 相依套件安全檢查的摘要。

#### Scenario: 產生報告
- **WHEN** CI 執行完畢，不論成功或失敗
- **THEN** 該次執行可以下載驗收報告和瀏覽器測試報告

#### Scenario: 對照到不存在的情境
- **WHEN** 對照表寫了一個在 spec 裡找不到的 capability 或情境名稱
- **THEN** 產生報告的步驟失敗，並指出是哪一個情境名稱

#### Scenario: smoke 測試失敗
- **WHEN** 某個 smoke 測試失敗
- **THEN** 報告裡對照到該測試的情境標為失敗

### Requirement: 相依套件安全檢查
CI SHALL 檢查正式相依套件（不含開發用套件）的已知漏洞，有 high 或 critical 等級時檢查失敗。所有相依套件（包含開發用套件）的漏洞 SHALL 列在驗收報告裡，但不讓檢查失敗。

#### Scenario: 正式相依套件有 high 漏洞
- **WHEN** 某個正式相依套件有 high 等級的已知漏洞
- **THEN** 安全檢查失敗

#### Scenario: 只有開發用套件有漏洞
- **WHEN** 只有開發用套件有 high 等級的漏洞
- **THEN** 安全檢查通過，驗收報告列出這些漏洞
