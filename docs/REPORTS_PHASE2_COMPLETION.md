# Phase 2 補齊與視覺化驗收

基準 main：49ebc3506eb91069562592d5bc52dc68892968ee（開始前重新查核 GitHub）。
分支：visual-refresh/phase2-completion。僅開發與預覽，未合併、未部署正式站，未開始 Phase 3。

## 逐項完成內容
| 規格 | 實作與證據 |
|---|---|
| 五大報表視覺化 | 營運總覽／學費袋：收款進度；實際收款：現金／轉帳淨額長條；課務：各原有堂數長條；教材：各代收狀態金額長條。全部保留文字與數值，不只靠顏色。 |
| 收款比例口徑 | 使用既有 summary.allocated / summary.due；實收淨額 summary.cash 仍獨立呈現，不混入待抵扣或前期未收。無正數應收、負數配置不畫比例；超收保留真實金額與百分比，僅圖形截在100%。 |
| 原計算與資料 | reportModel.ts、Supabase、migrations、OAuth、課表、雙簽、Billing 均未修改。只在 Reports 組裝展示尺度，UI 元件接收展示值。 |
| 金額欄位 | 桌面與手機明細採 NT$、千分位、數字對齊；負數不省略。課堂數與教材數量不套幣別。 |
| 教材數量 | 從既有 report.materials.quantity 顯示於手機／表格／列印。CSV 欄位維持原樣，新增數量僅屬展示欄位。 |
| 作廢學費袋 | 沿用已發布排除規則，桌面、手機、CSV、列印、有效學費袋跳轉皆不納入作廢袋。 |
| 手機互動 | 恢復明細預設收合，保留原 summary 展開方式、底部導覽與下載入口；測試展開後再擷取完整明細對照，另驗證初始收合。 |
| 指定裝置 | 320×900、375×900、390×900、430×900、768×1024、1024×768、1280×900、1440×900，Chromium／WebKit 均驗證。 |
| Before／After | 每個瀏覽器40張Before＋40張After，兩瀏覽器共160張。真實React、固定資料／時間／篩選／尺寸。Before為已發布main，而非最初Phase 2前版本；先前80張仍另存於舊交付。 |
| 前後結果一致性 | 改版前兩瀏覽器匯出的5份CSV逐字相同，存為可攜基準；改版後再次逐字比對5份CSV，兩瀏覽器均通過，涵蓋原始數值、日期、範圍、欄位、排序及公式防護。 |
| 鍵盤與對比 | 方向鍵、Home／End、焦點可見、Enter展開與手機下載入口已驗證。對比檢查可見報表標題、段落、標籤、按鈕、有效輸入、表頭／儲存格及指標文字；一般4.5、大字3，停用控制不在門檻內。 |
| 列印 | 五份A4各一頁，另67筆教材五頁。Poppler逐頁渲染檢查；金額無重疊，資料列不跨頁切斷，表頭重複；PDF文字檢查65筆新增教材均存在，頁尺寸均A4。螢幕圖表不進列印，保留既有正式表格。 |
| 品牌 | #CD76AC保留；兩張原圖SHA-256與基準一致。補充文字#68616D；未收#9A386F；結清#285C3A／#EAF5EE、待收#754914／#FFF4E5；均限報表展示。 |

## 實際測試結果
- TypeScript / Vite build：通過。Vite有單檔超過500kB的建議警告，沒有build錯誤；未擴大做全站拆包。
- npm test：59通過、0失敗、0跳過。
- 全部UI（Chromium，既有＋新增）：78通過、0失敗、0跳過、0 flaky；同一次完整執行。
- Chromium / WebKit報表專項：22通過、0失敗、0跳過；每瀏覽器11項，包含八尺寸、鍵盤、負數／零值／超收、多頁列印。
- Before基準：16通過、0失敗、0跳過。
- 過程失敗有保留：第一次擴大對比測試16失敗／2通過（次要文字對比及裝飾span誤判）；修正後一輪8失敗／12通過（測試重複假設切換分類會重新收合，實際沿用原展開狀態）。修正測試於首次入頁驗證收合後，最終22／22通過。沒有隱藏或跳過失敗項目。
- 打包後互動預覽：Chromium、WebKit均HTTP200、無page errors、無外部HTTPS請求；固定2026-10，與比較資料一致。

## 改動檔案
src/Reports.tsx、src/UI.tsx、src/visual-refresh.css；previews/reports/preview.ts；手機／報表既有測試；新增report-fixture.ts、report-completion.spec.ts、playwright.completion.config.ts、五份CSV基準與本驗收文件。
新增共用展示元件：ReportCollectionBar、ReportBreakdown。延用ReportMetricCard、ReportSectionHeading、StatusBadge、MobileReportSection，未另建設計系統。

## 人工驗收待辦（不宣稱通過）
- 真實iPhone與iPad的直橫向、Safari下載與列印操作。
- Apple Pencil實機操作；本次未改Canvas。
- VoiceOver等讀屏器；本次有語意、鍵盤及文字對比檢查，但不等於實機讀屏器驗收。
- 實體印表機與使用者最終視覺驗收。

## 重現
npm ci；npm test；npm run build；npx playwright test --workers=2；npx playwright test --config playwright.completion.config.ts --workers=2。
互動預覽以測試環境變數啟動Vite，進入 /previews/reports/。固定時鐘只存在專用合成資料預覽入口，不影響正式應用。

**Phase 2補齊開發完成，等待使用者視覺驗收與部署確認。**
