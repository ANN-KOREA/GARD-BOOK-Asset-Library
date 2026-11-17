import {getUser, login, logout, handleAuthCallback, acceptInvite} from '@netlify/identity';
import {CATEGORIES,sanitizeImportedRecords,emailKey} from '../shared/policy.mjs';
import {encryptObject,decryptObject,getStoredVault,saveStoredVault,newVault} from './vault.mjs';
import './style.css';

const app=document.getElementById('page');
const authSpot=document.getElementById('authSpot');
const $=id=>document.getElementById(id);
const state={user:null,remote:null,vault:null,passphrase:null,tab:'books',query:'',category:'all',notice:'',inviteToken:'',working:false,needsSetup:false};
document.body.classList.toggle('large-text',localStorage.getItem('gard-book-large-text')==='on');
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>s ? String(s).slice(0,10) : '—';
const fmtBytes=n=>(n/1024/1024).toFixed(2)+'MB';
const safeText=(v,n=110)=>escapeHtml(String(v??'').slice(0,n));
const categories=Object.entries(CATEGORIES);
function notify(message,kind='info'){
  state.notice=message;
  const existing=$('notice');
  if(existing){existing.className='notice '+kind; existing.textContent=message;}
  else render();
}
function downloadData(content,filename,type='application/json'){
  const blob=new Blob([content],{type});const u=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=u;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
}
async function api(url,options={}){
  const resp=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const json=await resp.json().catch(()=>({error:'서버 응답을 해석할 수 없습니다.'}));
  if(!resp.ok) throw new Error(json.error || `서버 오류: ${resp.status}`);
  return json;
}
async function refresh(){state.remote=await api('/api/library');render();}
async function post(op,params){
  if(!state.remote||state.remote.role!=='owner')throw new Error('오너 로그인 필요');
  state.working=true;
  try{
    const resp=await api('/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,expectedVersion:state.remote.version,...params})});
    await refresh();return resp;
  }finally{state.working=false;}
}
async function saveVault(){
  if(!state.passphrase||!state.vault)throw new Error('보관함을 잠금 해제하세요.');
  state.vault.updatedAt=new Date().toISOString();
  saveStoredVault(await encryptObject(state.vault,state.passphrase));
}
async function start(){
  try {
    const cb=await handleAuthCallback();
    if(cb?.type==='invite'&&cb.token)state.inviteToken=cb.token;
    state.user=await getUser();
    if(state.user){state.remote=await api('/api/library');}
  }catch(err){state.notice='로그인 또는 서버 확인 문제: '+err.message;}
  render();
}
function header(){
  authSpot.innerHTML=state.user?`<span class="account">${safeText(state.remote?.email||state.user.email,42)}</span><button type="button" class="btn ghost small" id="fontToggle">큰 글씨</button><button type="button" class="btn ghost small" id="logoutBtn">로그아웃</button>`:'<span class="badge muted">승인제 서재</span>';
  if($('fontToggle'))$('fontToggle').onclick=()=>{const v=document.body.classList.toggle('large-text');localStorage.setItem('gard-book-large-text',v?'on':'off');};
  if($('logoutBtn'))$('logoutBtn').onclick=async()=>{try{await logout();state.user=null;state.remote=null;state.vault=null;state.passphrase=null;state.tab='books';render();}catch(e){notify(e.message,'error');}};
  $('footStatus').textContent=state.remote?.role==='owner'?'● OWNER':state.remote?.role==='subscriber'?'● SUBSCRIBER':'● 로그인 필요';
}
function shellTitle(role,sub){return `<section class="hero"><div class="eyebrow">GARD / BOOK ASSET LIBRARY / 2026</div><div class="hero-main"><div><h1>${role}</h1><p>${sub}</p></div><div class="hero-stamp">SELF-OWNED<br><b>KNOWLEDGE</b><small>Verification before transaction</small></div></div></section>`;}
function render(){
  header();
  if(!state.user){renderLogin();return;}
  if(!state.remote){app.innerHTML=shellTitle('연결 확인','서버에서 회원 권한을 확인하지 못했습니다.')+`<div class="panel"><p>${safeText(state.notice,400)||'Netlify에 배포하고 Identity와 오너 환경변수를 설정하세요.'}</p><button class="btn dark" id="retry">다시 시도</button></div>`; $('retry').onclick=async()=>{try{state.remote=await api('/api/library');render();}catch(e){notify(e.message,'error');}};return;}
  if(state.remote.role==='owner'&&!state.vault){renderUnlock();return;}
  if(state.remote.role==='owner'){renderOwner();return;}
  renderSubscriber();
}
function renderLogin(){
  app.innerHTML=shellTitle('나의 BOOK, 나의 자산','인간의 질문으로 만든 책과 검증 자료를 원하는 만큼만 공개합니다.')+`
  <div class="login-grid"><section class="panel access-card"><div class="section-kicker">ACCESS / IDENTITY</div><h2>${state.inviteToken?'초대장 수락':'승인된 회원 로그인'}</h2><p>BOOK 콘텐츠는 로그인 및 서버의 승인 검사를 통과해야 열람할 수 있습니다. 웹 주소가 공개되어도 원본은 노출되지 않습니다.</p>
  <form id="authForm"><label>${state.inviteToken?'초대장 수락 후 사용할 비밀번호':'이메일 주소'}${state.inviteToken?'<input name="password" type="password" minlength="10" autocomplete="new-password" placeholder="10자 이상 비밀번호" required />':'<input name="email" type="email" autocomplete="email" placeholder="이메일 입력" required />'}</label>
  ${state.inviteToken?'':'<label>비밀번호<input name="password" type="password" autocomplete="current-password" placeholder="Netlify Identity 비밀번호" required /></label>'}
  <button class="btn dark wide" type="submit">${state.inviteToken?'초대장 수락':'로그인'} <span>↗</span></button></form>${state.notice?`<div class="notice error" id="notice">${safeText(state.notice,240)}</div>`:''}<p class="tiny">가입은 초대 전용입니다. 오너가 먼저 승인하고 Netlify Identity에서 초대합니다.</p></section>
  <aside class="panel explanation"><span class="circle-num">01 / 02</span><h3>오너 서재</h3><p>BOOK 33종 원장 가져오기, 암호화 보관함, 공개 승인, PDF 게시, 구독자별 접근권한 관리</p><div class="rule"></div><span class="circle-num">02 / 02</span><h3>구독자 서재</h3><p>내 계정에 승인된 BOOK만 검색·읽기·다운로드. 원본 비공개 메모와 다른 구독자의 정보는 볼 수 없습니다.</p></aside></div>`;
  $('authForm').onsubmit=async(ev)=>{ev.preventDefault();const data=new FormData(ev.currentTarget);const pass=String(data.get('password'));
    try{state.notice='';if(state.inviteToken){await acceptInvite(state.inviteToken,pass);state.inviteToken='';state.notice='초대를 수락했습니다. 발급받은 이메일로 로그인하세요.';state.user=await getUser();}else{await login(String(data.get('email')),pass);state.user=await getUser();} if(state.user)state.remote=await api('/api/library'); render();}catch(e){notify(e.message,'error');}
  };
}
function renderUnlock(){
  const exists=!!getStoredVault();
  app.innerHTML=shellTitle('오너의 비공개 서재','서재 정보는 이 브라우저에 암호화되어 보관됩니다. 서버에는 승인한 항목만 게시됩니다.')+
  `<div class="panel unlock"><div class="section-kicker">PRIVATE / ENCRYPTED</div><h2>${exists?'나의 로컬 원장 열기':'비공개 BOOK 원장 만들기'}</h2><p>${exists?'보관함 암호를 입력하면 이 브라우저의 원장이 열립니다.':'10자 이상의 암호를 지정한 뒤 이전 대화에서 받은 BOOK JSON을 가져오세요.'}</p><form id="vaultForm"><label>보관함 암호<input name="passphrase" type="password" minlength="10" autocomplete="off" placeholder="10자 이상" required></label><button type="submit" class="btn dark">${exists?'암호화 원장 열기':'새 로컬 원장 만들기'}</button></form>${state.notice?`<div id="notice" class="notice error">${safeText(state.notice,280)}</div>`:''}<p class="tiny">암호를 분실하면 복구할 수 없습니다. 암호화 백업을 별도로 보관하세요. 브라우저 데이터 삭제 시 로컬 원장이 사라질 수 있습니다.</p></div>`;
  $('vaultForm').onsubmit=async e=>{e.preventDefault();const pass=String(new FormData(e.currentTarget).get('passphrase'));
    try{state.vault=exists?await decryptObject(getStoredVault(),pass):newVault();state.passphrase=pass;if(!exists)await saveVault();render();}catch(err){notify(err.message,'error');}
  };
}
function nav(){return `<nav class="tabs" aria-label="BOOK 화면"><button class="tab ${state.tab==='books'?'active':''}" data-tab="books">BOOK 원장</button><button class="tab ${state.tab==='subs'?'active':''}" data-tab="subs">구독자 승인</button><button class="tab ${state.tab==='audit'?'active':''}" data-tab="audit">실행·변경 이력</button><button class="tab ${state.tab==='help'?'active':''}" data-tab="help">운영 안내</button></nav>`;}
function renderOwner(){
  const local=state.vault.books||[],pub=state.remote.books||[],approved=(state.remote.subscribers||[]).filter(x=>x.active).length;
  app.innerHTML=shellTitle('BOOK을 관리하는 사람','오너의 통제권 · 암호화 로컬 원장 · 승인된 정보만 선택적으로 서버 게시')+
    `<div class="stats"><div class="stat"><div>로컬 원장 BOOK</div><strong>${local.length}</strong><span>내 브라우저 암호화 저장</span></div><div class="stat"><div>서버 게시 BOOK</div><strong>${pub.length}</strong><span>공개 승인 완료 항목</span></div><div class="stat"><div>활성 구독자</div><strong>${approved}</strong><span>BOOK별 권한 확인</span></div></div>${nav()}<div id="notice" class="notice ${state.notice?'':'hidden'}">${safeText(state.notice,300)}</div><section id="tabPanel"></section>`;
  const panel=$('tabPanel');
  if(state.tab==='books')ownerBooks(panel);else if(state.tab==='subs')subscriberAdmin(panel);else if(state.tab==='audit')auditPanel(panel);else helpPanel(panel);
  app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.notice='';render();});
}
function ownerBooks(panel){
  panel.innerHTML=`<div class="toolbar"><div><h2>BOOK 자산 원장</h2><p>기존 BOOK 33종 JSON 가져오기 → 오너 검토 → 개별 공개 승인</p></div><div class="actions"><button class="btn outline" id="importButton">JSON 가져오기</button><button class="btn outline" id="backupButton">암호화 백업</button><button class="btn dark" id="addButton">+ 새 BOOK</button></div></div>
  <input id="importInput" type="file" accept=".json,application/json" hidden><input id="fileInput" type="file" accept=".pdf,application/pdf" hidden><div class="filter-bar"><label class="search-box"><span>⌕</span><input id="searchField" placeholder="BOOK 제목·파일명 검색" value="${safeText(state.query,100)}" /></label><select id="categoryField" aria-label="분류 선택"><option value="all">전체 분류</option>${categories.map(([k,v])=>`<option value="${k}" ${state.category===k?'selected':''}>${k}. ${v}</option>`).join('')}</select><button class="btn ghost small" id="serverRefresh">서버 새로고침</button></div><div id="categoryChips" class="category-chips">${categories.map(([k,label])=>`<button type="button" data-filter="${k}" class="category-chip">${k} · ${(state.vault.books||[]).filter(b=>b.category_code===k).length}종</button>`).join('')}</div><div id="ownerRows"></div><div class="helper-strip"><span class="dot"></span> 파일명·비공개 메모는 공개 API에 전송되지 않습니다. 구독자용 본문·파일은 승인한 경우에만 서버에 저장합니다.</div>`;
  renderOwnerRows();
  $('searchField').oninput=e=>{state.query=e.target.value;renderOwnerRows();};
  $('categoryField').onchange=e=>{state.category=e.target.value;renderOwnerRows();};
  panel.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.category=state.category===b.dataset.filter?'all':b.dataset.filter;$('categoryField').value=state.category;renderOwnerRows();});
  $('importButton').onclick=()=>$('importInput').click();
  $('importInput').onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      const payload=JSON.parse(await f.text());
      if(payload.format==='GARD-BOOK-ENCRYPTED-VAULT') {
        const imported=await decryptObject(payload,state.passphrase);
        if(!confirm(`암호화 백업의 BOOK ${imported.books?.length||0}종으로 이 브라우저의 원장을 교체하시겠습니까?`))return;
        state.vault=imported;await saveVault();notify('암호화 백업 복구 완료','success');
      } else {
        const records=sanitizeImportedRecords(payload);
        if(!confirm(`${records.length}종의 BOOK을 로컬 원장에 가져옵니다. 같은 ID의 항목은 업데이트됩니다. 진행하시겠습니까?`))return;
        const map=new Map((state.vault.books||[]).map(x=>[x.book_id,x]));
        for(const b of records){const before=map.get(b.book_id);map.set(b.book_id,{...b,private_note:before?.private_note||b.private_note});}
        state.vault.books=[...map.values()];await saveVault();notify(`${records.length}종 가져오기 완료. 외부 게시된 것은 없습니다.`,'success');
      }
      render();
    }catch(err){notify('가져오기 실패: '+err.message,'error');}finally{e.target.value='';}
  };
  $('backupButton').onclick=()=>{const encrypted=getStoredVault();downloadData(JSON.stringify(encrypted,null,2),'GARD_BOOK_OWNER_ENCRYPTED_BACKUP.json');notify('암호화 백업 파일을 저장했습니다.','success');};
  $('addButton').onclick=()=>openEditor(null);
  $('serverRefresh').onclick=async()=>{try{await refresh();notify('서버 상태가 갱신되었습니다.','success');}catch(e){notify(e.message,'error');}};
  $('fileInput').onchange=async e=>{const f=e.target.files?.[0],bookId=e.target.dataset.bookId;if(!f||!bookId)return;
    if(f.size>4*1024*1024)return notify('PDF는 4MB 이하만 업로드할 수 있습니다.','error');
    if(!confirm(`「${f.name}」을 승인 구독자가 다운로드할 수 있도록 서버에 게시하시겠습니까?`))return;
    try{const form=new FormData();form.append('file',f);await api('/api/book-file?bookId='+encodeURIComponent(bookId),{method:'POST',body:form});await refresh();notify('승인용 PDF 업로드가 완료되었습니다.','success');}catch(err){notify(err.message,'error');}finally{e.target.value='';}
  };
}
function renderOwnerRows(){
  const box=$('ownerRows');if(!box)return;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===state.category));
  const published=new Map((state.remote?.books||[]).map(b=>[b.book_id,b]));
  const filtered=(state.vault?.books||[]).filter(b=>(state.category==='all'||b.category_code===state.category)&&`${b.title} ${b.source_filename}`.toLowerCase().includes(state.query.toLowerCase()));
  box.innerHTML=filtered.length?`<div class="table-scroll"><table><thead><tr><th>자산명 / 원본 식별</th><th>분류</th><th>기록일</th><th>게시 상태</th><th>오너 실행</th></tr></thead><tbody>${filtered.map(b=>{const r=published.get(b.book_id);return `<tr><td><div class="book-name">${safeText(b.title,180)}</div><div class="book-sub">${safeText(b.book_id,50)} · ${safeText(b.source_filename||'파일 미지정',80)}</div></td><td><span class="category-tag">${b.category_code}</span> ${safeText(CATEGORIES[b.category_code],35)}</td><td class="smallcol">${fmtDate(b.document_date)}</td><td>${r?`<span class="status live">게시 중</span>${r.file?'<div class="mini-meta">PDF 첨부됨</div>':''}`:'<span class="status private">오너 전용</span>'}</td><td><div class="row-actions"><button class="btn ghost small" data-act="edit" data-id="${b.book_id}">편집</button>${r?`<button class="btn ghost small" data-act="publish" data-id="${b.book_id}">게시 갱신</button><button class="btn warn small" data-act="unpublish" data-id="${b.book_id}">게시 철회</button>`:`<button class="btn dark small" data-act="publish" data-id="${b.book_id}">공개 승인</button>`}${r?`<button class="btn ghost small" data-act="upload" data-id="${b.book_id}">PDF ↑</button>${r.file?`<button class="btn ghost small" data-act="remove-pdf" data-id="${b.book_id}">PDF 제거</button>`:''}`:`<button class="btn ghost small" data-act="delete-local" data-id="${b.book_id}">로컬 삭제</button>`}</div></td></tr>`;}).join('')}</tbody></table></div>`:`<div class="empty"><div class="empty-icon">▤</div><h3>표시할 BOOK이 없습니다</h3><p>이전 대화에서 받은 JSON 파일을 가져오거나 새 BOOK을 등록하세요.</p></div>`;
  box.querySelectorAll('[data-act]').forEach(btn=>btn.onclick=()=>performBookAction(btn.dataset.act,btn.dataset.id));
}
async function performBookAction(action,id){
  const b=(state.vault.books||[]).find(x=>x.book_id===id);if(!b)return;
  if(action==='edit')return openEditor(b);
  if(action==='upload'){$('fileInput').dataset.bookId=id;$('fileInput').click();return;}
  if(action==='delete-local'){
    if((state.remote.books||[]).some(x=>x.book_id===id))return notify('게시 중인 BOOK은 먼저 게시 철회를 완료해야 로컬에서 삭제할 수 있습니다.','error');
    if(!confirm(`「${b.title}」을 이 브라우저의 암호화 원장에서 삭제할까요?`))return;
    state.vault.books=state.vault.books.filter(x=>x.book_id!==id);await saveVault();render();return notify('로컬 BOOK 항목을 삭제했습니다.','success');
  }
  if(action==='remove-pdf'){
    if(!confirm('게시된 PDF 다운로드 파일을 서버에서 삭제하시겠습니까?'))return;
    try{await api('/api/book-file?bookId='+encodeURIComponent(id),{method:'DELETE'});await refresh();notify('게시 PDF를 삭제했습니다.','success');}catch(e){notify(e.message,'error');}
    return;
  }
  try{
    if(action==='publish'){
      if(!b.summary?.trim()){notify('공개용 요약이 없습니다. 먼저 BOOK을 편집하고 승인할 요약을 입력하세요.','error');return openEditor(b);}
      if(!confirm(`「${b.title}」의 제목·분류·공개용 요약·구독자용 본문을 서버에 게시할까요? 비공개 메모와 원본 파일명은 전송하지 않습니다.`))return;
      await post('publish',{book:b});notify('선택한 BOOK만 서버에 게시했습니다. 구독자별 별도 승인이 필요합니다.','success');
    } else if(action==='unpublish'){
      if(!confirm(`「${b.title}」의 게시를 철회할까요? 기존 구독자 권한에서도 제거됩니다.`))return;
      await post('unpublish',{bookId:id});notify('게시가 철회되었습니다. 이미 다운로드한 파일은 회수할 수 없습니다.','success');
    }
  }catch(e){notify(e.message,'error');}
}
function openEditor(book){
  const editing=!!book;
  const record=book||{book_id:'GARD-BOOK-'+Date.now(),title:'',category_code:'D',document_date:new Date().toISOString().slice(0,10),pages_reference:0,summary:'',description:'',source_filename:'',private_note:''};
  const dlg=$('editorModal');
  dlg.innerHTML=`<div class="modal-inner"><div class="modal-top"><div><div class="eyebrow">OWNER-ONLY / EDITOR</div><h2 id="editorTitle">${editing?'BOOK 정보 수정':'새 BOOK 등록'}</h2></div><button class="close-icon" id="closeEditor" aria-label="닫기">×</button></div><form id="bookForm"><label>BOOK ID<input value="${safeText(record.book_id,80)}" name="book_id" readonly /></label><label>BOOK 제목<input name="title" required maxlength="180" value="${safeText(record.title,180)}" /></label><div class="two"><label>분류<select name="category_code">${categories.map(([key,title])=>`<option value="${key}" ${record.category_code===key?'selected':''}>${key}. ${title}</option>`).join('')}</select></label><label>기록일<input type="date" name="document_date" value="${fmtDate(record.document_date)==='—'?'':record.document_date}" /></label></div><label>참조 쪽수<input name="pages_reference" type="number" min="0" max="3000" value="${Number(record.pages_reference)||0}" /></label><label>공개용 요약 (승인 시 서버 게시)<textarea name="summary" maxlength="1300" rows="3" placeholder="구독자에게 공개해도 되는 BOOK 설명">${safeText(record.summary,1300)}</textarea></label><label>구독자용 본문 또는 발췌 (승인 시 서버 게시)<textarea name="description" maxlength="18000" rows="4" placeholder="허용된 구독자에게 표시할 내용만 작성">${safeText(record.description,18000)}</textarea></label><div class="private-fields"><div class="section-kicker">LOCAL PRIVATE — 서버로 보내지 않음</div><label>원본 파일명<input name="source_filename" value="${safeText(record.source_filename,350)}" /></label><label>오너 비공개 메모<textarea rows="3" name="private_note">${safeText(record.private_note,20000)}</textarea></label></div><div class="modal-buttons"><button type="button" class="btn outline" id="cancelEditor">취소</button><button type="submit" class="btn dark">로컬 원장에 저장</button></div></form></div>`;
  dlg.showModal();$('closeEditor').onclick=()=>dlg.close();$('cancelEditor').onclick=()=>dlg.close();
  $('bookForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);
    const v={...record,book_id:String(fd.get('book_id')),title:String(fd.get('title')).trim(),category_code:String(fd.get('category_code')),document_date:String(fd.get('document_date')),pages_reference:Number(fd.get('pages_reference'))||0,summary:String(fd.get('summary')),description:String(fd.get('description')),source_filename:String(fd.get('source_filename')),private_note:String(fd.get('private_note')),updated_at:new Date().toISOString()};
    if(!v.title){notify('책 제목을 입력하세요.','error');return;}
    const map=new Map((state.vault.books||[]).map(x=>[x.book_id,x]));map.set(v.book_id,v);state.vault.books=[...map.values()];
    try{await saveVault();dlg.close();render();notify('로컬 BOOK 원장을 암호화 저장했습니다. 서버 게시 내용은 아직 바뀌지 않았습니다.','success');}catch(err){notify(err.message,'error');}
  };
}
function subscriberAdmin(panel){
  const books=state.remote.books||[];
  const subs=state.remote.subscribers||[];
  panel.innerHTML=`<div class="toolbar"><div><h2>구독자 승인 관리</h2><p>이메일 계정과 BOOK별 열람 범위를 서버에 등록합니다.</p></div></div><div class="two-panels"><section class="panel sub-form"><div class="section-kicker">INVITE / APPROVE</div><h3>구독자 접근권 설정</h3><form id="subForm"><label>구독자 이메일<input name="email" type="email" required placeholder="Netlify Identity에 초대한 주소" /></label><label>승인 종료일 (선택)<input type="date" name="expiresAt" /></label><div class="label-heading">이 구독자가 볼 BOOK 선택</div><div class="check-list">${books.length?books.map(b=>`<label class="book-check"><input type="checkbox" name="bookIds" value="${b.book_id}"/><span>${safeText(b.title,100)}</span></label>`).join(''):'<p class="tiny">먼저 오너 BOOK 원장에서 최소 1종을 게시하세요.</p>'}</div><button class="btn dark wide" type="submit" ${!books.length?'disabled':''}>구독자 승인 저장</button></form><p class="tiny">이 기능은 접근권한만 지정합니다. 실제 회원 초대 메일은 Netlify 대시보드의 Identity에서 보냅니다.</p></section><section class="panel"><div class="section-kicker">SUBSCRIBERS / STATUS</div><h3>등록된 구독자 (${subs.length})</h3>${subs.length?subs.map(s=>`<div class="subscriber-line"><div><div class="book-name">${safeText(s.email,90)}</div><div class="book-sub">승인 ${s.bookIds?.length||0}종 · 종료 ${s.expiresAt?fmtDate(s.expiresAt):'미지정'}</div></div><div class="sub-actions"><span class="status ${s.active?'live':'private'}">${s.active?'승인':'철회'}</span><button class="btn ghost small" data-sub-edit="${escapeHtml(s.email)}">수정</button><button class="btn outline small" data-sub-revoke="${escapeHtml(s.email)}" ${!s.active?'disabled':''}>철회</button></div></div>`).join(''):'<div class="empty compact">승인된 구독자 계정이 없습니다.</div>'}</section></div>`;
  $('subForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const email=emailKey(fd.get('email'));const bookIds=fd.getAll('bookIds').map(String);
    if(!bookIds.length)return notify('최소 한 권의 BOOK을 선택하세요.','error');
    let expiresAt='';if(fd.get('expiresAt'))expiresAt=String(fd.get('expiresAt'))+'T23:59:59+09:00';
    if(!confirm(`${email} 계정에 BOOK ${bookIds.length}종 열람권을 승인할까요?`))return;
    try{await post('approve',{email,bookIds,expiresAt});notify('구독자 승인 범위가 저장되었습니다.','success');}catch(err){notify(err.message,'error');}
  };
  panel.querySelectorAll('[data-sub-edit]').forEach(b=>b.onclick=()=>{const s=subs.find(x=>x.email===b.dataset.subEdit);if(!s)return;state.tab='subs';const f=$('subForm');f.elements.email.value=s.email;f.elements.expiresAt.value=s.expiresAt?fmtDate(s.expiresAt):'';f.querySelectorAll('input[name="bookIds"]').forEach(c=>c.checked=(s.bookIds||[]).includes(c.value));f.scrollIntoView({behavior:'smooth',block:'start'});});
  panel.querySelectorAll('[data-sub-revoke]').forEach(b=>b.onclick=async()=>{if(!confirm(`${b.dataset.subRevoke} 계정의 BOOK 열람권을 즉시 철회할까요?`))return;try{await post('revoke',{email:b.dataset.subRevoke});notify('구독자 접근권을 철회했습니다. 이미 다운로드한 파일은 회수할 수 없습니다.','success');}catch(err){notify(err.message,'error');}});
}
function auditPanel(panel){const entries=state.remote.audit||[];
  panel.innerHTML=`<div class="toolbar"><div><h2>변경 이력</h2><p>서버에서 승인·게시·철회된 최근 150개 기록입니다.</p></div></div><div class="panel audit">${entries.length?entries.map(e=>`<div class="audit-row"><span class="audit-action">${safeText(e.action,20)}</span><span>${safeText(e.target,120)}</span><small>${fmtDate(e.at)} · ${safeText(e.by,70)}</small></div>`).join(''):'<div class="empty compact">아직 서버 실행 기록이 없습니다.</div>'}</div>`;
}
function helpPanel(panel){panel.innerHTML=`<div class="panel docs"><h2>운영 원칙</h2><div class="guide-steps"><div><b>01</b><h3>원본은 오너만</h3><p>가져온 BOOK 목록과 비공개 메모는 브라우저의 AES-GCM 암호화 원장에 둡니다. PDF 원본은 자동으로 업로드하지 않습니다.</p></div><div><b>02</b><h3>선택적 게시</h3><p>편집에서 공개용 요약·본문을 확인한 뒤, BOOK마다 '공개 승인'을 눌러야 서버에 전송됩니다.</p></div><div><b>03</b><h3>구독자별 허용</h3><p>Netlify Identity에서 초대받은 계정에 대해 이메일별로 허용 BOOK을 고르고 승인·종료일을 저장합니다.</p></div><div><b>04</b><h3>PDF는 별도 승인</h3><p>게시된 BOOK에 PDF를 명시적으로 업로드해야 다운로드가 가능합니다. 기존 파일은 GitHub에 포함되지 않습니다.</p></div><div><b>05</b><h3>철회와 책임</h3><p>철회 후 새 열람 요청은 서버에서 거부합니다. 이용자가 이전에 저장한 파일을 원격 삭제할 수는 없습니다.</p></div><div><b>06</b><h3>백업과 복구</h3><p>브라우저 삭제와 기기 변경에 대비해 암호화 백업 JSON을 수시로 보관하세요. 비밀번호 분실시 복구할 수 없습니다.</p></div></div></div>`;}
function renderSubscriber(){
  const books=state.remote.books||[];
  app.innerHTML=shellTitle('나에게 승인된 BOOK','오너가 선택한 지식자산만 확인하는 구독자용 독립 서재')+
    `<div class="stats two-stats"><div class="stat"><div>내 열람 가능 BOOK</div><strong>${books.length}</strong><span>서버 권한 검사 적용</span></div><div class="stat"><div>구독 상태</div><strong class="sub-status">${state.remote.status==='approved'?'승인':state.remote.status==='no-books'?'대상 없음':'대기'}</strong><span>만료일 ${state.remote.expiresAt?fmtDate(state.remote.expiresAt):'미지정'}</span></div></div><div class="toolbar"><div><h2>승인된 BOOK 서재</h2><p>오너의 비공개 메모나 다른 구독자의 목록은 제공되지 않습니다.</p></div><div class="actions"><button class="btn outline" id="subscriberExport" ${!books.length?'disabled':''}>허용 목록 JSON</button><button class="btn ghost" id="subscriberReload">새로고침</button></div></div><div class="filter-bar"><label class="search-box"><span>⌕</span><input id="subscriberSearch" placeholder="제목·요약 검색" /></label></div><div id="subscriberRows"></div>`;
  function rows(query=''){const target=$('subscriberRows');const list=books.filter(b=>(b.title+' '+b.summary).toLowerCase().includes(query.toLowerCase()));target.innerHTML=list.length?`<div class="book-grid">${list.map(b=>`<article class="book-card"><div class="book-category">${safeText(CATEGORIES[b.category_code],80)}</div><h3>${safeText(b.title,180)}</h3><p>${safeText(b.summary||'오너가 공개한 요약이 없습니다.',350)}</p><div class="book-footer"><span>${fmtDate(b.document_date)} · ${b.pages_reference||'—'}쪽</span><button class="btn dark small" data-detail="${b.book_id}">자세히 보기</button></div></article>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">▤</div><h3>${books.length?'검색 결과가 없습니다':'아직 승인된 BOOK이 없습니다'}</h3><p>${books.length?'다른 검색어를 입력하세요.':'오너에게 구독 승인과 열람할 BOOK 지정을 요청하세요.'}</p></div>`;
    target.querySelectorAll('[data-detail]').forEach(btn=>btn.onclick=()=>showDetails(books.find(b=>b.book_id===btn.dataset.detail)));
  }rows();
  $('subscriberSearch').oninput=e=>rows(e.target.value);
  $('subscriberReload').onclick=async()=>{try{await refresh();}catch(e){notify(e.message,'error');}};
  $('subscriberExport').onclick=()=>downloadData(JSON.stringify({schema:'GARD-BOOK-SUBSCRIBER-EXPORT',exportedAt:new Date().toISOString(),books:books.map(({file,...book})=>book)},null,2),'GARD_BOOK_APPROVED_LIST.json');
}
function showDetails(b){if(!b)return;const dlg=$('detailModal');
  dlg.innerHTML=`<div class="modal-inner"><div class="modal-top"><div><div class="eyebrow">APPROVED BOOK / ${safeText(b.category_code,2)}</div><h2 id="detailTitle">${safeText(b.title,180)}</h2></div><button class="close-icon" id="closeDetail" aria-label="닫기">×</button></div><p class="book-summary">${safeText(b.summary,1300)||'요약 없음'}</p><div class="detail-meta">${safeText(b.category,90)} · ${fmtDate(b.document_date)} · ${b.pages_reference||0}쪽</div><div class="book-longtext">${escapeHtml(b.description||'구독자용 상세 내용은 아직 게시되지 않았습니다.').replace(/\n/g,'<br>')}</div><div class="modal-buttons"><button id="detailCloseBtn" class="btn outline">닫기</button>${b.file?`<button id="downloadPdfBtn" class="btn dark">PDF 다운로드 · ${fmtBytes(b.file.size)}</button>`:''}</div></div>`;
  dlg.showModal();$('closeDetail').onclick=()=>dlg.close();$('detailCloseBtn').onclick=()=>dlg.close();
  if(b.file)$('downloadPdfBtn').onclick=()=>downloadBookPdf(b);
}
async function downloadBookPdf(b){
  try{
    const response=await fetch('/api/book-file?bookId='+encodeURIComponent(b.book_id),{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error||'PDF 열람권이 없습니다.');}
    downloadData(await response.blob(),b.file?.name||'GARD-BOOK.pdf','application/pdf');
  }catch(err){alert('파일 다운로드 실패: '+err.message);}
}
start();
