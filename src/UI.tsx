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
