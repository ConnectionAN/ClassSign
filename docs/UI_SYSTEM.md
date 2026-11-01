# ClassSign UI 共用規範 · Visual Refresh v1.4

本文件是目前系統的 UI 維護入口，與 `UI_LAYOUTS.md` 的切版格式搭配使用。首次基準為 main `fe78a2c6c3b52b870b4b9e1b20cb06518eb38665`。本次只改外觀；資料、帳務、課務、權限及裝置操作流程維持原有程式。

## 樣式來源與責任

| 檔案 | 責任 | 維護原則 |
| --- | --- | --- |
| `src/style.css` | 原有桌面／iPad 基礎、側欄、雙欄、簽名及列印布局 | 不為配色改動尺寸或定位 |
| `src/mobile.css` | 手機專用操作布局與元件顯示 | 僅 `<768px`；不得搬動平板斷點 |
| `src/visual-refresh.css` | v1.4 共用色彩與元件外觀 | 在 main.tsx 最後匯入；主要規則限 `screen`，不覆寫業務布局 |
| `src/Mobile.tsx` | 手機斷點與既有分頁、導覽元件 | 不為美化修改狀態或操作流程 |

修改時先使用既有 class，新增共用視覺規則集中放在 `visual-refresh.css`。不得在個別頁面另寫品牌色、使用 `!important` 強行改布局，或新增與既有功能重複的元件。

## 原始品牌素材

| 用途 | 儲存路徑 | 原始附件 | SHA-256 |
| --- | --- | --- | --- |
| 登入寬螢幕背景 | `public/brand/jing-le-original-card.jpg` | 照片 1.jpg（638×1063） | `5DA64D6E850849C58562DE840F95C8CC00677958848E8D3ED31C7282EA33BFF6` |
| 導覽、登入及手機頁首 | `public/brand/jing-le-original-avatar.jpg` | 照片 2.jpg（638×638） | `75B71F8C0899D79E94AF96ABD9E99E16C8D83D8274E6D8F4C2EEC4977FD4A799` |

兩張檔案直接複製附件，沒有重編碼、重畫、裁切或改色。以完整比例顯示：`img` 採 `object-fit:contain`；背景使用等比尺寸，不用 `cover`。不得加上 filter、混色或以 SVG、AI 生成圖、字體重打取代中文字標。圖片內的原始紫色與 UI 主色不同，仍須保留原圖配色。

原本 PWA / favicon 的既有圖示本次不另造替代圖；後續如要換圖示，應從原檔另行核可製作，不能把含細字的原圖任意裁掉。

## 共用色彩

| 變數 | 值 | 用途 |
| --- | --- | --- |
| `--brand` | **`#CD76AC`** | 唯一品牌主色，主要按鈕及選取狀態 |
| `--brand-soft` | `#F9EDF4` | 次要選取底色、摘要、課程卡 |
| `--brand-ink` | `#67364F` | 淡底重點文字、鍵盤焦點 |
| `--ink` | `#302B33` | 內文、金額、主色按鈕文字 |
| `--muted` | `#69616B` | 次要文字及提示 |
| `--paper` | `#FCF9FB` | 頁面背景 |
| `--surface` / `--field` | `#FFFFFF` / `#FFFCFE` | 卡片與輸入欄位 |
| `--line` | `#E5DAE2` | 分隔線與邊框 |
| `--success-bg` / `--success-ink` | `#EAF3EE` / `#285A43` | 已完成／雙簽成功狀態 |
| `--warning-bg` / `--warning-ink` | `#FFF3E4` / `#79501E` | 請假與警示 |
| `--disabled-bg` / `--disabled-ink` | `#F1EFF2` / `#69616B` | 不可操作／取消 |

`--green` 是舊程式的主要操作色名稱，v1.4 對應 `var(--brand)`；不能再用它表示成功語意。品牌底色使用深色文字，避免白字在指定粉紫色上的對比不足。狀態同時保留既有文字，不只靠顏色識別。

## 元件格式

| 既有元件 | class／屬性 | 一致規則 |
| --- | --- | --- |
| 主要操作 | `.primary` | 品牌底、深色文字；保留原 disabled／載入條件 |
| 次要操作 | `button`、`.text` | 白底或原透明底；hover 淡品牌色；不改點擊區尺寸 |
| 導覽 | `.nav.active`、`aria-current=page` | 淡品牌底搭深品牌文字 |
| 學生選取 | `.student.chosen` | 淡品牌底、品牌邊框 |
| 卡片與資料區 | `.records`、`.folders`、`.metrics` | 白底、淡邊框及輕陰影，保留原圓角與留白 |
| 課程狀態 | `.schedule-card`、`.leave`、`.signed`、`.cancelled` | 一般／警示／成功／中性；保留原狀態文案 |
| 輸入欄位 | `input`、`select`、`textarea` | 共用輸入底色與焦點；手機維持原 16px 字級 |
| 雙簽 | `.sign-grid`、`.signature` | 保留 canvas 尺寸、touch-action 與手機兩步流程 |
| 教材與學費袋 | `.billing-materials`、`.invoice-print` | 與一般卡片共用邊框；金額維持深色及原計算 |
| 報表 | `.report-definition`、`.report-table`、`.mobile-report-card` | 說明淡品牌底；手機卡片／桌面表格切換不變 |

既有字級、留白、欄寬、滾動區與圓角數值以 `style.css`／`mobile.css` 為準，本次不建立第二套尺寸。主要參考：內文 15px、欄位與按鈕最小 44px；原字體序列 Arial / PingFang TC / Microsoft JhengHei / sans-serif。中文字標是圖片，不是系統字體。

## 維護流程

1. 在獨立分支修改，先確認目前 main 與對應頁面的既有樣式。
2. 純外觀先改共用 token 或元件 selector；需要新增尺寸／DOM 結構時先核對 `UI_LAYOUTS.md`。
3. 在同一份 PR 更新這兩份文件，說明適用元件、斷點、狀態及測試結果。
4. 依 `UI_ACCEPTANCE.md` 產生前後畫面與幾何比對，執行功能與列印驗收。
5. 先提供預覽、列明未驗收項目，使用者確認後才能正式部署。

本次禁止修改 Supabase schema、RLS、RPC、帳務計算、課務規則或登入流程。外觀變更不應引入新的資料請求。
