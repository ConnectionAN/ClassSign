# Visual Refresh v1.4.2 Phase 2

Base main: dcbeb71d0d5c4b3c41bbc5216f1c4f2090c5bfd7 (verified 2026-11-01).

## Inventory and boundaries
All five reports live in src/Reports.tsx: overview, tuition bags, receipts, courses, materials. src/reportModel.ts owns arithmetic, cohort selection, CSV escaping and date ranges. tests/reports.test.mjs exercises these against isolated PGlite databases; tests/ui/reports.spec.ts covers real React rendering with intercepted fixture responses, period/status/material filters, CSV formula escaping, print, invoice navigation, invalid ranges and request errors.

No changes to reportModel, Supabase, migrations, stored data, financial/course logic, CSV assembly or callbacks. Query, arithmetic, CSV assembly and callbacks remain unchanged. Per review, a presentation-only visibleBags filter excludes void invoices from screen, CSV rows, print and invoice navigation; the void status option is omitted. The shared report model and stored void history remain intact. Preview fetch is isolated to its dedicated entry and returns synthetic data only. No production requests were used.

## Design
Extend UI.tsx and visual-refresh.css; reuse existing MobileReportSection and StatusBadge. Shared cards receive formatted values only. Consistent filter panel, summary cards, right-aligned numeric cells, status labels, expanded mobile details, explicit empty/loading states, print table, keyboard tabs.
Brand #CD76AC preserved. Use #F9EDF4 / #67364F for selected controls and status text rather than white text on pink. Report supporting text uses #68616D for stronger contrast. Cards use #FAF8FB, white and existing #EBE6EC borders. Main text remains #302B33. Numeric values use tabular numerals.

## Immutable brand hashes (SHA-256)
- jing-le-original-avatar.jpg: 75B71F8C0899D79E94AF96ABD9E99E16C8D83D8274E6D8F4C2EEC4977FD4A799
- jing-le-original-card.jpg: 5DA64D6E850849C58562DE840F95C8CC00677958848E8D3ED31C7282EA33BFF6

## Reproduction and evidence
- npm ci; npm run build; npm test
- npx playwright test tests/ui/reports.spec.ts tests/ui/visual-reports.spec.ts --workers=2
- REPORT_PHASE=before generates baseline paths; use unmodified base source for before captures.
- Eight viewports: 320, 375, 390, 430, 768, 1024, 1280, 1440 pixels. Each has five matching real React screenshots, with clock 2026-10-31 and the same intercepted fixture (due 3200, cash 2000, outstanding 1200, one course at 800, pending material 350).
- Generated screenshots and A4 PDFs are under artifacts/reports/{before,after}, ignored by git and delivered separately.
- Contrast checks cover visible metric values, selected category and status badges (>=4.5). Width checks assert no document overflow. Print checks assert the table remains visible at all widths. This is Chromium automated coverage; no physical-device or Safari claim.
- Local interactive preview: set VITE_GOOGLE_AUTH_ENABLED=true, VITE_SUPABASE_URL=https://classsign-test.invalid, VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test; run npm run dev -- --port 4186, then open /previews/reports/. Select October 2026 to reproduce screenshots. This fixture is deliberately small; large real-world datasets are not represented by these screenshots.

Draft review only. No merge, production deployment, or Phase 3.

## Review correction: exclude void bags
Void bags must not appear in reports. Reports.tsx now derives visibleBags once and uses that list for table/mobile rows, CSV and matching invoice callbacks. Summary/receipts already excluded void bags and retain their calculations. Purchase-basis material entries remain pending collection when a void bag releases them; these are material records, not void bag rows. Added desktop/mobile regression fixtures containing a void bag, line item and receipt.
