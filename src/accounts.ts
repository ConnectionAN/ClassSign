import {supabase} from './client';
export type Account={user_id:string;email:string;is_admin:boolean;disabled:boolean;first_login:string;last_login:string;changed_at:string|null};
export class AccountError extends Error{constructor(message:string,public denied:boolean){super(message)}}
export async function accountRequest(action:string,fields:Record<string,unknown>={}){
 if(!supabase)throw new Error('尚未連接 Supabase');
 const {data,error}=await supabase.rpc('account_action',{b:{...fields,action}});
 if(error)throw new AccountError(error.code==='42501'?'此帳號已停用或無權進入系統，請聯絡管理員。':'帳號操作失敗，請重新整理後重試。',error.code==='42501');
 return data;
}
