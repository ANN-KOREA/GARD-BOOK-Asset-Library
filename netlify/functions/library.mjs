import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { isProductionRequest } from '../../shared/deployment.mjs';
import { EMPTY_SERVER_STATE, emailKey, subscriberVisibleBooks, mutateServerState } from '../../shared/policy.mjs';

const HEADERS={'Cache-Control':'no-store, private','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"};
const reply=(payload,status=200)=>Response.json(payload,{status,headers:HEADERS});
const sameOrigin=(request)=>request.headers.get('origin')===new URL(request.url).origin;
const store=()=>getStore('gard-book-published-v1');
const storageRead=async()=> (await store().get('state',{type:'json',consistency:'strong'})) ?? EMPTY_SERVER_STATE();

export default async function handler(request) {
  if(!isProductionRequest(request)) return reply({error:'실제 구독 서비스는 production에서만 사용합니다. 미리보기에서 실데이터 접근을 차단했습니다.'},403);
  if(!process.env.GARD_OWNER_EMAIL) return reply({error:'Netlify 환경변수 GARD_OWNER_EMAIL을 먼저 지정하세요.'},503);
  let user;
  try { user=await getUser(); } catch { return reply({error:'로그인 검증을 완료할 수 없습니다.'},401); }
  if(!user?.email) return reply({error:'로그인 후 이용할 수 있습니다.'},401);
  const email=emailKey(user.email);
  const owner=email===emailKey(process.env.GARD_OWNER_EMAIL);
  try {
    if(request.method==='GET'){
      const state=await storageRead();
      if(owner) return reply({role:'owner',email,version:state.version,books:Object.values(state.books),subscribers:Object.values(state.subscribers),audit:state.audit});
      const books=subscriberVisibleBooks(state,email);
      const s=state.subscribers[email];
      return reply({role:'subscriber',email,status:books.length?'approved':s?.active?'no-books':'pending',books,expiresAt:s?.expiresAt??''});
    }
    if(request.method!=='POST') return reply({error:'허용되지 않는 HTTP 메서드'},405);
    if(!owner) return reply({error:'오너만 변경할 수 있습니다.'},403);
    if(!sameOrigin(request)) return reply({error:'요청 출처가 다릅니다.'},403);
    if(!request.headers.get('content-type')?.includes('application/json')) return reply({error:'JSON 요청만 가능합니다.'},415);
    const text=await request.text(); if(text.length>90000) return reply({error:'요청 크기 초과'},413);
    const body=JSON.parse(text);
    const op=body.op;
    // Optimistic concurrency guard: stops accidental overwrites from a second browser/tab.
    const before=await storageRead();
    if(body.expectedVersion!==before.version) return reply({error:'다른 곳에서 데이터가 수정되었습니다. 새로고침 후 다시 시도하세요.',version:before.version},409);
    const next=mutateServerState(before,op,body,email);
    await store().setJSON('state',next);
    return reply({ok:true,version:next.version});
  } catch(error) {
    const userSafe=String(error?.message||'처리에 실패했습니다.').slice(0,200);
    const code=error instanceof SyntaxError?400:(/인증|승인/.test(userSafe)?403:400);
    return reply({error:userSafe},code);
  }
}
export const config={path:'/api/library'};
