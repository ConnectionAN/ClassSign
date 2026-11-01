# ClassSign UI 共用規範 · v1.4.1

本版依新的視覺重構授權取代 v1.4「只改色、不改尺寸」限制。允許改卡片、資訊層級、元件尺寸與留白；既有入口、功能流程、驗證與資料請求維持原程式。基準 main 為 fe78a2c，v1.4 比較來源為 c2c9a78（PR #15）。

## 樣式與責任

| 來源 | 責任 |
| --- | --- |
| src/style.css | 原有基礎結構、功能元件及列印規則，不改業務用途 |
| src/mobile.css | 原手機流程與 <768px 切換 |
| src/visual-refresh.css | v1.4.1 的集中視覺與響應式排版；screen 規則不進入列印 |
| src/UI.tsx | 可重用的純展示元件；不持有業務 state、不呼叫 API |
| Schedule.tsx / Studio.tsx | 組合 UI 元件，保留原 handlers、驗證、資料與條件 |

## 品牌與 token

兩張 public/brand 原始 JPEG 保持完整檔案及配色，不重畫、不裁切、不使用 filter。頭貼用於導覽與登入品牌列；直式原圖保留於素材庫，**不在登入頁顯示**。

- jing-le-original-avatar.jpg SHA-256：75B71F8C0899D79E94AF96ABD9E99E16C8D83D8274E6D8F4C2EEC4977FD4A799
- jing-le-original-card.jpg SHA-256：5DA64D6E850849C58562DE840F95C8CC00677958848E8D3ED31C7282EA33BFF6

| 變數 | 值 | 用途 |
| --- | --- | --- |
| --brand | #CD76AC | 唯一品牌主色 |
| --brand-soft / --brand-ink | #F9EDF4 / #67364F | 淡底、選取與文字 |
| --ink / --muted | #302B33 / #77717B | 主文與輔文 |
| --paper / --surface | #F7F8FB / #FFFFFF | 畫布與卡片 |
| --line | #EBE6EC | 邊框與分隔線 |
| --success-bg / --success-ink | #EAF5EE / #357650 | 已雙簽 |
| --warning-bg / --warning-ink | #FFF4E5 / #95652B | 請假與警示 |
| --disabled-bg / --disabled-ink | #F1F1F5 / #787582 | 停用與取消 |
| --radius-card / --radius-control | 20px / 10px | 卡片及控制項 |

依使用者要求，**所有品牌紫色實底按鈕及選取按鈕使用白字**；停用則改為中性灰底，不再保留紫底。淡紫底標籤與側欄使用深品牌文字。--green 僅為舊 primary hook 的相容別名，不代表成功語意。

## 可重用元件

| 元件 | Props／用途 | 使用位置 |
| --- | --- | --- |
| Button | 原生 button props + variant=primary/secondary/quiet；完整傳遞 disabled、aria、onClick | 課表工具、課程卡、學生簽到與列表 |
| SectionHeading | title、eyebrow、description、actions | 課表、補課區與學生列表 |
| StatusBadge | children、tone=planned/signed/leave/cancelled/neutral | 課程卡、在學狀態、學生人數 |
| MetricCard | label、value、unit、description、icon | 學生頁三張摘要卡；顯示原計算結果 |
| StudentIdentity | name、description、large | 列表與學生個人頁；large 提供二級標題語意 |
| StudentListItem | name、description、count、selected、onClick | 學生列表；選取保留 aria-pressed |
| SegmentedControl | label、value、options、onChange | 日／週切換，保留 button 與 aria-pressed |
| LessonCard | time、name、status、label、onClick、children | 日／週課表、已排補課 |
| CalendarDayHeading | date、weekday、count、today | 日期層級與當日標示；純顯示 |

主要字體沿 Microsoft JhengHei / PingFang TC / system-ui；內文預設 15px，標題桌面 27px、手機 23px；手機輸入維持至少 16px。操作按鈕多採 42–44px，較小輔助操作依所在元件定義。卡片依 8/12/16/20/24px 留白節奏設計，不在單頁複製另一套 token。

## 後續維護

1. 先核對 UI_LAYOUTS.md 的容器與斷點，再使用上述元件。
2. 資料、handlers、驗證留在呼叫端。UI.tsx 不可匯入 client、Supabase 或帳務模型。
3. 先使用既有 token 與 variant；新增狀態須在本文件、元件及截圖案例同步登記。
4. 依 UI_ACCEPTANCE.md 跑功能、尺寸、白字與素材雜湊驗證。
5. 提供預覽與逐頁差異，使用者確認後才能正式發布。


## 網頁與 PWA 圖示

所有圖示從完整原始頭貼等比縮製，沒有重畫、改色或裁掉中文字標。原始 JPEG 保持不變。來源是含 Japan Color 2001 Coated ICC 的 CMYK JPEG，匯出 RGB 圖示時依原 ICC 轉成 sRGB，維持與原圖在瀏覽器中的顯色一致，避免直接丟棄色彩描述檔造成偏紫。

| 項目 | 檔案 |
| --- | --- |
| 瀏覽器分頁／附圖的小圖示 | /favicon.ico（16／32／48）、/icons/classsign-brand-32.png |
| 原 icon.svg 相容路徑 | /icon.svg，內嵌同一份 192px 原圖衍生 PNG，不依賴外部 SVG 載圖 |
| iPhone／iPad 加到主畫面 | /icons/classsign-brand-180.png，apple-touch-icon |
| PWA 一般圖示 | /icons/classsign-brand-192.png、classsign-brand-512.png |
| Android 可遮罩圖示 | /icons/classsign-brand-maskable-512.png，原圖完整縮至 384px，周圍各 64px 同原背景色留白 |

manifest 指定 192／512 PNG 與獨立 maskable PNG；不再以綠底音符當正式圖示。更新後瀏覽器分頁及已安裝 PWA 可能需重新載入或等待平台更新圖示快取，不能僅憑網站部署宣稱每台已安裝裝置已更新。

需要重製時，以 Python + Pillow 執行 `python scripts/generate-brand-icons.py`。產物納入儲存庫，正常前端建置不需要 Python。不得改用繪製音符、字型或 AI 提案替代原圖。


## 左側導覽圖示

NavigationIcon 使用同一套 24×24 viewBox、18px 顯示尺寸、1.8px 圓角描邊 SVG，以 currentColor 跟隨選取狀態。日週課表＝月曆、學生＝人員、報表＝圖表、學費袋＝錢包、帳號＝身分卡。圖示 aria-hidden，不加入重複可存取名稱；按鈕文字、事件與鍵盤焦點保留。不得再以 Unicode 方塊／文字符號代替導覽圖示。
