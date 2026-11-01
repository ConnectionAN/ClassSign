# ClassSign v1.4.1 驗收格式

## 每次 PR 必備

- main 基準 SHA、v1.4 比較 SHA、預覽 SHA／網址與 PR。
- 原始素材 SHA-256、品牌 #CD76AC、紫底白字與 disabled 狀態。
- 手機 375×768、390×768；iPad 768×1024、1024×768；桌面 1440×768。
- 登入另測上述寬度、手機高度 844；舊觸控回歸仍包含 320／430。
- Before／After：登入、課表預設、單日、週、雙簽、學生列表、學生詳情、備註。
- 明確列出排版差異與功能入口保留狀態，不再要求 v1.4 的 x/y/尺寸完全一致。
- 建置、功能回歸、列印及未驗收事項；正式部署須使用者確認。

## 執行

1. Node 24、npm ci、npm test。
2. 提供測試用 VITE_SUPABASE_URL 與 Publishable key 建置；npm run build。Cloudflare 使用原環境設定，不在文件暴露值。
3. npm run test:ui -- --workers=2；visual-v141.spec.ts 預設 After。測試攔截 API，使用固定日期與同一批範例資料。
4. UI141_PHASE=before-main 在原 main 擷取；UI141_PHASE=before-v14 在 v1.4 擷取。可將新增截圖 spec 複製到基準工作樹使用，不能在改版後重建 Before。
5. 截圖輸出到執行目錄往上兩層 outputs/visual-v141/{before-main,before-v14,after}。主要 PNG 為視窗畫面，-full.png 提供長頁內容；模態及登入單獨擷取。素材與版面未由 AI 合成。
6. 檢查手機文件無橫向溢出、平板週課表僅在容器內捲動、收合七欄不超出視窗、雙欄捲動不影響另一欄、旋轉不清除備註。
7. 列印採既有 billing/reports 測試輸出；不得讓螢幕裝飾遮蔽學費袋、文字或金額。

## 範圍

瀏覽器截圖為實際 React 頁面與 Chromium 渲染，使用模擬資料，沒有登入正式帳號或寫正式帳務。自動測試不代表真實 iOS/Safari/Apple Pencil、正式 Google Provider 或實體印表機驗收。報告不可將這些項目寫成通過。

歷史 UI_V1_4_REVIEW.md 僅記錄前一版結果；本版以 UI_V1_4_1_VISUAL_REPORT.md 與最新測試報告為準。
