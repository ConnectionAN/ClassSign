# 琴課簽到簿

UI 維護與切版請從 [共用視覺規範](docs/UI_SYSTEM.md)、[切版與裝置對照](docs/UI_LAYOUTS.md)、[驗收格式](docs/UI_ACCEPTANCE.md) 開始。品牌原檔與系統主色分別管理，請勿重畫或改色原圖。

iPad 優先的鋼琴一對一課程簽到、師生手寫簽名與應收統計。

## 開發

需要 Node.js 24。複製 `.env.example` 為 `.env.local`，填入 Supabase Project URL 與 Publishable key。

```sh
npm ci
npm run dev
npm test
npm run build
```

## Cloudflare Pages

- Framework：React / Vite
- Build command：`npm run build`
- Output directory：`dist`
- Environment：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`

只使用公開用途的 Publishable key，絕不將 secret / service_role key 放進前端。

## Supabase

空白專案的初始化 SQL 位於 `supabase/migrations/001_studio.sql`。已完成初始化的專案請勿重複執行。
老師帳號由管理員建立並加入 `teacher_access`；所有表啟用 RLS，寫入經過交易函式驗證。
簽名目前與課程同筆儲存，調價不影響既有課程。統計金額代表授課應收，不代表實收。

完整操作與驗收請見 `設定指南.md`。正式使用前請安排完整備份及還原。

## Google 登入（保留帳密）

請見 [Google 登入設定與測試](Google登入設定與測試.md)。預設關閉新介面；完成 Provider、身分核對及網域設定後，設定 VITE_GOOGLE_AUTH_ENABLED=true 並重新建置。不需要資料遷移。

## Google 自動建立帳號與帳號管理

目前登入規則以 [帳號管理設定與測試](帳號管理設定與測試.md) 為準：Google 直接登入、自動加入共用工作室，只有既有管理員可停用／恢復帳號。舊 Google 手動綁定指南供歷史參考。

## 學生固定時段與下次上課

登入預設開啟課表；學生資料夾可檢視及修改固定時段，並顯示納入調課、請假與補課的下次上課時間。封存會停止後續安排。詳見 [學生課表調整與測試](學生課表調整與測試.md)。
