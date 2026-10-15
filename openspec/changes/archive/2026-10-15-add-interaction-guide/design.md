# Design

## Context

- **開場流程**：`createOnboarding` 產生開場卡。`createOnboardingController` 管理狀態：`choosing → loading → camera`，或 `choosing → mouse`。
  - 進入 `mouse` 或 `camera` 時會呼叫 `callbacks.finished?.()`。
  - 鏡頭失敗退回時，`mouse` 會先後觸發兩次：一次帶失敗提示，約 5 秒後再一次清掉提示。所以 `finished` 可能被呼叫不只一次。
- **replay 模式**（`?handReplay`）：跳過開場卡，`App` 直接呼叫 `customFish.show()`。
- **UI 共用元件**：`src/ui/cozy.ts` 有 `createLayer`（全螢幕遮罩加卡片，會攔下 pointer 事件）和 `createButton`。
- **測試環境**：Vitest 用 node 環境，DOM 測試以假的 `document` 物件注入（例如 `notice.test.ts`）。所以邏輯要和 DOM 分開，讓邏輯能在沒有瀏覽器的情況下測試。
- **手套姿勢**：`MouseHandPose` 和 `HandAvatar` 可以穩定產生張開、捏合、握拳三種手套姿勢。

## Goals / Non-Goals

**Goals:**
- 選完模式後出現對應的說明卡，用圖片加文字說明每個操作。
- 左下角常駐「操作說明」按鈕，可以再次開啟。

**Non-Goals:**
- 不記住「看過了」，每次載入頁面都會在選完模式後出現（使用者選擇的方式）。
- 說明卡開啟時，手勢仍然可以操作魚缸（只有滑鼠和觸控會被遮罩擋下），不暫停抓取。
- 不做動畫教學，也不做逐步引導。
- 手機的畫圖頁不受影響。

## Decisions

### 1. 介面（`src/ui/interaction-guide.ts`）

```ts
export type GuideMode = 'camera' | 'mouse';
export type MouseButtonMark = 'none' | 'left' | 'right';
export interface GuideImage { src: string; alt: string }          // src 已經過 assetUrl
export interface GuideItem { title: string; description: string; glove: GuideImage; mouse?: MouseButtonMark }
export interface GuideContent { heading: string; items: GuideItem[]; footnote: string }
export function guideContent(mode: GuideMode): GuideContent;

/** 純狀態：不碰 DOM，方便在 node 測試。 */
export function createGuideController(view: { render(mode: GuideMode, open: boolean): void; showButton(visible: boolean): void }): {
  start(mode: GuideMode, options?: { autoOpen?: boolean }): void; // 第一次呼叫：顯示按鈕；autoOpen（預設 true）時開啟說明卡。之後的呼叫只更新模式，不重新開啟。
  open(): void;    // 已 start 才有作用
  close(): void;
  readonly mode: GuideMode | null;
  readonly isOpen: boolean;
};

export function createInteractionGuide(doc?: Document): {
  start(mode: GuideMode, options?: { autoOpen?: boolean }): void;
  open(): void; close(): void; dispose(): void;
};
```

- `createInteractionGuide` 用 `createLayer('操作說明')` 建立說明卡，左下角再建立一個「操作說明」按鈕，然後把 view 接到 controller。
- **鍵盤**：在 `doc` 監聽 `keydown`，說明卡開著時按 Esc 會關閉。`dispose` 時移除監聽，並移除所有元素。

### 2. 內容（`guideContent`）

**鏡頭模式**
- **標題**：「手勢說明」
- **項目**：

| 名稱 | 手套圖 | 說明 |
|---|---|---|
| 張開手 | `guide/glove-open.webp` | 移動手來移動，魚會躲開你的手。 |
| 捏合 | `guide/glove-pinch.webp` | 大拇指碰食指，在魚身上捏住就能抓起牠；放開後魚會逃走。 |
| 握拳 | `guide/glove-fist.webp` | 魚群會游過來，繞著你的手轉圈；手張開後魚會散開。 |

- **下方提示**：「也可以用滑鼠：左鍵抓魚、右鍵聚魚。」

**滑鼠模式**
- **標題**：「滑鼠操作」
- **項目**：

