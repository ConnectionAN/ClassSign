import {useEffect,useState} from 'react';
import {supabase} from './client';
type Student={id:string;name:string;active:number};
type Invoice={id:string;student:string;student_name:string;month:string;state:string;total:number;paid:number;fingerprint:string};
type Item={id:string;invoice:string;kind:string;label:string;amount:number;material:string|null;adjustment:string|null;posted:boolean;snapshot:any};
type Material={id:string;student:string;name:string;purchased:string;quantity:number;unit_price:number;notes:string;cancelled:boolean};
type Payment={id:string;invoice:string;amount:number;method:string;day:string;notes:string;reverses:string|null;actor:string};
type Data={invoices:Invoice[];items:Item[];materials:Material[];payments:Payment[];adjustments:any[];audit:any[];pending:any[];exclusions:any[]};
const empty:Data={invoices:[],items:[],materials:[],payments:[],adjustments:[],audit:[],pending:[],exclusions:[]};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=(n:number)=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(n);
const status=(v:Invoice)=>v.state==='void'?'已作廢':v.state==='draft'?'草稿':v.paid>=v.total?'已結清':v.paid>0?'部分收款':'已開立';
async function request(b:Record<string,unknown>){if(!supabase)throw Error('尚未設定 Supabase');const {data,error}=await supabase.rpc('billing_action',{b});if(error)throw Error(error.message);return data;}
export default function Billing({students,student}:{students:Student[];student?:string}){
 const [data,setData]=useState<Data>(empty),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [month,setMonth]=useState(today().slice(0,7)),[sid,setSid]=useState(student||''),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[state,setState]=useState('');
 const [name,setName]=useState(''),[purchased,setPurchased]=useState(today()),[quantity,setQuantity]=useState('1'),[price,setPrice]=useState(''),[notes,setNotes]=useState(''),[materialId,setMaterialId]=useState(crypto.randomUUID());
 const [amount,setAmount]=useState(''),[method,setMethod]=useState('cash'),[day,setDay]=useState(today()),[paymentNotes,setPaymentNotes]=useState(''),[paymentId,setPaymentId]=useState(crypto.randomUUID()),[reason,setReason]=useState('');
 const [customName,setCustomName]=useState(''),[customAmount,setCustomAmount]=useState(''),[customNotes,setCustomNotes]=useState(''),[customId,setCustomId]=useState(crypto.randomUUID());
 const [customOpen,setCustomOpen]=useState(false);
 useEffect(()=>{setCustomName('');setCustomAmount('');setCustomNotes('');setCustomId(crypto.randomUUID())},[selected]);
 async function load(){const d=await request({action:'list'});setData({...empty,...d});setLoaded(true)}
 useEffect(()=>{load().catch(e=>setError(String(e)))},[]);
 async function send(b:Record<string,unknown>,done?:()=>void){if(busy)return;setBusy(true);setError('');try{const r=await request(b);if(r.invoice&&b.action==='draft')setSelected(r.invoice);done?.();await load()}catch(e){setError(String(e))}finally{setBusy(false)}}
 async function addCustom(){if(busy)return;if(!sid){setError('請先選擇學生與收費月份');return}setBusy(true);setError('');try{
  const draft=data.invoices.find(v=>v.student===sid&&v.month===month+'-01'&&v.state==='draft');
  const invoice=draft?.id||(await request({action:'draft',student:sid,month:month+'-01'})).invoice;
  await request({action:'custom_add',invoice,id:customId,name:customName,amount:Number(customAmount),notes:customNotes});
  setSelected(invoice);setCustomName('');setCustomAmount('');setCustomNotes('');setCustomId(crypto.randomUUID());await load();
 }catch(e){setError(String(e))}finally{setBusy(false)}}
 const inv=data.invoices.find(v=>v.id===selected);
 const materialState=(m:Material)=>{if(m.cancelled)return '已取消';const item=data.items.find(i=>i.material===m.id&&i.posted);if(!item)return '待代收';const v=data.invoices.find(x=>x.id===item.invoice);return v&&v.paid>=v.total?'已收款':'已列帳／待繳款'};
 const materials=data.materials.filter(m=>m.student===student);
 const credit=(id:string)=>data.adjustments.filter(a=>a.student===id).reduce((sum,a)=>sum+Number(a.amount)+data.items.filter(i=>i.adjustment===a.id&&i.posted).reduce((n,i)=>n+Number(i.amount),0),0);
 const outstanding=(id:string,exclude?:string)=>data.invoices.filter(v=>v.student===id&&v.state==='issued'&&v.id!==exclude).reduce((sum,v)=>sum+Number(v.total)-Number(v.paid),0);
 return <section className={student?'billing-materials':'billing records'} aria-label={student?'教材紀錄':'學費袋與收款管理'}>
 {error&&<p className="alert" role="alert">{error}</p>}
 {!loaded&&!error&&<p>讀取帳務資料…</p>}
 {student?<><h3>教材紀錄</h3><p>待代收 {money(materials.filter(m=>materialState(m)==='待代收').reduce((n,m)=>n+m.quantity*m.unit_price,0))} · 結轉抵扣 {money(credit(student))} · 未收款 {money(outstanding(student))}</p>
 <details><summary>＋ 登記購入教材</summary><form onSubmit={e=>{e.preventDefault();send({action:'material',student,id:materialId,name,purchased,quantity:Number(quantity),unit_price:Number(price),notes},()=>{setName('');setPrice('');setNotes('');setQuantity('1');setMaterialId(crypto.randomUUID())})}}>
 <label>教材名稱<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>購入日期<input required type="date" value={purchased} onChange={e=>setPurchased(e.target.value)}/></label>
 <div className="filters"><label>數量<input required type="number" min="1" max="10000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>單價（TWD）<input required type="number" min="0" max="1000000" step="1" value={price} onChange={e=>setPrice(e.target.value)}/></label></div>
 <label>備註<textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label><p>小計 {money(Number(quantity)*Number(price))}，下次產生學費袋時自動帶入。</p><button className="primary" disabled={busy}>儲存教材</button></form></details>
 {materials.map(m=><div className="lesson" key={m.id}><span><strong>{m.name} · {money(m.quantity*m.unit_price)}</strong><small>{m.purchased} · {m.quantity} × {money(m.unit_price)} · {materialState(m)} {m.notes}</small></span>{materialState(m)==='待代收'&&<button disabled={busy} onClick={()=>{const r=window.prompt('取消教材原因（更正請取消後重新登記）');if(r?.trim())send({action:'cancel_material',student,id:m.id,reason:r})}}>取消登記</button>}</div>)}
 </>:<><h2>學費袋與收款管理</h2><p className="muted">按預定課程預收；正式開立後保留明細。舊欠款保留在原學費袋，避免重複計入新一期。</p>
 <form className="filters no-print" onSubmit={e=>{e.preventDefault();send({action:'draft',student:sid,month:month+'-01'})}}><label>收費月份<input required type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label>學生<select aria-label="學生" required value={sid} onChange={e=>setSid(e.target.value)}><option value="">選擇學生</option>{students.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button disabled={busy||!loaded} className="primary">產生／重算草稿</button></form>
 <button type="button" className="primary no-print" aria-expanded={customOpen} disabled={busy||!loaded} onClick={()=>setCustomOpen(o=>!o)}>＋ 自訂費用</button>
 {customOpen&&<section className="custom-fee-form no-print" aria-label="自訂費用"><h3>自訂費用</h3><p className="muted">可補登前期尚未列帳的學費或其他費用；已列帳欠款請在原學費袋登記收款。</p><form onSubmit={e=>{e.preventDefault();addCustom()}}>
 <div className="filters"><label>自訂費用名稱<input required maxLength={120} placeholder="例如：10月未列帳學費、比賽報名費" value={customName} onChange={e=>setCustomName(e.target.value)}/></label><label>自訂費用金額（TWD）<input required type="number" min="1" max="100000000" step="1" value={customAmount} onChange={e=>setCustomAmount(e.target.value)}/></label></div><label>自訂費用備註<input maxLength={500} value={customNotes} onChange={e=>setCustomNotes(e.target.value)}/></label><button className="primary" disabled={busy}>加入自訂費用</button></form></section>}
 <div className="filters no-print"><label>搜尋學生<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>狀態<select value={state} onChange={e=>setState(e.target.value)}><option value="">全部</option>{['草稿','已開立','部分收款','已結清','已作廢'].map(s=><option key={s}>{s}</option>)}</select></label></div>
 <div className="invoice-list no-print">{data.invoices.filter(v=>v.month.startsWith(month)&&v.student_name.includes(search)&&(!state||status(v)===state)).map(v=><button key={v.id} className="lesson" onClick={()=>{setSelected(v.id);setSid(v.student);setMonth(v.month.slice(0,7));setAmount('');setReason('');setPaymentId(crypto.randomUUID())}}><span>{v.student_name} · {v.month.slice(0,7)} · {status(v)}</span><span>{money(v.total)} ／已收 {money(v.paid)}</span></button>)}</div>
 {inv&&<article className="invoice-print"><div className="row"><div><h2>{inv.student_name} · {inv.month.slice(0,7)} 學費袋</h2><small>單號 {inv.id} · {status(inv)}</small></div><button className="no-print" disabled={busy} onClick={()=>window.print()}>列印</button></div>
 <table><thead><tr><th>明細</th><th>金額 TWD</th></tr></thead><tbody>{data.items.filter(i=>i.invoice===inv.id).map(i=><tr key={i.id}><td>{i.label}{i.kind==='material'&&<small> {i.snapshot.quantity} × {money(i.snapshot.unit_price)} · {i.snapshot.purchased}</small>}{i.kind==='custom'&&i.snapshot.notes&&<small>{i.snapshot.notes}</small>}</td><td>{money(i.amount)}{['tuition','material','custom'].includes(i.kind)&&inv.state==='draft'&&<button className="no-print text" disabled={busy} onClick={()=>send({action:'draft_item_remove',invoice:inv.id,id:i.id})} aria-label={'刪除費用：'+i.label}>刪除費用</button>}</td></tr>)}</tbody></table>

 {inv.state==='draft'&&data.exclusions.some(e=>e.invoice===inv.id)&&<details className="no-print"><summary>已刪除費用（可還原）</summary>{data.exclusions.filter(e=>e.invoice===inv.id).map(e=><div className="lesson" key={e.id}><span>{e.snapshot.label} · {money(e.snapshot.amount)}</span><button disabled={busy} onClick={()=>send({action:'draft_item_restore',invoice:inv.id,id:e.id})}>還原費用</button></div>)}</details>}
 <p>本期應收 <strong>{money(inv.total)}</strong> · 已收 {money(inv.paid)} · 本期未收 {money(inv.state==='issued'?inv.total-inv.paid:0)}</p><p>其他期未收 {money(outstanding(inv.student,inv.id))} · 尚餘抵扣 {money(credit(inv.student))}</p>
 {inv.state==='draft'&&<div className="actions no-print"><button disabled={busy} onClick={()=>send({action:'draft',student:inv.student,month:inv.month})}>重算草稿</button><button className="primary" disabled={busy} onClick={()=>send({action:'issue',invoice:inv.id,fingerprint:inv.fingerprint})}>確認金額並正式開立</button></div>}
 <h3>收款紀錄</h3>{data.payments.filter(p=>p.invoice===inv.id).map(p=><div className="lesson" key={p.id}><span>{p.day} · {p.method==='cash'?'現金':'轉帳'} · {money(p.amount)}<small>{p.notes} · 經手帳號 {p.actor}</small></span>{p.amount>0&&!data.payments.some(r=>r.reverses===p.id)&&inv.state==='issued'&&<button className="no-print" disabled={busy} onClick={()=>{const r=window.prompt('沖銷收款原因');if(r?.trim())send({action:'reverse_payment',invoice:inv.id,payment:p.id,reason:r})}}>沖銷</button>}</div>)}
 {inv.state==='issued'&&inv.total>inv.paid&&<form className="no-print" onSubmit={e=>{e.preventDefault();send({action:'payment',invoice:inv.id,id:paymentId,amount:Number(amount),method,day,notes:paymentNotes},()=>{setAmount('');setPaymentNotes('');setPaymentId(crypto.randomUUID())})}}><h3>登記收款</h3><div className="filters"><label>金額<input required type="number" min="1" max={inv.total-inv.paid} step="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>方式<select aria-label="方式" value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">現金</option><option value="transfer">轉帳</option></select></label><label>日期<input required type="date" max={today()} value={day} onChange={e=>setDay(e.target.value)}/></label></div><label>備註<input maxLength={500} value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)}/></label><button disabled={busy} className="primary">確認收款</button></form>}
 {inv.state!=='void'&&<details className="no-print"><summary>作廢學費袋</summary><p>先沖銷已有收款。原始明細與紀錄保留，教材及抵扣恢復可列帳狀態。</p><input aria-label="作廢原因" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy||!reason.trim()||inv.paid!==0} onClick={()=>send({action:'void',invoice:inv.id,reason})}>確認作廢</button></details>}
 </article>}
 <details className="no-print"><summary>待補課：確認不再補課</summary><p>只有明確確認不補課，才建立已預收課程的抵扣。尚有已安排補課時，請先在課表取消。</p>{data.pending.map(c=><div className="lesson" key={c.id}><span>{students.find(s=>s.id===c.student)?.name} · {c.day}</span><button disabled={busy} onClick={()=>{const r=window.prompt('確認不再補課的原因');if(r?.trim())send({action:'confirm_no_makeup',student:c.student,session:c.id,reason:r})}}>確認不補課</button></div>)}</details>
 <details className="no-print"><summary>帳務稽核紀錄</summary>{data.audit.map(a=><p key={a.id}><small>{new Date(a.created).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})} · {a.action} · 帳號 {a.actor} · {a.entity} {a.after_data?.reason}</small></p>)}</details>
 </>}
 </section>
}
