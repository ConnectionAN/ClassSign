# 既有正式資料庫遷移

2026-10-31 核對 main 7ee4e09；正式四張表及 studio_action 與 001 一致，但 migration history 為空（手動初始化）。正式庫不得重跑 001。

部署前先備份；確認 001 schema 基準後，僅將 001 標記 applied，再套用新增 migration。不要使用 db reset。程式分支不得直接合併 main，因 Cloudflare Pages 會自動部署。先套用並驗證增量 SQL，再部署前端。

固定課表以台北日期及分鐘保存，限制當日結束。每次檢視只實體化最多 62 日；模板衝突檢查涵蓋尚未實體化的未來週次。原課預估學費在模板建立時保存；補課沿用該快照，簽到時確認實際學費。

## 增量內容與操作

- `weekly_slots`：固定週時段與生效起訖，不覆寫舊版本。永久改時段先以停止日期結束舊時段，再新增新時段。
- `class_sessions`：每次預排課程，原排日期及補課原課關聯。調課歷史另存在 `schedule_events`。
- `lessons.session`：可空的新欄位，舊紀錄全部保留；部分唯一索引確保同次課程僅一筆有效雙簽。作廢後可建立新簽到，舊簽名仍保留。
- `studio_private`：搬移原 RPC 至不開放的 schema，新公開 RPC 繼續強制老師資格與 owner，authenticated 只有表格 SELECT 與公開 RPC EXECUTE。所有異動先取同一 owner 的交易鎖，順序固定為老師鎖、學生鎖、課程鎖。
- 請假每次必選補課與否；尚未安排及已安排未雙簽分開追蹤。補課再請假會建立下一層原課關聯；取消補課可重新安排，撤回原課請假前須先取消其補課。
- 封存停止模板，取消今日起未簽課程；已簽及過去紀錄保留，請假義務保留，恢復學生需重新安排固定課表。
- 補登實際學費必須確認；改日期、實際金額或確認狀態會清除雙方畫布並產生新的送出識別碼。

## 部署順序（需取得正式部署授權）

1. 備份正式資料庫，重新核對 main、schema 與 migration history，確認沒有其他人先行遷移。現有 001 由 SQL Editor 初始化，history 空白不代表空資料庫。
2. 依已核對的 001 schema 將版本 001 標記為已執行（migration repair），**不執行 001 SQL**。
3. 僅套用 `20261031074431_weekly_schedule.sql`。使用 MCP 時以 `apply_migration` 記錄該增量；使用 CLI 時確認待套用清單沒有 001。
4. 在交易內以正式老師身分驗證並 rollback 測試異動，重新檢查表格 RLS、grants、公開／私有函式的 EXECUTE。確認原學生與 lessons 數量／內容沒有受遷移影響。
5. 合併前端分支至 main，觸發 Cloudflare Pages。Supabase URL 與 publishable key 沿用部署環境；不可使用 secret/service_role key。
6. 完成正式網站與 iPad 雙簽驗收。出現問題先停止新寫入；不可用 DROP TABLE 或 db reset 回復。前端可回退，但新資料與歷史需保留。

本次未對正式庫套用 migration，也未修復其 migration history。正式部署前的真實 PostgreSQL 雙連線併發測試、雲端驗收及 iPad/Apple Pencil 實機測試仍待執行。

## 測試

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

資料庫測試使用 PGlite 執行 001＋增量 SQL，先插入舊資料再遷移，涵蓋權限隔離、不可直接修改、時段衝突、請假補課、學費快照及作廢重簽。瀏覽器測試使用固定台北日期與攔截的假 API，**不連正式 Supabase**，驗證操作與送出內容；不代表雲端端到端驗收或真實雙連線併發測試。

建置時應有 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY`。缺少設定時會產生「尚未連接 Supabase」頁面，因此完整建置檢查另以測試用 URL／publishable key 驗證整個應用會被打包；測試值不提交至正式環境。
