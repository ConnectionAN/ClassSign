import {useEffect,useState} from 'react';
import {NavigationIcon,type NavigationIconName} from './UI';
export function useMobile(){const [mobile,setMobile]=useState(()=>window.matchMedia('(width < 768px)').matches);useEffect(()=>{const query=window.matchMedia('(width < 768px)'),change=()=>setMobile(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change)},[]);return mobile}
const mobileNavigation:{key:string;label:string;icon:NavigationIconName}[]=[{key:'schedule',label:'課表',icon:'calendar'},{key:'students',label:'學生',icon:'students'},{key:'billing',label:'收費',icon:'wallet'},{key:'more',label:'更多',icon:'more'}];
export function MobileNavigation({tab,onChange}:{tab:string;onChange:(tab:string)=>void}){return <nav className="mobile-navigation no-print" aria-label="手機主要導覽">{mobileNavigation.map(({key,label,icon})=><button key={key} aria-current={(key===tab||(key==='more'&&['stats','accounts'].includes(tab)))?'page':undefined} onClick={()=>onChange(key)}><span aria-hidden="true"><NavigationIcon name={icon}/></span>{label}</button>)}</nav>}
export function MobileStudentTabs({value,onChange}:{value:string;onChange:(v:string)=>void}){return <nav className="mobile-student-tabs" aria-label="學生資料分頁">{[['schedule','課表'],['notes','備註'],['materials','教材購入記錄'],['history','課程紀錄']].map(([key,label])=><button key={key} aria-pressed={value===key} onClick={()=>onChange(key)}>{label}</button>)}</nav>}

export function MobilePane({mobile,visible,children}:{mobile:boolean;visible:boolean;children:React.ReactNode}){return <div className={mobile&&!visible?'mobile-pane-hidden':'student-pane'}>{children}</div>}

export function MobileReportSection({title,children}:{title:string;children:React.ReactNode}){const mobile=useMobile();return mobile?<details className="mobile-report-controls"><summary>{title}</summary>{children}</details>:<>{children}</>}
