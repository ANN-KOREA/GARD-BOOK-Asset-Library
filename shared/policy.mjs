/**
 * Pure security and data policy; shared by browser and Netlify Functions.
 * Private notes, original file paths, and arbitrary imported fields never leave the owner vault.
 */
export const CATEGORIES = {
  A: '생애·자서전·철학·에세이',
  B: 'ICF·기능수행·Rasch·측정',
  C: '공공책임·시민권·수어',
  D: '실천경영·창업·앱·자산화',
  E: '지식복원·AI 자기훈련·일관성',
  F: 'WELL-IS·경계·사건자산',
  G: '독서·독후감·경영사례'
};
export const BOOK_ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
export const EMPTY_SERVER_STATE = () => ({schemaVersion:1, books:{}, subscribers:{}, audit:[], version:0});

export function emailKey(value) {
  return String(value ?? '').trim().toLowerCase();
}
export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(value));
}
export function validBookId(value) {return BOOK_ID_PATTERN.test(String(value ?? ''));}
const clean = (value, max=150) => String(value ?? '').trim().slice(0,max);
export function publishedBook(raw) {
  if (!raw || !validBookId(raw.book_id)) throw new Error('올바른 BOOK ID가 필요합니다.');
  const title=clean(raw.title,180);
  if(!title) throw new Error('BOOK 제목이 필요합니다.');
  if(!Object.hasOwn(CATEGORIES,raw.category_code)) throw new Error('분류 코드는 A~G 중 하나여야 합니다.');
  const pages=Number(raw.pages_reference ?? 0);
  return {
    book_id:clean(raw.book_id,80), title,
    category_code:raw.category_code,
    category:CATEGORIES[raw.category_code],
    document_date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.document_date ?? '')) ? raw.document_date : '',
    pages_reference:Number.isInteger(pages) && pages>=0 && pages<=3000 ? pages : 0,
    summary:clean(raw.summary,1300),
    description:clean(raw.description,18000),
    edition:clean(raw.edition,120),
    // Deliberate allow-list. No private_note, source_filename, local_path, or raw content fields.
  };
}
export function subscriberVisibleBooks(serverState, email, now=Date.now()) {
  const state=serverState ?? EMPTY_SERVER_STATE();
  const subscriber=state.subscribers?.[emailKey(email)];
  if(!subscriber || subscriber.active !== true || (subscriber.expiresAt && new Date(subscriber.expiresAt).getTime()<=now)) return [];
  const permitted=new Set(Array.isArray(subscriber.bookIds) ? subscriber.bookIds : []);
  return Object.values(state.books ?? {}).filter(b=>permitted.has(b.book_id));
}
export function canReadBook(state, email, isOwner, bookId, now=Date.now()) {
  if(!validBookId(bookId)) return false;
  if(!state?.books?.[bookId]) return false;
  return !!isOwner || subscriberVisibleBooks(state,email,now).some(b=>b.book_id===bookId);
}
export function sanitizeImportedRecords(doc) {
  const incoming=Array.isArray(doc) ? doc : (Array.isArray(doc?.books) ? doc.books : null);
  if(!incoming) throw new Error('books 배열이 있는 GARD BOOK JSON이 필요합니다.');
  if(incoming.length>3000) throw new Error('한 번에 3,000종을 초과해 가져올 수 없습니다.');
  const unique=new Map();
  for(const raw of incoming) {
    const id=String(raw.book_id || '').trim();
    if(!validBookId(id)) continue;
    const code=Object.hasOwn(CATEGORIES,raw.category_code) ? raw.category_code : 'D';
    unique.set(id,{
      book_id:id,
      title:clean(raw.title,180), category_code:code,
      document_date:clean(raw.document_date,10),
      pages_reference:Math.min(3000,Math.max(0,Math.trunc(Number(raw.pages_reference)||0))),
      summary:clean(raw.summary,1300),
      description:clean(raw.description,18000),
      edition:clean(raw.edition,120),
      source_filename:clean(raw.source_filename,350),
      private_note:clean(raw.private_note,20000),
      owner_approved_public_fields:false,
      updated_at:new Date().toISOString()
    });
  }
  return [...unique.values()].filter(b=>b.title);
}
export function normalizeSubscriberInput(value,state) {
  const email=emailKey(value.email);
  if(!validEmail(email)) throw new Error('구독자 이메일 형식이 올바르지 않습니다.');
  const bookIds=[...new Set((Array.isArray(value.bookIds)?value.bookIds:[]).filter(id=>Boolean(state.books[id])))];
  let expiresAt='';
  if(value.expiresAt){
    const dt=new Date(value.expiresAt);
    if(!Number.isFinite(dt.getTime())) throw new Error('종료일이 올바르지 않습니다.');
    expiresAt=dt.toISOString();
  }
  return {email,bookIds,expiresAt,active:true,updatedAt:new Date().toISOString()};
}
export function mutateServerState(old, op, args, actor) {
  // Pure mutation model used by tests and server; server alone authorizes caller.
  const state=structuredClone(old ?? EMPTY_SERVER_STATE());
  const who=emailKey(actor);
  if(op==='publish') {
    const b=publishedBook(args.book);
    const prev=state.books[b.book_id];
    state.books[b.book_id]={...b,file:prev?.file ?? null,publishedAt:new Date().toISOString()};
    addAudit(state,'publish',who,b.book_id);
  } else if(op==='unpublish') {
    if(!validBookId(args.bookId)) throw new Error('잘못된 BOOK ID');
    delete state.books[args.bookId];
    // Keep approvals so no previously published book may accidentally be re-enabled on re-publication:
    for(const s of Object.values(state.subscribers)) s.bookIds=(s.bookIds||[]).filter(id=>id!==args.bookId);
    addAudit(state,'unpublish',who,args.bookId);
  } else if(op==='approve') {
    const sub=normalizeSubscriberInput(args,state);
    state.subscribers[sub.email]=sub;
    addAudit(state,'approve',who,sub.email);
  } else if(op==='revoke') {
    const key=emailKey(args.email);
    if(!validEmail(key)||!state.subscribers[key]) throw new Error('등록되지 않은 구독자입니다.');
    state.subscribers[key]={...state.subscribers[key],active:false,updatedAt:new Date().toISOString()};
    addAudit(state,'revoke',who,key);
  } else if(op==='fileSet') {
    if(!state.books[args.bookId]) throw new Error('먼저 BOOK을 게시해야 합니다.');
    state.books[args.bookId].file={name:clean(args.name,180),type:'application/pdf',size:args.size};
    addAudit(state,'fileSet',who,args.bookId);
  } else if(op==='fileDelete') {
    if(!state.books[args.bookId]) throw new Error('게시된 BOOK이 아닙니다.');
    state.books[args.bookId].file=null;
    addAudit(state,'fileDelete',who,args.bookId);
  } else throw new Error('지원되지 않는 명령입니다.');
  state.version=(state.version||0)+1;
  return state;
}
function addAudit(s,action,email,target){s.audit=[{action,by:email,target,at:new Date().toISOString()},...(s.audit||[])].slice(0,150);}
