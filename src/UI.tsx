import type {ButtonHTMLAttributes,ReactNode} from 'react';

export type NavigationIconName='calendar'|'students'|'reports'|'wallet'|'accounts'|'more';
const navigationIcons:Record<NavigationIconName,ReactNode>={
 more:<><path d="M4 6h16M4 12h16M4 18h16"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m6 0h2m-10 3h2"/></>,
 students:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/></>,
 reports:<><path d="M4 3v16a2 2 0 0 0 2 2h15M9 16v-5m5 5V7m5 9V4"/></>,
 wallet:<><path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V7"/><path d="M21 13h-5v4h5"/></>,
 accounts:<><rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M8 17a4 4 0 0 1 8 0"/></>,
};
export function NavigationIcon({name}:{name:NavigationIconName}){
 return <svg className="ui-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{navigationIcons[name]}</svg>;
}

/* Presentation only. Callers own state, validation, requests and navigation. */
export function Button({variant='secondary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'quiet'}){
 return <button className={`ui-button ${variant==='primary'?'primary':variant==='quiet'?'text':''} ${className}`} {...props}/>;
}

export function SectionHeading({eyebrow,title,description,actions,className=''}:{eyebrow?:string;title:ReactNode;description?:ReactNode;actions?:ReactNode;className?:string}){
 return <div className={`ui-section-heading ${className}`}><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description&&<p className="muted">{description}</p>}</div>{actions&&<div className="ui-heading-actions">{actions}</div>}</div>;
}

export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:string}){
 return <span className={`ui-status ui-status-${tone}`}>{children}</span>;
}

export function MetricCard({label,value,unit,description,icon}:{label:string;value:ReactNode;unit?:string;description?:string;icon:ReactNode}){
 return <div className="ui-metric"><span className="ui-metric-label">{label}</span><i className="ui-metric-icon" aria-hidden="true">{icon}</i><strong>{value}{unit&&<small>{unit}</small>}</strong>{description&&<small>{description}</small>}</div>;
}

export function StudentIdentity({name,description,large=false}:{name:string;description?:ReactNode;large?:boolean}){
 return <span className={`ui-identity ${large?'ui-identity-large':''}`}><span className="avatar" aria-hidden="true">{name.slice(0,1)}</span><span className="ui-identity-copy">{large?<span role="heading" aria-level={2} className="ui-identity-name">{name}</span>:<strong>{name}</strong>}{description&&<small>{description}</small>}</span></span>;
}

export function StudentListItem({name,description,count,selected,onClick}:{name:string;description:ReactNode;count:number;selected:boolean;onClick:()=>void}){
 return <Button className={`student ${selected?'chosen':''}`} aria-pressed={selected} onClick={onClick}><StudentIdentity name={name} description={description}/><span className="count">{count} 堂 <span aria-hidden="true">›</span></span></Button>;
}

export function SegmentedControl<T extends string>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}){
 return <div className="ui-segmented" role="group" aria-label={label}>{options.map(option=><Button key={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)}>{option.label}</Button>)}</div>;
}

export function LessonCard({time,name,status,label,children,onClick}:{time:string;name:string;status:string;label:string;children?:ReactNode;onClick:()=>void}){
 return <Button className={`schedule-card ${status}`} onClick={onClick}><div className="ui-lesson-top"><strong>{time}</strong><span className="ui-lesson-dot" aria-hidden="true"/></div><span className="ui-lesson-name">{name}</span><StatusBadge tone={status}>{label}</StatusBadge>{children}</Button>;
}

export function CalendarDayHeading({date,weekday,count,today}:{date:string;weekday:string;count:number;today:boolean}){
 return <div className={`ui-day-heading ${today?'is-today':''}`}><h3><span>{weekday}</span><strong>{date}</strong></h3><span className="ui-day-count">{count} 堂</span></div>;
}

/* Report display components receive ready-to-render values only. */
export function ReportMetricCard({label,value,description}:{label:string;value:ReactNode;description?:string}){
 return <div className="report-metric"><span>{label}</span><strong>{value}</strong>{description&&<small>{description}</small>}</div>;
}
export function ReportSectionHeading({title,description}:{title:string;description?:string}){
 return <div className="report-section-heading"><h2>{title}</h2>{description&&<p>{description}</p>}</div>;
}

// Report graphics receive display-ready values; requests and ledger rules stay with callers.
export function ReportCollectionBar({label,percentage,received,outstanding,note}:{label:string;percentage:number|null;received:string;outstanding:string;note:string}){
 return <section className="report-chart report-collection no-print" aria-label={label}><div className="report-chart-heading"><h3>{label}</h3><strong>{percentage===null?'不適用':`${percentage.toFixed(1)}% 已配置`}</strong></div>{percentage!==null&&<div role="meter" aria-label="已配置收款占正式應收比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,percentage))} aria-valuetext={`${percentage.toFixed(1)}% 已配置`} className="report-track"><span style={{width:`${Math.min(100,Math.max(0,percentage))}%`}}/></div>}<div className="report-chart-legend"><span>已配置 {received}</span><span>尚未收款 {outstanding}</span></div><p>{note}</p></section>;
}
export function ReportBreakdown({title,items,note}:{title:string;items:{label:string;value:string;width:number|null}[];note:string}){
 return <section className="report-chart no-print" aria-label={title}><h3>{title}</h3><ul>{items.map(item=><li key={item.label}><div className="report-chart-heading"><span>{item.label}</span><strong>{item.value}</strong></div>{item.width!==null&&<div className="report-track" aria-hidden="true"><span style={{width:`${item.width}%`}}/></div>}</li>)}</ul><p>{note}</p></section>;
}
