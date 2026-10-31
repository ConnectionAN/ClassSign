export type Student={id:string;name:string;active:number};
export type Invoice={id:string;student:string;student_name:string;month:string;state:string};
export type Item={invoice:string;amount:number;posted:boolean;kind:string;material:string|null;adjustment:string|null};
export type Payment={id:string;invoice:string;amount:number;day:string;method:string;reverses:string|null;notes:string};
export type Adjustment={id:string;student:string;amount:number;eligible:string};
export type Material={id:string;student:string;name:string;purchased:string;quantity:number;unit_price:number;cancelled:boolean};
export type Lesson={id:string;student:string;day:string;fee:number;session:string|null;voided:string|null};
export type Session={id:string;student:string;day:string;status:string;original:string|null;slot:string|null;needs_makeup:boolean};
export type Snapshot={generated_at:string;students:Student[];invoices:Invoice[];items:Item[];payments:Payment[];adjustments:Adjustment[];materials:Material[];lessons:Lesson[];sessions:Session[];pending:string[]};
export type Filters={from:string;to:string;student:string;status:string;materialBasis:'purchase'|'invoice'};
export const TEACHER='蘇蘇老師';
export const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
export function periodRange(mode:string,anchor:string){
 const [y,m]=anchor.split('-').map(Number);
 const start=mode==='year'?1:mode==='quarter'?Math.floor((m-1)/3)*3+1:m;
 const end=start+(mode==='year'?12:mode==='quarter'?3:1);
 return {from:`${y}-${String(start).padStart(2,'0')}-01`,to:new Date(Date.UTC(y,end-1,0)).toISOString().slice(0,10)};
}
export const statusLabel:Record<string,string>={draft:'草稿',void:'作廢',paid:'已結清',partial:'部分收款',unpaid:'未收款'};
export function buildReports(d:Snapshot,f:Filters){
 const within=(day:string)=>day>=f.from&&day<=f.to;
 const studentOK=(id:string)=>!f.student||f.student===id;
 const name=(id:string)=>d.students.find(s=>s.id===id)?.name||'歷史學生';
 const invoices=d.invoices.map(v=>{
  const total=sum(d.items.filter(i=>i.invoice===v.id).map(i=>Number(i.amount)));
  const paid=sum(d.payments.filter(p=>p.invoice===v.id).map(p=>Number(p.amount)));
  const status=v.state!=='issued'?v.state:paid>=total?'paid':paid>0?'partial':'unpaid';
  return {...v,total,paid,balance:Math.max(0,total-paid),status};
 });
 const invoiceOK=(v:typeof invoices[number])=>studentOK(v.student)&&(!f.status||v.status===f.status);
 // A billing month is a cohort: a custom range includes each intersected month once.
 const inMonth=(month:string)=>month.slice(0,7)>=f.from.slice(0,7)&&month.slice(0,7)<=f.to.slice(0,7);
 const bags=invoices.filter(v=>invoiceOK(v)&&inMonth(v.month));
 const official=bags.filter(v=>v.state==='issued');
 const receipts=d.payments.flatMap(p=>{
  const v=invoices.find(v=>v.id===p.invoice);
  // Include reversal entries even if the bag was subsequently voided.
  return v&&invoiceOK(v)&&within(p.day)?[{...p,student_name:v.student_name,month:v.month,status:v.status}]:[];
 });
 const adjustments=d.adjustments.filter(a=>studentOK(a.student)).map(a=>({...a,
  remaining:Number(a.amount)+sum(d.items.filter(i=>i.posted&&i.adjustment===a.id).map(i=>Number(i.amount)))
 }));
 // Net by student BEFORE clamping: restored leave adds compensating negative entitlement.
 const creditStudents=d.students.filter(s=>studentOK(s.id)).map(s=>{
  const net=sum(adjustments.filter(a=>a.student===s.id).map(a=>a.remaining));
  return {name:s.name,credit:Math.max(0,net),debit:Math.max(0,-net)};
 });
 const materials=d.materials.filter(m=>!m.cancelled&&studentOK(m.student)).flatMap(m=>{
  const item=d.items.find(i=>i.material===m.id&&i.posted);
  const bag=item?invoices.find(v=>v.id===item.invoice&&v.state==='issued'):undefined;
  const state=bag?(bag.balance===0?'整張學費袋結清':'已列帳待結清'):'待代收';
  if(f.materialBasis==='purchase'?!within(m.purchased):!bag||!inMonth(bag.month))return [];
  if(f.status&&(!bag||bag.status!==f.status))return [];
  return [{...m,student_name:name(m.student),amount:item?Number(item.amount):m.quantity*m.unit_price,state,month:bag?.month||'尚未列帳'}];
 });
 const lessons=d.lessons.filter(l=>!l.voided&&within(l.day)&&studentOK(l.student));
 const sessions=d.sessions.filter(c=>within(c.day)&&studentOK(c.student)&&c.status!=='cancelled');
 const course={scheduled:sessions.length,completed:lessons.length,taught:sum(lessons.map(l=>Number(l.fee))),
  leave:sessions.filter(c=>c.status==='leave').length,pending:sessions.filter(c=>d.pending.includes(c.id)).length,
  makeup:lessons.filter(l=>d.sessions.some(c=>c.id===l.session&&c.original)).length,
  extra:sessions.filter(c=>!c.slot&&!c.original).length};
 return {bags,receipts,materials,lessons,course,creditStudents,
  summary:{due:sum(official.map(v=>v.total)),allocated:sum(official.map(v=>v.paid)),
   outstanding:sum(official.map(v=>v.balance)),cash:sum(receipts.map(p=>Number(p.amount))),
   priorDebt:sum(invoices.filter(v=>invoiceOK(v)&&v.state==='issued'&&v.month.slice(0,7)<f.from.slice(0,7)).map(v=>v.balance)),
   credit:sum(creditStudents.map(s=>s.credit)),debit:sum(creditStudents.map(s=>s.debit))},
  name};
}
export function csvText(rows:(string|number)[][]){
 return '\uFEFF'+rows.map(row=>row.map(value=>{
  const s=String(value);return '"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';
 }).join(',')).join('\r\n');
}
