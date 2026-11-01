# ClassSign v1.4.1 切版格式

本版可改外觀尺寸與呈現排版，保留既有入口與功能流程。歷史 v1.4 的逐像素位置契約已不適用，不可用舊幾何基準否定本次已授權的排版調整。

## 共用外框

- 未登入：.login > .dialog > .login-identity（原始頭貼 + 系統名）> 原登入表單 > 原說明。
- 已登入：.account-bar + .app.page-{tab}，保留可收合 aside、main/header/heading 與手機 MobileNavigation。
- 桌面側欄 232px；768–1100px 為 184px；收合模式仍保留 60px rail。手機 <768px 沿用四入口底部導覽。

## 課表格式

1. SectionHeading：左側課表名稱與說明，右側原「單堂簽到／固定每週課表」。
2. .schedule-toolbar：.date-navigation（上期、日期、今天、下期）+ .calendar-view-tools（SegmentedControl 日／週、重新整理）。
3. .calendar：CalendarDayHeading + LessonCard；時間 → 學生姓名 → 狀態。狀態沿用原 labels，不顯示學費。
4. .schedule-followups：兩張 .ui-subsection，保留原已排補課與待安排補課入口。
5. 原管理固定課表 details 與原課務 modal handlers 不變。

| 尺寸 | 呈現 |
| --- | --- |
| 手機 375／390 | 單日卡片與日期工具分組；週模式原直式七日；每張課程卡時間／姓名左側、狀態右側 |
| iPad 768／1024 展開側欄 | 週欄最小 100px，空間不足在課表容器內橫向捲動，避免把時間壓成極小字 |
| iPad 收合側欄 | 沿用七欄容納與各日獨立捲動；以視窗高度限制課表 |
| 桌面 1440 | 七欄週視圖；日視圖採時間、姓名、狀態三區卡片 |

## 學生格式

- .student-metrics：三張 MetricCard，值完全沿用原學生、雙簽課次與原授課應收計算。
- .student-workspace：.folders（SectionHeading、搜尋、封存勾選、StudentListItem）+ .student-detail。
- .student-detail：返回（手機）→ .student-profile（StudentIdentity / StatusBadge / 原簽到入口）→ 原姓名／學費／封存操作 → 手機原分頁 → 原時段、備註、教材、紀錄。
- 桌面保留列表與詳情獨立捲動。手機保留列表／詳情切換，在詳情隱藏重複摘要卡；返回列表仍可查看摘要。
- 手機資料分頁順序仍為課表、備註、教材購入記錄、課程紀錄；元件不重新 mount，不清除原未儲存狀態。

## 組合範例

```tsx
<SectionHeading title="課表" eyebrow="LESSON SCHEDULE"
 actions={<Button variant="primary" onClick={existingAction}>既有操作</Button>}/>
<LessonCard time={displayTime} name={studentName} status={status}
 label={existingStatusLabel} onClick={existingOpenDetail}/>
<MetricCard label="本月已完成" value={existingCount} unit="堂課" icon="✓"/>
```

只把既有資料與 callback 傳入展示元件，不搬入請求、帳務計算或日期排課規則。所有狀態以文字加顏色表達，保留鍵盤焦點、aria、原 disabled 條件。print 規則繼續由 style.css 負責，不把螢幕卡片布局套到學費袋與報表。
