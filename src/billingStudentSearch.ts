type Student={id:string;name:string;active:number};
type InvoiceName={student:string;student_name:string};
const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('zh-TW');
export const matchesStudentKeyword=(keyword:string,...names:string[])=>names.some(name=>normalized(name).includes(normalized(keyword)));
// Keep the supplied lesson order. Historical-only students remain searchable for issued/void bags.
export function billingStudentSuggestions(students:Student[],invoices:InvoiceName[],keyword:string){
 if(!normalized(keyword))return [];
 const candidates=[...students];const ids=new Set(students.map(s=>s.id));
 for(const invoice of invoices)if(!ids.has(invoice.student)){ids.add(invoice.student);candidates.push({id:invoice.student,name:invoice.student_name,active:0})}
 return candidates.filter(s=>matchesStudentKeyword(keyword,s.name));
}