| 名稱 | mouse | 手套圖 | 說明 |
|---|---|---|---|
| 移動滑鼠 | `none` | open | 魚會躲開游標。 |
| 按住左鍵 | `left` | pinch | 在魚身上按住就能抓起牠；放開後魚會逃走。 |
| 按住右鍵 | `right` | fist | 魚群會游過來，繞著游標轉圈；放開後魚會散開。 |

- **下方提示**：「觸控螢幕：用手指按住魚，就能把牠抓起來。」

**替代文字**
- 手套圖：例如「手套張開的手」、「手套大拇指和食指捏在一起」、「手套握拳」。
- 滑鼠圖：例如「滑鼠，沒有按鍵」、「滑鼠，標示左鍵」、「滑鼠，標示右鍵」。

文字放在 `interaction-guide.ts` 的常數中（文案不是可調參數，不放在 params）。

### 3. 版面

- **卡片**：寬度 `min(720px, calc(100vw - 32px))`，用 `createLayer` 預設的外觀。
- **項目排列**：`display: grid; gridTemplateColumns: repeat(auto-fit, minmax(180px, 1fr))`。
  - 視窗寬的時候排成三欄。
  - 360px 時卡片內寬約 288px，只放得下一欄，自動變成上下排列，不需要 media query。
- **每個項目**：
  - 上方是圖片區，高 `GUIDE_PARAMS.imageSize`（120px）。
    - 滑鼠模式：滑鼠 SVG 和手套圖並排，中間放一個「→」。
    - 鏡頭模式：只有手套圖。
  - 圖片區的背景用 `PALETTE.water` 的圓角塊，讓透明背景的手套看起來在水裡。
  - 下方是名稱（粗體）和說明。
- **圖片載入失敗**：`img` 的 `onerror` 把圖片隱藏（`hidden = true`），文字不受影響。
- **「開始玩」按鈕**：用 `createButton('開始玩', true)`，放在卡片底部。
- **「操作說明」按鈕**：
  - `position: fixed`，`left` 和 `bottom` 都是 `GUIDE_PARAMS.buttonInset`（16px）。
  - `zIndex` 為 `DRAWING_UI_PARAMS.zIndex - 1`，和右上角選單同一層。
  - 用 `createButton`，加上陰影。
  - 和選單一樣，`stopPropagation` pointer 事件，避免點擊時也操作到魚缸。
  - `start` 前保持 `display: none`。

### 4. 滑鼠圖示（`src/ui/mouse-icon.ts`）

```ts
export function createMouseIcon(mark: MouseButtonMark, doc?: Document): SVGSVGElement;
```

- **圖形**：`viewBox 0 0 64 96`。外框是圓角長方形（滑鼠本體），上半部用一條中線分成左右兩鍵，中央有滾輪的小圓角長方形。
- **標示的按鍵**：
  - 填滿 `PALETTE.guideHighlight`。
  - 外框線寬 3，未標示的是 1.5。
  - 按鍵內再畫一個小圓點。
  - 這樣不必靠顏色，也看得出是哪一鍵（規格要求）。
- **無障礙**：`role="img"`，`aria-label` 用決定 2 的替代文字。
- 用 `doc.createElementNS('http://www.w3.org/2000/svg', …)` 建立，方便用假 DOM 測試屬性。

### 5. 接上開場流程

- **`onboarding.ts`**：`finished?(mode: 'mouse' | 'camera')` 帶入目前狀態。`changed` 進入 `mouse` 或 `camera` 時，傳入那個狀態。
- **`App`**：
  - 建立 `this.guide = createInteractionGuide()`。
  - `finished: (mode) => { this.customFish?.show(); this.guide?.start(mode); }`。`start` 只有第一次會開啟說明卡，所以鏡頭失敗時 `finished` 呼叫兩次也只開一次。
  - replay 模式：呼叫 `this.guide.start('camera', { autoOpen: false })`。只顯示按鈕，不擋住畫面，方便驗收和截圖。
  - `dispose` 時呼叫 `guide.dispose()`。

### 6. 手套圖片（Claude 產生）

