import {useEffect,useState} from 'react';
import {studioRequest} from './client';
export default function StudentNotes({student,notes,onSaved}:{student:string;notes:string;onSaved:()=>void}){
 const [draft,setDraft]=useState(notes),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{setDraft(notes);setSaved(false);setError('')},[student,notes]);
 return <section className="student-notes" aria-label="學生備註"><h3>備註</h3><form onSubmit={async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');setSaved(false);
  try{if(!navigator.onLine)throw Error('目前離線，請連線後再儲存');await studioRequest({action:'student_notes',student,notes:draft,expectedNotes:notes});onSaved();setSaved(true)}catch(e){setError(String(e))}finally{setBusy(false)}
 }}><label>學生備註<textarea maxLength={4000} rows={5} value={draft} onChange={e=>{setDraft(e.target.value);setSaved(false)}} placeholder="記錄學習進度、教材或需要留意的事項…"/></label><div className="row"><small>{draft.length} / 4000 字</small><button disabled={busy||draft===notes}>{busy?'儲存中…':'儲存備註'}</button></div>{error&&<p role="alert" className="alert">{error}</p>}{saved&&<p role="status">備註已儲存</p>}</form></section>;
}
