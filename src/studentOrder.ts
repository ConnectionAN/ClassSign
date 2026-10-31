export type FixedSlot={student:string;weekday:number;minute:number;starts:string;ends:string|null};
export function studentOrder<T extends {id:string;name:string}>(students:T[],slots:FixedSlot[],day:string){
 const rank=(id:string)=>{
  const available=slots.filter(s=>s.student===id&&(!s.ends||s.ends>=day)&&(!s.ends||s.ends>=s.starts));
  const current=available.filter(s=>s.starts<=day);
  const nextStart=available.map(s=>s.starts).sort()[0];
  const chosen=current.length?current:available.filter(s=>s.starts===nextStart);
  return Math.min(Infinity,...chosen.map(s=>(s.weekday-1)*1440+s.minute));
 };
 return [...students].sort((a,b)=>{
  const ar=rank(a.id),br=rank(b.id);
  return (ar===br?0:ar<br?-1:1)||a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id);
 });
}
