# ClassSign 切版格式與裝置對照

此處是現有介面的切版契約，供維護者延續目前操作方式。不是重新設計的版型提案。

## 外框

```text
App
├─ 未登入：.login > .dialog > 既有登入表單
└─ 已登入：.account-bar + Studio .app
   ├─ .sidebar-toggle / .sidebar-rail / aside（平板與桌面）
   ├─ MobileNavigation（手機底部）
   └─ main
      ├─ header（重新整理）
      ├─ 離線／錯誤訊息
      ├─ .heading（頁名、說明、原操作）
      └─ 目前頁面（見下表）
```

| 頁面 | 程式入口 | 既有結構與責任 |
| --- | --- | --- |
| 登入 | `main.tsx` | 中央卡片、Google／帳密、錯誤提示；品牌圖採非佔位裝飾，不移動表單 |
| 導覽 | `Studio.tsx`、`Mobile.tsx` | 平板桌面側欄可收合；手機底部四入口，報表與帳號在「更多」 |
| 日週課表 | `Schedule.tsx` | `.records.schedule` → 篩選與工具 → `.calendar.day/.week` → 課程卡 → 補課／固定時段 |
| 學生資料 | `Studio.tsx` | `.metrics` → `.workspace` → `.folders` 學生列表 + `.records` 詳情 |
| 固定時段／備註 | `StudentSchedule.tsx`、`StudentNotes.tsx` | 放在原學生詳情，不新增導覽入口 |
| 雙簽 | `Studio.tsx` | `.overlay > .dialog.wide > .sign-grid > .signature`；老師與學生／家長原驗證條件不變 |
| 學費袋／收款 | `Billing.tsx` | 原篩選器、袋清單、選定學費袋 `.invoice-print`，操作與列印區分離 |
| 教材 | `Billing.tsx` 的 Materials | `.billing-materials` 位於學生資料，維持原購入記錄流程 |
| 報表 | `Reports.tsx` | `.report-tabs` → 篩選器 → `.report-print`，桌面表格／手機詳情卡不變 |

## 斷點與不可改動項

| 條件 | 既有行為 |
| --- | --- |
| `<768px` | `useMobile()` 啟用手機流程，底部四項導覽；學生列表／詳情分開；雙簽分兩步；報表詳情卡 |
| `768×1024`、`1024×768` | 平板沿用桌面操作，日週切換、可收合側欄，雙簽並列 |
| `1280px`、`1440px` | 桌面側欄與資料雙欄、表格；學生列表／資料各自滾動 |
| `max-width:1100px` | 舊側欄 200px、main 對應位移；更寬為 246px |
| `760/761px` | 歷史基礎樣式的界線；手機最終布局由 mobile.css 的 `<768px` 覆寫，不可因視覺改版整併 |
| print | 只輸出選定 `.invoice-print`／`.report-print`；A4、16mm 邊界，保留原列印隱藏規則 |

不可改變主要按鈕與導覽位置、欄數、課表排列、學生切換、分頁順序、資料密度、canvas 尺寸、滾動容器、彈窗定位及安全區留白。請保留元件的原 aria 屬性與標籤。

## 後續頁面的共用切版格式

以下只說明如何沿用原 class，不代表本次新增頁面或功能。事件、表單驗證與資料保持由原元件負責。

```tsx
// 頁面內容置於 Studio 已有 main / heading 下，不重建導覽外框。
<section className="records" aria-label="既有頁面名稱">
  <div className="row">
    <h2>既有標題</h2>
    <button className="primary" disabled={busy} onClick={existingAction}>
      {busy ? '正在儲存，請稍候…' : '既有操作'}
    </button>
  </div>
  <p className="muted">既有說明</p>
  {error && <p className="alert" role="alert">{error}</p>}
  {/* 原本的篩選器、內容和操作，不重排 */}
</section>
```

```css
/* 優先共用色彩，不在頁面重新定義品牌 HEX。 */
.existing-component { background:var(--surface); color:var(--ink); }
.existing-component.is-selected { background:var(--brand-soft); color:var(--brand-ink); }
/* 尺寸、display、position、grid、overflow 的變更必須另行檢查各裝置布局。 */
```

新增或維護元件時請提供：對應檔案、既有容器、適用斷點、一般／選取／停用／錯誤狀態、鍵盤焦點、列印行為及前後截圖。請勿以通用 class（例如 `.row`）新增不必要的全域布局副作用。
