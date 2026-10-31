import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured=!!url&&!!key&&!url.includes('YOUR_PROJECT')&&!key.includes('YOUR_PUBLISHABLE');
if(key&&(key.startsWith('sb_secret_')))throw new Error('請使用 publishable key，不能使用 secret key');
export const supabase=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
export async function studioRequest(b?:Record<string,unknown>){
 if(!supabase)throw new Error('尚未設定 Supabase');
 if(b){const {data,error}=await supabase.rpc('studio_action',{b});if(error)throw new Error(error.message);return data;}
 const access=await supabase.from('teacher_access').select('user_id').maybeSingle();
 if(access.error)throw new Error(access.error.message);if(!access.data)throw new Error('此帳號尚未啟用老師權限，請依設定指南加入 teacher_access');
 async function all(table:string,columns:string,order:string){let result:unknown[]=[];for(let page=0;;page++){const {data,error}=await supabase!.from(table).select(columns).order(order,{ascending:false}).order('id',{ascending:false}).range(page*500,page*500+499);if(error)throw new Error(error.message);result=result.concat(data);if(data.length<500)return result;}}
 const [students,lessons,fees]=await Promise.all([all('students','*','created'),all('lessons','id,student,day,fee,created,reason,voided','created'),all('fee_changes','*','changed')]);
 lessons.sort((a:any,b:any)=>b.day.localeCompare(a.day)||b.created.localeCompare(a.created));
 return {students,lessons,fees};
}

