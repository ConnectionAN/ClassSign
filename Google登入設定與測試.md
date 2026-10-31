# Google 登入＋原本帳密（方案 B）

## 實作與資料保留

新增登入頁 Google 按鈕、老師登入後「登入方式」中的連結功能。連結前再次輸入原本密碼，使用目前已授權的 UUID 呼叫 `linkIdentity`，回來再比對 UUID。使用 PKCE、一次性回呼交換、15 分鐘連結意圖期限；回呼先移除網址中的 code/error，不顯示或記錄 Google 原始錯誤與 token。原本 `signInWithPassword` 保留，沒有註冊、合併、刪除或搬移帳號的程式。

沒有 SQL migration。請勿重跑 `001_studio.sql`、重建 auth user、更改 owner 或為 Google 自動新增 teacher_access。`students.owner`、`lessons.owner`、`fee_changes.owner` 與 `teacher_access.user_id` 仍使用原來 `auth.users.id`。進工作室前查老師資格；所有讀寫仍由既有 RLS/RPC 在資料庫強制限制。前端檢查不是安全邊界。

2026-10-31 唯讀核對連接的「class sign」專案：四張表均開啟 RLS；政策以 auth.uid() 和 teacher_access 限制所有者；studio_action 驗證老師與學生 owner，且 anon 不可執行。當時 1 user、1 teacher、1 student、1 lesson、1 fee_change；既有使用者 Email 已確認且有密碼。本次未變更雲端資料或驗證設定。

## 同 email 不等於安全合併

Supabase Auth 自身會嘗試自動連結同 email 的 OAuth 身分；這不是本程式實作的合併，也不能靠前端按鈕完全禁止。不能承諾「只有手動連結才可能發生連結」。官方目前文件見 [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)。

管理員必須先確認既有老師實際控制原本信箱及預計連結的 Google 帳號、Email 確認狀態、原本密碼可登入。預設 `VITE_GOOGLE_AUTH_ENABLED=false`，確認完成才啟用 Google Provider 與前端旗標。此旗標僅隱藏介面，不會關閉 Supabase Provider。

第一次請以原本帳密登入，再從「登入方式」輸入原本密碼，選擇本人 Google 帳號連結（可以不同 email）。完成後在 Supabase Users 確認 Google identity 掛在原 UUID，並核對資料，再測試登出後 Google 登入。不要直接以相同 email 當作所有權證明。若組織要求完全禁止自動同 email 連結，必須先確認 Supabase Auth 伺服器是否可提供符合要求的設定或改採經審核的驗證架構；未確認前維持 Provider 關閉，不可用前端檢查冒充防護。

若 Google identity 已屬於另一個 auth user，應拒絕連結。不要刪除 user、移動學生或複製老師權限來修復；先由管理員核對兩邊身分及資料。OAuth 新建帳號即使成功登入也沒有老師權限。關閉公開註冊可降低新帳號產生，但不應視為老師授權控制或自動連結的開關。

## Supabase 與 Google Cloud

1. 在原 Supabase 專案設定，保留 Email Provider 與原有帳密、停用公開註冊，確認老師仍是原 UUID。
2. Google Cloud → Google Auth Platform：設定 Branding、Audience、Data Access。建立 Web application OAuth Client；測試模式將本人測試 Google 帳號列為 test user，正式使用前確認 Audience/發布狀態適用預定老師。
3. Authorized JavaScript origins：正式網站 origin（例如 `https://classsign.example.com`，無路徑）；若使用 pages.dev 或本機測試，個別加入實際 origin，例如 `http://127.0.0.1:5173`。本實作採伺服器轉址 OAuth，不使用 One Tap。
4. Authorized redirect URIs 必須填 Supabase Google Provider 畫面顯示的 callback，例如 `https://<project-ref>.supabase.co/auth/v1/callback`。不是 Cloudflare 網站 `/`。如用 Supabase 自訂驗證網域，以後台顯示值為準，完全比對協定、主機與路徑。
5. 將 Client ID / Client Secret 只填入 Supabase → Authentication → Sign In / Providers → Google，啟用 Google。Client Secret 不可放 VITE_、GitHub、聊天或前端；不要要求離線存取、Google API scopes 或儲存 Google refresh token。維持基本 openid/email/profile，不關閉 email 驗證。
6. 開啟 Supabase 的 Allow manual linking（介面名稱以目前後台為準）。這允許已登入使用者透過 linkIdentity 連結；不會取代老師授權。
7. Authentication → URL Configuration：Site URL 填正式入口；Redirect URLs 精確加入 `https://正式網域/`、如使用則加入 `https://專案.pages.dev/`，本機測試加入 `http://127.0.0.1:5173/`。程式固定回目前 origin 的根目錄，不接受 query 指定外部 return URL。

