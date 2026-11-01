import {MobileReportSection} from './Mobile';
import {useEffect,useRef,useState} from 'react';
import {supabase} from './client';
import {buildReports,csvText,periodRange,statusLabel,TEACHER,type Snapshot} from './reportModel';
const titles=['營運總覽','學費袋報表','實際收款報表','課務統計','教材代收報表'];
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
const cash=(v:number)=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(v);
export default function Reports({onInvoice}:{onInvoice:(student:string,month:string,id:string)=>void}){
 const [category,setCategory]=useState(0),[mode,setMode]=useState('month'),[anchor,setAnchor]=useState(today().slice(0,7));
 const [range,setRange]=useState(()=>periodRange('month',today())),[student,setStudent]=useState(''),[status,setStatus]=useState('');
 const [materialBasis,setMaterialBasis]=useState<'purchase'|'invoice'>('purchase');
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 const serial=useRef(0);
 const valid=!!range.from&&!!range.to&&range.from<=range.to&&Date.parse(range.to)-Date.parse(range.from)<=3660*86400000;
 useEffect(()=>{
  const seq=++serial.current;setData(null);setError('');setLoading(valid);
  if(valid){void (async()=>{try{
   if(!supabase)throw Error('尚未設定 Supabase');
   const {data,error}=await supabase.rpc('report_snapshot',{date_from:range.from,date_to:range.to});
   if(error)throw Error(error.message);
   if(!data||!['students','invoices','items','payments','adjustments','materials','lessons','sessions','pending'].every(k=>Array.isArray(data[k])))throw Error('報表資料格式不完整');
   if(seq===serial.current)setData(data as Snapshot);
  }catch(e){if(seq===serial.current)setError('報表讀取失敗：'+(e as Error).message)}finally{if(seq===serial.current)setLoading(false)}})()}
  return()=>{serial.current++};
 },[range.from,range.to,refresh,valid]);
 function changePeriod(nextMode:string,nextAnchor:string){setMode(nextMode);setAnchor(nextAnchor);if(nextMode!=='custom'&&nextAnchor)setRange(periodRange(nextMode,nextAnchor))}
 const report=data?buildReports(data,{...range,student,status:category===3?'':status,materialBasis}):null;
 const s=report?.summary,c=report?.course;
 let headers:string[]=[],rows:(string|number)[][]=[];
 if(report&&s&&c){
  if(category===0){headers=['統計項目','數值（TWD／堂）'];rows=[['本期開立應收',s.due],['本期學費袋已配置收款（截至查詢時）',s.allocated],['本期學費袋未收（截至查詢時）',s.outstanding],['本期實收淨額（學費袋月份）',s.cash],['前期學費袋未收（截至查詢時）',s.priorDebt],['目前待抵扣（不限期間）',s.credit],['目前待補收調整（不限期間）',s.debit],['完成雙簽堂數',c.completed],['已授課金額（簽到快照）',c.taught]]}
  if(category===1){headers=['學生','學費袋月份','狀態','學費袋金額','已配置收款','未收'];rows=report.bags.map(v=>[v.student_name,v.month.slice(0,7),statusLabel[v.status],v.total,v.paid,v.balance])}
  if(category===2){headers=['付款日期','學生','配置學費袋月份','方式','類型','金額','備註'];rows=report.receipts.map(p=>[p.day,p.student_name,p.month.slice(0,7),p.method==='cash'?'現金':'轉帳',p.reverses?'沖銷（非退款證明）':'收款',p.amount,p.notes])}
  if(category===3){headers=['日期','學生','授課老師','簽到金額','課程類型'];rows=report.lessons.map(l=>[l.day,report.name(l.student),TEACHER,l.fee,data!.sessions.some(c=>c.id===l.session&&c.original)?'補課':'一般／加課'])}
  if(category===4){headers=['學生','教材','購入日期','代收學費袋月份','代收金額','狀態'];rows=report.materials.map(m=>[m.student_name,m.name,m.purchased,m.month.slice(0,7)==='尚未列帳'?'尚未列帳':m.month.slice(0,7),m.amount,m.state])}
 }
 const scope=`${range.from} ～ ${range.to}｜學生：${data?.students.find(s=>s.id===student)?.name||'全部'}｜老師：${TEACHER}｜收費狀態：${category===3?'不適用':statusLabel[status]||'全部'}${category===4?'｜教材日期：'+(materialBasis==='purchase'?'購入日期':'代收學費袋月份'):''}`;
 function exportCSV(){
  const text=csvText([[titles[category]],[scope],['查詢時間',data?.generated_at||''],...((category===3&&c)?[['預定堂數',c.scheduled],['學生請假',c.leave],['本期請假尚待安排補課',c.pending],['完成補課',c.makeup],['額外課程',c.extra],['已授課金額',c.taught]]:[]),headers,...rows]);
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`ClassSign_${titles[category]}_${range.from}_${range.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="records reports" aria-label="統計報表">
  <div className="report-tabs no-print" role="tablist" aria-label="報表分類">{titles.map((title,i)=><button key={title} role="tab" aria-selected={category===i} className={category===i?'primary':''} onClick={()=>setCategory(i)}>{title}</button>)}</div>
  <MobileReportSection title="篩選、匯出與列印"><div className="filters no-print">
   <label>期間<select aria-label="期間" value={mode} onChange={e=>changePeriod(e.target.value,anchor)}><option value="month">月份</option><option value="quarter">季度</option><option value="year">年度</option><option value="custom">自訂期間</option></select></label>
   {mode!=='custom'&&<label>基準月份<input type="month" required value={anchor} onChange={e=>changePeriod(mode,e.target.value)}/></label>}
   <label>起始日期<input type="date" disabled={mode!=='custom'} value={range.from} onChange={e=>setRange(r=>({...r,from:e.target.value}))}/></label>
   <label>結束日期<input type="date" disabled={mode!=='custom'} value={range.to} onChange={e=>setRange(r=>({...r,to:e.target.value}))}/></label>
   <label>報表學生<select aria-label="報表學生" value={student} onChange={e=>setStudent(e.target.value)}><option value="">全部學生</option>{data?.students.map(s=><option value={s.id} key={s.id}>{s.name}{s.active?'':'（已封存）'}</option>)}</select></label>
   <label>授課老師<select aria-label="授課老師" value="susu" onChange={()=>{}}><option value="susu">{TEACHER}</option></select></label>
   {category!==3&&<label>收費狀態<select aria-label="收費狀態" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部狀態</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
   {category===4&&<label>教材日期依據<select aria-label="教材日期依據" value={materialBasis} onChange={e=>setMaterialBasis(e.target.value as 'purchase'|'invoice')}><option value="purchase">購入日期（含待代收）</option><option value="invoice">代收學費袋月份</option></select></label>}
   <button disabled={loading||!valid} onClick={()=>setRefresh(r=>r+1)}>更新報表</button>
   <button disabled={!report||loading||!valid} onClick={exportCSV}>匯出 CSV</button><button disabled={!report||loading||!valid} onClick={()=>window.print()}>列印報表</button>
  </div>
  </MobileReportSection>
  {!valid&&<p role="alert" className="alert">請指定有效起訖日期，起始不可晚於結束，最多十年。</p>}
  {error&&<p role="alert" className="alert">{error}。請確認報表 migration 已套用後再更新。</p>}
  {loading&&<p role="status">正在計算報表…</p>}
  {report&&s&&c&&<article className="report-print">
   <h2>{titles[category]}</h2><p>{scope}</p><p className="muted">查詢時間：{new Date(data!.generated_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台北時間）</p>
   <MobileReportSection title="查看統計口徑"><p className="report-definition">應收依學費袋所屬月份（自訂期間含相交月份）；草稿／作廢不計正式應收。實收依學費袋所屬月份歸屬，含截至查詢時的全部收款與負數沖銷，不依付款日期歸月；草稿／作廢不計實收。未收與收費狀態為查詢當下餘額，並非期末歷史餘額。授課依有效雙簽日期與保存費率。</p></MobileReportSection>
   {category===0&&<><div className="metrics"><div><span>本期開立應收</span><strong>{cash(s.due)}</strong></div><div><span>本期實收淨額（學費袋月份）</span><strong>{cash(s.cash)}</strong></div><div><span>本期學費袋未收</span><strong>{cash(s.outstanding)}</strong></div><div><span>目前待抵扣</span><strong>{cash(s.credit)}</strong><small>不限期間及收費狀態</small></div></div><p>待補收調整 {cash(s.debit)}；前期未收 {cash(s.priorDebt)}，不重複加到本期應收。</p></>}
   {category===1&&<p>正式應收 {cash(s.due)} · 已配置 {cash(s.allocated)} · 未收 {cash(s.outstanding)} · 已結清 {report.bags.filter(v=>v.status==='paid').length} 張 · 部分收款 {report.bags.filter(v=>v.status==='partial').length} 張 · 未收款 {report.bags.filter(v=>v.status==='unpaid').length} 張</p>}
   {category===2&&<p>學費袋月份實收淨額 {cash(s.cash)} · 現金 {cash(report.receipts.filter(p=>p.method==='cash').reduce((n,p)=>n+Number(p.amount),0))} · 轉帳 {cash(report.receipts.filter(p=>p.method==='transfer').reduce((n,p)=>n+Number(p.amount),0))}。沖銷是帳務更正，不代表已退款。</p>}
   {category===3&&<><div className="metrics"><div><span>預定堂數</span><strong>{c.scheduled}</strong></div><div><span>完成雙簽</span><strong>{c.completed}</strong></div><div><span>已授課金額</span><strong>{cash(c.taught)}</strong></div></div><p>學生請假 {c.leave} 堂 · 本期請假尚待安排補課 {c.pending} 堂 · 完成補課 {c.makeup} 堂 · 額外課程 {c.extra} 堂</p><p>授課老師：{TEACHER}，依工作室目前單一授課老師設定。課務不套用收費狀態。預定堂數含請假及已簽，排除取消，尚未產生的固定課表以唯讀方式展開。</p></>}
   {category===4&&<><p>教材狀態依整張學費袋目前餘額，部分付款不分攤至特定教材。這是代收管理，非利潤報表。</p><div className="metrics">{['待代收','已列帳待結清','整張學費袋結清'].map(state=><div key={state}><span>{state}</span><strong>{cash(report.materials.filter(m=>m.state===state).reduce((n,m)=>n+m.amount,0))}</strong></div>)}</div></>}
   <details className="mobile-report-details"><summary>查看報表詳情（{rows.length} 筆）</summary>{rows.map((row,i)=><section className="mobile-report-card" key={i}>{row.map((value,j)=><p key={j}><span>{headers[j]}</span><strong>{value}</strong></p>)}{category===1&&<button onClick={()=>onInvoice(report.bags[i].student,report.bags[i].month,report.bags[i].id)}>開啟學費袋</button>}</section>)}</details><div className="report-table"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}{category===1&&<th className="no-print">明細</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}{category===1&&<td className="no-print"><button onClick={()=>onInvoice(report.bags[i].student,report.bags[i].month,report.bags[i].id)}>開啟學費袋</button></td>}</tr>)}</tbody></table>{!rows.length&&<p className="empty">此篩選條件沒有紀錄。</p>}</div>
  </article>}
 </section>;
}