用一個暫時的擷取頁產生圖片，用完就刪除，不 commit：
- **擷取頁**：`capture-guide.html` 加上 `.ts`，放在專案根目錄，由 Vite dev server 提供。
  - 建立 alpha 透明背景的 `WebGLRenderer`，大小 480×480。
  - 光源和魚缸的 lighting 相同。
  - 一個 `HandAvatar`，配合 `MouseHandPose` 分別產生張開、捏合、握拳三種姿勢（右手，看得到手背）。
  - 相機正對手套，捏合點放在畫面中央偏上，讓整隻手入鏡。
- **輸出**：
  - `canvas.toDataURL('image/webp', 0.9)`。
  - 存成 `public/guide/glove-{open,pinch,fist}.webp`，每張小於 40 KB。
- **為什麼不在執行時即時算繪**：三張靜態圖最省效能，而且說明卡不需要再載入一個 WebGL 場景。

### 7. 捏合圖改成手背視角（使用者回饋）

使用者希望三張手套圖都是手背視角。捏合圖從正後方拍時，食指彎到手掌後面被擋住，只剩中指直立，看起來像比中指。

做法：
- **角度**：相機從手背、偏拇指那一側約 35° 拍。
- **只在說明圖中調整手指**：中指、無名指、小指換成「握拳權重 0.3」的半彎姿勢，大拇指和食指維持捏合。這樣中指不再單獨直立，拇指和食指之間的圈也看得到。遊戲中的捏合姿勢不變。
- **後製**：裁掉透明邊、補成正方形，再縮成 240×240。注意 sharp 一定會先 resize 再 extend，所以這兩步要分開跑；否則會先被裁切，手指就被切掉。

### 8. 切換鏡頭與滑鼠（使用者回饋）

**狀態機（`createOnboardingController`）**

開場後也可以切換：
- `camera()`：允許在 `choosing` 或 `mouse` 狀態呼叫。在 `mouse` 時，先清掉失敗提示的計時器，再進入 `loading`，後面的流程和開場相同。
- `mouse()`：在 `choosing` 時照舊。在 `camera` 時，`session.dispose()` 停止所有 track 並釋放 tracker，然後呼叫 `clearHand()`、`report(undefined)`，再 `change('mouse')`。
- `loading` 期間兩者都不接受。

**DOM（`createOnboarding`）**
- 開場卡只在「還沒選過模式」時出現：`choosing`，或第一次的 `loading`。開場後的 `loading` 不再顯示開場卡。
- 新增切換按鈕 `toggle`（`createButton`），由 `createOnboarding` 回傳。按鈕文字：
  - `mouse` 時為「開啟鏡頭」。
  - `camera` 時為「改用滑鼠」。
  - `loading` 時為「鏡頭開啟中…」，並設為 disabled。
- 開場卡關閉前，`toggle` 都是隱藏的。

**擺放位置**
- `createInteractionGuide` 回傳 `toolbar`：左下角的 flex 容器，裡面放「操作說明」按鈕，`gap` 8px。
- `App` 把 `onboarding.toggle` 加進 `toolbar`，兩個按鈕就排在同一列，不會重疊。

**說明卡**
- `createGuideController.start(mode)` 改成「每個模式第一次 start 時自動開啟」：用一個集合記錄已經自動開過的模式。
- 鏡頭失敗退回時，`finished('mouse')` 可能被呼叫兩次，第二次不會再開。
- 從滑鼠第一次切到鏡頭時，會自動開啟手勢說明。

**測試**
- 控制器測試涵蓋以下情況：
  - `mouse → camera`：成功、失敗。
  - `camera → mouse`：會呼叫 track stop 與 tracker dispose，並呼叫 `clearHand`。
  - `loading` 期間不接受切換。
- 說明卡控制器測試涵蓋「每個模式第一次才自動開啟」。

## Risks / Trade-offs

- **[手套圖和遊戲中的光影略有不同]** → 用相同的 lighting 模組和材質，差異很小。
- **[說明卡開啟時，手勢仍會操作魚缸]** → 這是刻意保留的：可以邊看說明邊試手勢。如果使用者覺得干擾，再改成開啟時暫停抓取。
- **[每次都跳出來，常客可能覺得煩]** → 使用者選擇了這種方式。「開始玩」就在卡片底部，一鍵就能關閉；之後要改成只出現一次，也只需要加一個 localStorage 判斷。

## Migration Plan

純前端新增，直接部署。要回復時 revert 這次 commit 即可。
