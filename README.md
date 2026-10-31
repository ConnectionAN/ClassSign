# 琴課簽到簿

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
