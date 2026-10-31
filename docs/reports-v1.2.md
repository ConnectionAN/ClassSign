# ClassSign Reports v1.2

## Scope and accounting definitions

The existing statistics navigation is now 統計報表 with five reports, month/quarter/year/custom dates, student (including archived students), applicable current billing status, CSV and print. Billing print and all mutation RPCs remain unchanged. A bag row opens that exact invoice, including voided history.

| Metric | Definition |
| --- | --- |
| 本期開立應收 | Sum invoice items for issued bags whose billing month intersects the selected range. Draft/void bags excluded. Custom dates include the entire intersecting billing months. This is the billing-month cohort, not the issuance timestamp. |
| 實際收款 | Signed sum of payment entries whose payment `day` is inside the inclusive range. Includes negative reversal entries on the correction date, even if the bag was later voided. Cash and transfer shown separately. Reversal is not proof of a bank refund. |
| 已配置／未收 | All current payment entries assigned to each selected issued invoice, regardless of payment month. Remaining = max(0, invoice total - assigned payments). These are current balances, not historical closing balances. |
| 前期未收 | Current outstanding on earlier billing months, shown separately and never added to current-period issuance. |
| 待抵扣／待補收調整 | Sum adjustment entitlement plus posted item allocations, net by student before separating positive credit and negative compensating debit. Current balance across all dates and billing statuses; drafts do not consume credit; void releases posted allocations through existing billing logic. |
| 課務 | Active double-signed lessons by lesson day and saved fee. Voided lessons excluded. Recurring schedule is expanded without writes and deduplicated by slot/original day, preserving moved, cancelled and makeup occurrences. Scheduled count includes leave/signed, excludes cancellation. Pending makeup counts selected-period leave still awaiting arrangement; completed makeup requires a valid signed lesson. Extra classes have neither recurring slot nor makeup origin. |
| 教材 | Exclude cancelled purchases. Unposted or released material is 待代收. Posted issued bag with outstanding balance is 已列帳待結清. Zero balance means 整張學費袋結清; partial receipts are never allocated arbitrarily to a book. Purchase date or billed-month date basis is selectable. Billed-month mode excludes unbilled purchases by definition. |

All teaching is attributed to **蘇蘇老師**, per the studio owner's explicit single-teacher instruction. This is a report setting (`TEACHER`), not a reinterpretation of account owner, payment collector or signature-image data. No account membership or historical records are rewritten. If multiple instructors are introduced, add an explicit assignment model before expanding this filter. Billing status does not filter course statistics or current credit balances; the UI states their scope.

## Database and security

Baseline main: `0bc1970bd9036c4bc8a2dc9b729655bf783eef82`. Read-only production inspection matched the nine repository migrations through `20261031143934_draft_item_controls_student_rename`; all public application tables have RLS. Existing workspace membership and suspension gate remains `studio_owner()`.

The only schema addition is `public.report_snapshot(date,date)`, a `STABLE SECURITY INVOKER` RPC with empty search path and authenticated-only EXECUTE. Every source table retains its existing RLS. It checks the current active membership gate and returns one statement snapshot without signature images. It does not call `studio_action(calendar)`, `billing_action`, or `billing_sync`, because those can write. Date range is limited to 3,661 inclusive days. Current ledger rows are included to support cross-period allocation and credit; for substantially larger ledgers, move aggregation/pagination into the RPC while retaining these definitions.

No production DDL, ledger writes, account changes or migration applications were performed during implementation. Tests use a disposable PGlite PostgreSQL engine and mocked browser API, not production data.

## Rollout

1. Review and merge the PR after checks. Confirm production migration history still matches the baseline; take the normal database backup.
2. Apply **only** `supabase/migrations/20261031153728_reports_v1_2.sql` using the project's usual Supabase migration process. Inspect pending migrations before `db push`; do not replay the initial setup or reset the database. This file creates one read-only RPC and grants EXECUTE, with no data backfill.
3. Deploy the matching frontend using the existing Cloudflare Pages project and environment configuration. A repository merge or successful local Vite build alone is not evidence of production deployment.
4. With an active teacher account, compare an issued bag's item sum and allocated payments against Reports; check a cross-month receipt by payment date, partial book collection, CSV and print. Verify suspended/anonymous access is denied. Use existing records for read-only checks; do not create real test payments.
5. Record the actual Pages deployment URL/commit and Supabase migration entry before declaring rollout complete.

Rollback: restore the previous frontend. The additive read-only RPC can remain safely installed; optionally revoke its EXECUTE and drop `public.report_snapshot(date,date)` after no frontend uses it. No original data or permissions need to be restored.

## Validation

- `npm test`: migration/RPC, billing, schedule, accounts/OAuth, report accounting and RLS regression tests.
- `npm run test:ui`: existing UI regression plus report tabs, period/status filters, teacher attribution, CSV formula escaping, print, invoice navigation, invalid date ranges and missing migration handling.
- `npm run build`: TypeScript and production Vite bundle.
- Report tests run the real migration chain and call real billing RPCs, verify cross-month cash, correction-day reversal, void history, virtual schedule deduplication, invoker security, read-only transaction execution and suspended/anonymous rejection.


## Production rollout record

The Reports v1.2 migration was applied through Supabase on 2026-10-31 and recorded by its migration tool as `20261031153728_reports_v1_2`. The repository filename is aligned to that actual recorded version; SQL contents are unchanged. Keep the production migration history untouched. Do not apply the former `20261031151738` filename as another migration.

Production read-only verification passed under the authenticated role: report invoice/payment counts and payment net match their source tables. Before/after fingerprints for students, lessons, schedules and all billing/material tables were identical. The report is STABLE SECURITY INVOKER, authenticated EXECUTE only; anonymous EXECUTE is denied. Existing security advisor notices were unchanged. PR #10 merged as `652f81929eafbc17875948d40fb3566624ba1002`; see Cloudflare checks for the frontend rollout status.
