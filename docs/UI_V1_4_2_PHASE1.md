# ClassSign v1.4.2 Phase 1 視覺驗收

基準：GitHub main a008e28（Release v1.4.1），2026-11-01。未合併 PR #15 為舊 v1.4 草稿；本次從 main 獨立實作，不包含其未合併內容。

僅處理學費袋與收款管理，等待使用者視覺確認。未合併 main、未部署正式網站，未進入 Phase 2。

## 修改與差異

- src/Billing.tsx：沿用 UI.tsx 的 SectionHeading、StudentIdentity、StatusBadge、MetricCard、NavigationIcon。學費袋清單改為學生識別、月份、文字狀態、分層金額與選取框線；以 aria-pressed 表達目前選取。
- 明細身份區、單號、列印與狀態分組；將原本段落內三項金額移至摘要卡，其他期欠款與抵扣獨立成列。保留原金額運算、狀態判斷、請求與 callbacks。
- 課程、教材、自訂費用與抵扣仍使用原始明細及表格語意；調整金額對齊、備註字級、刪除操作間距。沒有新增費用分類或計算。
- src/visual-refresh.css：新增 billing 範圍的排版與 A4 支援。清單在手機單欄、iPad／較窄電腦雙欄、寬電腦三欄。手機未收摘要佔整列；收款表單獨立底色、邊框、標題及主操作。品牌底色仍為 #CD76AC，按鈕採深色文字以通過 4.5:1。
- 新增 previews/billing/：獨立開發預覽路徑，以實際完整 React app 配合記憶體假 API，可測試開立、收款、沖銷、費用刪除／還原；重新載入重置。攔截全部 fetch，沒有正式 Supabase 寫入。測試資料不代表完整後端驗證規則。
- 新增 visual-v142.spec.ts：八尺寸 × 五狀態及列印，共 96 張 Before／After PNG、兩份 A4 PDF。Before 在修改 Billing 與 CSS 前擷取。docs/visual-v142 收錄手機、iPad、電腦部分收款各一組 Before／After。
- 三個既有 UI 測試只修改截圖輸出位置至專案內 artifacts，原斷言不變。playwright.review.config.ts 可對已啟動伺服器執行測試，避免 Windows 啟停問題。

## 結果

- TypeScript / Vite：npm run build 通過。
- 既有功能：npm test，59/59 通過。
- 完整 Playwright：54/54 通過，包含原 46 項及新增八尺寸，無跳過。
- 寬度：320、375、390、430、768、1024、1280、1440px。每種五狀態無頁面橫向溢出。使用 Chromium，並非真實 iOS／Safari 裝置驗證。
- 鍵盤：學費袋按鈕可聚焦、Enter 選取、aria-pressed 更新、可見焦點外框。原輸入標籤、原生按鈕、details／summary 與表格語意保留。
- 對比：八尺寸逐一計算新增主要操作按鈕與五狀態 badge 的文字對比，皆至少 4.5:1；輔助文字改用 #655D69、輸入框增加可辨識邊框。非完整 WCAG 認證，未執行真實讀屏器測試。
- 學費袋與報表列印回歸通過，A4 均為一頁；PDF 經 Poppler 轉圖檢視，無截字或重疊。實體印表機仍待使用者確認。
- public/brand 兩張原 JPEG、Reports.tsx、登入驗證、client、Supabase、帳務 request／handler／金額計算均未修改。

## 本機預覽與證據

以測試環境變數啟動 Vite（只使用 invalid 假網域與公開測試字串）：

```powershell
$env:VITE_GOOGLE_AUTH_ENABLED='true'
$env:VITE_SUPABASE_URL='https://classsign-test.invalid'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test'
npm run dev -- --port 4185 --strictPort
```

- 操作：http://127.0.0.1:4185/previews/billing/ （導覽選「收費／學費袋與收款」，月份 2026-11）
- 全部比較：http://127.0.0.1:4185/artifacts/visual-v142/index.html
- 執行：npx playwright test --config playwright.review.config.ts --workers=4
- 完整畫面、JSON 結果及 PDF 留在 artifacts/visual-v142；此目錄不進版控、不進正式 build。previews HTML 也不在預設 Vite 生產入口內。

## 代表畫面

| 裝置 | Before | After |
| --- | --- | --- |
| 手機 390 | [Before](visual-v142/before-390.png) | [After](visual-v142/after-390.png) |
| iPad 768 | [Before](visual-v142/before-768.png) | [After](visual-v142/after-768.png) |
| 電腦 1440 | [Before](visual-v142/before-1440.png) | [After](visual-v142/after-1440.png) |

## 2026-11-01 使用者確認發布及修正

使用者要求修正後直接部署正式站，取代本文件前述的暫不發布限制；仍僅處理 Phase 1 與指定 UI 缺陷，未進入 Phase 2。

- 手機底部導覽與學生摘要卡統一使用共用 SVG，移除人物／收費的文字符號。
- 月份／日期欄位加上 WebKit appearance、min-width 與 inline-size 約束；學費袋產生表單改用可收縮 grid 軌道，避免 iPhone 原生欄位撐出卡片。
- 新增 WebKit 測試配置。Chromium 完整 54 項通過，新增欄位邊界／SVG 斷言後八尺寸 Chromium 與 WebKit 各 8 項通過。WebKit 為 Windows 測試瀏覽器，非實際 iPhone。
- 使用者授權清理正式測試帳務。先將 9 張學費袋及帳務相關資料備份至本機 artifacts/private（不進版控），再於交易內僅刪除明確核對的 2 張草稿與 6 張作廢，以及對應未過帳明細。這 8 張均無任何收款紀錄。保留 1 張正式學費袋及其 $2,850 收款；付款、教材、抵扣及稽核紀錄逐筆比對不變，未修改 schema、RLS、RPC 或 migration。
- 「沖銷」保留原收款，另建一筆負額對應紀錄及原因；不實際執行銀行退款，也不刪除歷史。
