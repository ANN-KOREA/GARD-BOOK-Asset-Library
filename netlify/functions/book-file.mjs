import {getUser} from '@netlify/identity';
import {getStore} from '@netlify/blobs';
import {emailKey,canReadBook,validBookId,mutateServerState} from '../../shared/policy.mjs';
const H={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const json=(obj,status=200)=>Response.json(obj,{status,headers:H});
const S=()=>getStore('gard-book-published-v1');
const F=()=>getStore('gard-book-files-v1');
const validPdf=(buffer)=>{const b=new Uint8Array(buffer); return b.length>=8&&String.fromCharCode(...b.slice(0,5))==='%PDF-';};

export default async function handler(request){
  if(process.env.CONTEXT!=='production')return json({error:'프리뷰에서는 BOOK 파일에 접근할 수 없습니다.'},403);
  if(!process.env.GARD_OWNER_EMAIL)return json({error:'오너 환경 설정이 없습니다.'},503);
  let user;
  try{user=await getUser();}catch{return json({error:'인증 실패'},401);}
  if(!user?.email)return json({error:'로그인이 필요합니다.'},401);
  const email=emailKey(user.email),owner=email===emailKey(process.env.GARD_OWNER_EMAIL);
  const bookId=new URL(request.url).searchParams.get('bookId')||'';
  if(!validBookId(bookId))return json({error:'잘못된 BOOK ID'},400);
  try{
    const state=(await S().get('state',{type:'json',consistency:'strong'}))||{books:{},subscribers:{},audit:[],version:0};
    if(request.method==='GET'){
      if(!canReadBook(state,email,owner,bookId))return json({error:'열람 권한이 없습니다.'},403);
      const meta=state.books[bookId]?.file;
      if(!meta)return json({error:'배포된 PDF 파일이 없습니다.'},404);
      const content=await F().get('pdf-'+bookId,{type:'arrayBuffer',consistency:'strong'});
      if(!content)return json({error:'파일 저장소에 원본이 없습니다.'},404);
      const fileName=String(meta.name||'book.pdf').replace(/[\r\n"\\]/g,'_');
      return new Response(content,{status:200,headers:{...H,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="GARD-BOOK.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Content-Length':String(content.byteLength)}});
    }
    if(request.method!=='POST'&&request.method!=='DELETE')return json({error:'허용되지 않은 요청'},405);
    if(!owner)return json({error:'오너 전용 기능입니다.'},403);
    if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'외부 출처 요청 차단'},403);
    if(!state.books[bookId])return json({error:'먼저 해당 BOOK의 메타데이터를 게시하세요.'},404);
    if(request.method==='DELETE'){
      const next=mutateServerState(state,'fileDelete',{bookId},email);
      await S().setJSON('state',next);
      await F().delete('pdf-'+bookId);
      return json({ok:true,version:next.version});
    }
    const form=await request.formData();
    const file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function')return json({error:'PDF 파일이 필요합니다.'},400);
    if(file.size>4*1024*1024 || file.size===0)return json({error:'PDF는 4MB 이하만 가능합니다. 큰 파일은 별도 저장 설계가 필요합니다.'},413);
    if(!String(file.name).toLowerCase().endsWith('.pdf'))return json({error:'PDF만 지원합니다.'},415);
    const data=await file.arrayBuffer();
    if(!validPdf(data))return json({error:'PDF 파일 서명이 올바르지 않습니다.'},415);
    await F().set('pdf-'+bookId,data);
    const next=mutateServerState(state,'fileSet',{bookId,name:file.name,size:file.size},email);
    await S().setJSON('state',next);
    return json({ok:true,version:next.version,file:next.books[bookId].file});
  }catch(e){return json({error:String(e?.message||'파일 처리 실패').slice(0,200)},400);}
}
export const config={path:'/api/book-file'};
