# ClassSign Billing v1.1

## 使用流程

1. 在學生資料夾的「教材紀錄」登記購入日期、名稱、數量、單價、備註。教材獨立保留為待代收；輸入有誤時，取消並重新登記，保留更正原因。
2. 進入「學費袋與收款」，選擇月份與學生，產生／重算草稿。程式展開整個月份，依預定課程的 `estimated_fee` 費率快照計算；不按已簽到次數計費。固定時段沿用現有課表保存的費率，調整學生費率不回寫既有排課或正式帳單。
3. 草稿帶入尚未列帳教材與可用抵扣。正式開立前再次計算並核對指紋；若其他老師變更教材、課表或已使用抵扣，必須重算並重新確認。
4. 正式開立後內容鎖定。登記現金／轉帳、日期、金額與備註，可分次收款。系統依收款合計顯示已開立、部分收款、已結清；零元學費袋開立後即結清。
5. 請假明確選擇「不補課」時，已列帳原課產生抵扣；若仍在待補課名單，可在帳務頁填原因後確認不再補課。已安排補課須先在課表取消。未簽到不代表可抵扣。
6. 抵扣最早用於課程／最後未補課月份與原收費月份之後的月份，且不早於確認時所在月份；已開立學費袋不改動，餘額供下一個符合條件的草稿使用。金額上限為當期應收，多餘金額繼續保留。
7. 恢復請假或補課時，追加反向調整。若先前抵扣尚未使用，正反項目相抵；已用掉的抵扣在下一次草稿補回，歷史學費袋不改寫。
8. 舊欠款留在原學費袋，另顯示其他期未收，防止同筆欠款再次計入本期。教材只有整張對應學費袋結清才顯示已收款；部分收款不推測是哪筆教材先繳。
9. 已收款需以原因沖銷；作廢前收款淨額必須為零。作廢保留明細及稽核，釋放教材、課程與抵扣配置，可重新開立。沖銷紀錄不表示已完成實際銀行退款，實際退還款項需由經手人核對。
10. 選取單一學費袋列印，亦可由瀏覽器另存 PDF。

## 保護與權限

- 只新增帳務資料表，不改寫 Auth UID、學生主鍵、簽到歷史或既有老師權限。
- 延用 `studio_owner()` 的共用工作室模型。所有啟用老師可管理同工作室帳務；停用帳號即使仍持有舊登入憑證，也不能讀寫。此版本不新增老師個別財務隔離規則。
- 所有新表開啟 RLS，前端只有 SELECT；所有寫入透過檢查權限的交易函式。每個工作室的課務與帳務共用 advisory transaction lock。
- 正式列帳課程與教材各有唯一索引；收款／教材使用 UUID 重試鍵；同月份同學生最多一張未作廢學費袋。
- 帳務事件記錄經手 UID、時間、原始與新資料；請假抵扣採追加差額，收款採追加沖銷。
- 公開 `billing_action` 為 SECURITY INVOKER；私有實作使用固定空 search_path，明確驗證目前帳號，撤銷 PUBLIC 與 anon 執行權。`studio_private` 的 schema usage 只搭配指定帳務函式的 execute，其他私有函式與設定表仍禁止直接存取。

## 已完成驗證

- `npm ci`、`npm run build`。
- `npm test`：既有資料庫、OAuth、共用工作室、課表與學生課表，加上帳務測試。
- `npx playwright test`：既有流程及教材 → 草稿 → 開立 → 轉帳部分收款 → 列印流程。UI 使用 API 模擬，金融交易與 RLS 另以真實 PostgreSQL 引擎 PGlite 測試。
- 使用私有正式資料邏輯匯出執行 `node scripts/rehearse-billing.mjs <export.json> <report.json>`；遷移前後逐筆比較既有資料，不把正式資料加入 Git。
- 正式專案目前是 PostgreSQL 17；開發驗證使用 PGlite PostgreSQL，不代表已在正式 Supabase 套用或通過正式環境驗收。

## 部署前置與順序

1. 暫停課務與收款寫入，重新匯出最新應用資料、workspace_settings、現有函式／政策／欄位／限制，確認平台完整資料庫備份或 PITR 可用。這次的應用邏輯備份包含簽名與 UID 對照，但不含 Auth 密碼、sessions、完整 identities 或平台服務設定，不能當作完整 Supabase 災難復原備份。
2. 確認 main 與 migration history 未被其他變更取代。本次基準為 `ffd588299a8db97d35f7596ddce2505f6e3dfcbf`。只有新增 `20261031135037_billing_v1_1.sql` 應套用，不能重跑既有建表或帳號初始化遷移。
3. 在可丟棄的 Supabase 測試專案套用同一 migration，檢查 REST/RPC schema cache、金額數值、兩個老師並行開立同教材、停用帳號、RLS、現金／轉帳、零元及部分收款、作廢後重開。生產 migration 一次交易，失敗須整筆回復。
4. 先套用資料庫 migration，再部署前端預覽。以實際啟用帳號驗證新 RPC；確認新表 SELECT 權限、沒有 anon 執行權及無直接寫入權，執行 Supabase security/performance advisors。
5. 核對原學生、歷史簽到、固定課表、Auth UID、老師權限雜湊與筆數，再將前端推向正式 Cloudflare Pages。依原專案建置 `npm ci && npm run build`，輸出 `dist`，沿用現有 publishable key 與 OAuth 設定。
6. 正式建議以一位學生、當月草稿開始驗收，再恢復課務與收款寫入。不要在正式專案留下測試收款或批次開立真帳單。

## 回復方式

- 遷移交易失敗時不部署前端，檢查後修正遷移。
- 若前端有問題，部署前一個前端版本；資料庫的帳務表與稽核全部保留。
- 若需回復舊課務入口，以備份中的 `public.studio_action(jsonb)` 定義取代目前 wrapper，或將私有 `pre_billing_action` 定義改為 `public.studio_action`。先在測試庫驗證。不要刪除新帳務表、Auth、學生或課表來「回滾」。
- 產生真實帳務後，錯誤帳單依作廢／沖銷流程處理；完整資料庫時間點回復須先評估之後新增的簽到與收款，避免資料遺失。

## 本次尚未執行的正式動作

尚未套用正式 migration、合併 main 或部署正式網站。正式環境驗收、平台完整備份確認及部署後 advisors 為上線前必要檢查。現有安全顧問的提醒包含刻意受控的 SECURITY DEFINER RPC、私有設定表沒有公開政策，以及尚未啟用洩漏密碼保護；此變更不更改登入政策。

## 官方實作參考

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase changelog](https://supabase.com/changelog)