參考：[Supabase Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。

## Cloudflare Pages

- 保留 React/Vite，Node.js 24，build `npm run build`，output `dist`。此版本部署在網域根目錄，回呼為 `/`，無需新增 callback route。
- 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`，完成前述檢查後才將 `VITE_GOOGLE_AUTH_ENABLED` 設為 `true`。所有 VITE_ 值都會進入公開前端，不能放 secret/service_role。改值必須重新建置。
- Custom domains 在 Pages 專案內設定且確認 HTTPS 正常；選固定正式網域。請勿讓 `/` 回呼在完成交換前被重新導向另一個 origin：PKCE verifier 與連結意圖保存在發起瀏覽器/網域。
- Production / Preview 環境變數分開管理。Preview 優先使用獨立測試 Supabase 專案及固定預覽網址；若確實需要預覽 OAuth，只加入受控固定預覽 origin。不要把所有 `*.pages.dev` 放入正式專案允許清單。
- 首次驗收用同一瀏覽器、同一分頁完成 Google 往返。跨瀏覽器、清除網站儲存空間或逾時需重新開始；不要分享含 code 的 callback 網址。

參考：[Cloudflare Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)。

## 驗收與回復

先由管理員完成資料庫備份與可還原性確認，私下記錄原 UUID、teacher_access 與各表資料/擁有者、簽名、課次及金額，不提交資料或備份到 GitHub。

| 情境 | 預期 |
| --- | --- |
| 原本帳密登入、登出、重新整理 | 可進原工作室，資料完全相同 |
| 原老師輸錯原密碼再連結 | 不發起 linkIdentity |
| 原老師連結本人 Google（含不同 email） | 原 UUID 不變，Google identity 增加；teacher_access/owner/學生/簽名/學費皆不變 |
| 登出再 Google 登入 | 同 UUID、相同課次/金額；原帳密仍可登入 |
| 另一個未授權 Google 帳號 | 無工作室，RLS 不可讀各表，RPC 拒絕，無法自行取得 teacher_access |
| Google identity 已綁別人 | 失敗且不合併、不搬資料、不新增授權 |
| 另一位已授權老師 | 只能存取自己的學生與紀錄 |
| 取消 Google / Provider 未設定 / redirect 不符 | 通用錯誤，可退回帳密；不顯示 token 或原始 provider 描述 |
| 逾時 / callback 重送 / 缺少 verifier 或連結意圖 / UUID 不符 | 不接受連結成功，UUID 不符時本機登出 |
| iPad Safari、手機及電腦 | 兩種登入、刷新、登出與簽名流程皆正常；手機也可登出 |

本機執行 `npm ci`、`npm test`、`npm run build`。OAuth 測試使用模擬 SDK，驗證呼叫方式、UUID、拒絕未授權、錯誤清理及一次性回呼；PGlite 執行真實 SQL/RPC，驗證同 UUID 換 provider 不改資料、不同 UUID 即使 email/metadata 相同也無權限、無法自行授權及跨老師隔離。這些不替代 Google 真正授權、Supabase Auth linking 和實機驗收。

回復：先關閉 Google Provider（真正停止 OAuth）、將旗標設回 false 並重新建置或回退 Pages 部署。保留原帳密登入。關閉 Provider 不會撤銷已發出的 session；如需撤銷特定登入，由管理員另行處理。不要刪除使用者或 business data；已連結身分的解除必須在確認原帳密仍可用後另行處理。

既有雲端安全顧問提醒：studio_action 是刻意讓 authenticated 呼叫的 SECURITY DEFINER，已核對函式內 uid/teacher/owner 檢查、空 search_path 與撤銷 anon/PUBLIC execute；本次保持原設計。另有 leaked password protection 未啟用，管理員可依 [官方設定](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)評估啟用。本次未更改雲端設定。
