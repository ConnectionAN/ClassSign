# Visual Refresh v1.4 驗收格式

## 每次 UI PR 應填寫

```text
基準 main SHA：
改版分支／PR：
預覽網址與對應 SHA：
原圖 SHA-256 核對：
變更頁面與共用元件：
布局／資料／流程是否改變：
建置與功能測試結果：
尺寸與視覺比對結果：
學費袋／報表 A4 列印結果：
未驗收事項：
使用者確認：待確認／已確認（日期）
正式部署：未部署／網址與 SHA
```

## 測試順序

1. 使用 Node 24 執行 `npm ci`、`npm test`、`npm run build`。
2. 執行 `npm run test:ui -- --workers=2`。既有測試以攔截 API 的模擬資料驗證登入、課表、雙簽、教材、帳單、收款與報表，不會寫入正式資料庫。
3. 執行 `npx playwright test tests/ui/visual-refresh.spec.ts --workers=2`，預設會對照已納入專案的 `tests/ui/fixtures/visual-v14-layout.json`（原 main 實測基準）。需要建立新一輪原版畫面時，在相同測試環境、原版樣式下設定 `VISUAL_PHASE=before` 擷取；改版後以 `VISUAL_PHASE=after` 重跑。不可將改版畫面覆蓋成原版基準。
4. `visual-refresh.spec.ts` 於 320、375、390、430、768、1024、1280、1440px 保存日／週課表、雙簽、學生、學費袋、報表及報表列印畫面；比對主要容器與 canvas 的 x/y/寬/高，必須完全一致。768 高度 1024，其餘此套測試高度 768；既有手機流程測試另採高度 844。
5. 圖片應有預期外觀差異；需人工檢視中文、截斷、狀態與焦點，不能把圖片差異直接視為失敗，也不能用通過幾何比對取代視覺檢視。
6. 既有 billing/reports 測試產生 A4 PDF 與列印畫面；檢查文字、金額及邊界，確認裝飾不進入列印。手機列印要另看是否保留原有的隱藏表格行為，不在此改版暗中修正功能。

畫面與 geometry JSON 預設位於執行目錄往上兩層的 `outputs/visual-v14/{before,after}`，不存入正式前端；全套回歸的列印檔位於 `test-results`。首次參考基準必須留存，不能在改版後才重建 before。

## 驗收邊界

自動測試採模擬 API，無法證明正式 Supabase、Google Provider、實際 Apple Pencil、實體印表機或 iOS 安裝 PWA 的行為。這些項目必須在回報中列為待真人驗收，不能宣稱全部已驗收。正式部署需要使用者確認，PR／分支推送或預覽成功不等於正式上線。

本次實測結果及既有問題見 `UI_V1_4_REVIEW.md`。
