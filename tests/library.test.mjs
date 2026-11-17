import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CATEGORIES,EMPTY_SERVER_STATE,sanitizeImportedRecords,publishedBook,subscriberVisibleBooks,canReadBook,mutateServerState} from '../shared/policy.mjs';
import {encryptObject,decryptObject} from '../src/vault.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const candidatePath='/mnt/data/GARD_BOOK_Discovery_Catalog_20261117.json';
const sample={book_id:'GARD-BOOK-001',title:'공동 생성 BOOK 검증',category_code:'D',document_date:'2026-11-17',pages_reference:150,summary:'허용된 요약',description:'허용된 본문',source_filename:'PRIVATE_SECRET.pdf',private_note:'이것은 오너 영업비밀',cloudSecret:'SECRET_KEY',originalText:'전체 영업비밀 문서'};

test('서버 게시 허용목록은 모든 비공개 필드를 차단한다',()=>{
 const v=publishedBook(sample),raw=JSON.stringify(v);
 assert.equal(v.title,sample.title);
 for(const secret of ['PRIVATE_SECRET','영업비밀','SECRET_KEY','originalText','source_filename','private_note'])assert.equal(raw.includes(secret),false);
 assert.ok(Object.keys(v).length<12);
});
test('유효하지 않은 분류와 BOOK ID는 게시를 거부한다',()=>{
 assert.throws(()=>publishedBook({...sample,category_code:'X'}));
 assert.throws(()=>publishedBook({...sample,book_id:'../../etc/passwd'}));
 assert.throws(()=>publishedBook({...sample,title:''}));
});
test('가져오기 정규화는 공개 승인을 자동으로 켜지 않는다',()=>{
 const imported=sanitizeImportedRecords({books:[sample]});
 assert.equal(imported.length,1);
 assert.equal(imported[0].owner_approved_public_fields,false);
 assert.equal(imported[0].private_note,sample.private_note);
});
test('미승인, 타 계정, 만료, 철회는 BOOK을 볼 수 없다',()=>{
 let s=EMPTY_SERVER_STATE();
 s=mutateServerState(s,'publish',{book:sample},'owner@example.com');
 assert.deepEqual(subscriberVisibleBooks(s,'not-approved@example.com'),[]);
 assert.equal(canReadBook(s,'not-approved@example.com',false,sample.book_id),false);
 s=mutateServerState(s,'approve',{email:' Alice@Example.com ',bookIds:[sample.book_id]},'owner@example.com');
 assert.equal(subscriberVisibleBooks(s,'alice@example.com').length,1);
 assert.equal(subscriberVisibleBooks(s,'bob@example.com').length,0);
 assert.equal(canReadBook(s,'alice@example.com',false,sample.book_id),true);
 s=mutateServerState(s,'revoke',{email:'alice@example.com'},'owner@example.com');
 assert.equal(canReadBook(s,'alice@example.com',false,sample.book_id),false);
});
test('구독 범위를 지정하지 않은 계정은 다른 BOOK을 볼 수 없다',()=>{
 let s=EMPTY_SERVER_STATE();
 s=mutateServerState(s,'publish',{book:sample},'owner@example.com');
 s=mutateServerState(s,'publish',{book:{...sample,book_id:'GARD-BOOK-002',title:'다른 책'}},'owner@example.com');
 s=mutateServerState(s,'approve',{email:'subscriber@example.com',bookIds:[sample.book_id]},'owner@example.com');
 assert.deepEqual(subscriberVisibleBooks(s,'subscriber@example.com').map(x=>x.book_id),[sample.book_id]);
 assert.equal(canReadBook(s,'subscriber@example.com',false,'GARD-BOOK-002'),false);
});
test('게시 철회는 구독자 허용 리스트에서도 BOOK을 제거한다',()=>{
 let s=EMPTY_SERVER_STATE();
 s=mutateServerState(s,'publish',{book:sample},'owner@example.com');
 s=mutateServerState(s,'approve',{email:'subscriber@example.com',bookIds:[sample.book_id]},'owner@example.com');
 s=mutateServerState(s,'unpublish',{bookId:sample.book_id},'owner@example.com');
 assert.equal(Object.keys(s.books).length,0);
 assert.deepEqual(s.subscribers['subscriber@example.com'].bookIds,[]);
 s=mutateServerState(s,'publish',{book:sample},'owner@example.com');
 assert.equal(subscriberVisibleBooks(s,'subscriber@example.com').length,0);
});
test('구독 만료 후 열람이 차단된다',()=>{
 let s=EMPTY_SERVER_STATE(); s=mutateServerState(s,'publish',{book:sample},'owner@example.com');
 s=mutateServerState(s,'approve',{email:'x@example.com',bookIds:[sample.book_id],expiresAt:'2026-11-20T00:00:00Z'},'owner@example.com');
 assert.equal(subscriberVisibleBooks(s,'x@example.com',new Date('2026-11-19').getTime()).length,1);
 assert.equal(subscriberVisibleBooks(s,'x@example.com',new Date('2026-11-21').getTime()).length,0);
});
test('AES-GCM 암호화 원장은 암호 없이는 BOOK 본문이 노출되지 않는다',async()=>{
 const vault={books:[{...sample}]};
 const encrypted=await encryptObject(vault,'Very-strong-password-123');
 assert.equal(JSON.stringify(encrypted).includes('영업비밀'),false);
 assert.deepEqual(await decryptObject(encrypted,'Very-strong-password-123'),vault);
 await assert.rejects(()=>decryptObject(encrypted,'wrong-secret'));
});
test('파일과 함께 게시한 JSON은 웹 루트에 없는 별도 오너 파일이다',()=>{
 const index=readFileSync(path.join(root,'index.html'),'utf-8');
 assert.equal(index.includes('GARD-BOOK-001'),false);
 assert.equal(index.includes('농인의 민주공화정'),false);
 assert.equal(Object.keys(CATEGORIES).length,7);
});

test('이전 대화의 원본 33종을 실데이터로 가져오는 경우 자동 공개는 발생하지 않는다',(t)=>{
 if(!existsSync(candidatePath))t.skip('비공개 JSON은 GitHub 배포본에 포함되지 않습니다.');
 const f=JSON.parse(readFileSync(candidatePath,'utf-8'));
 const data=sanitizeImportedRecords(f);
 assert.equal(data.length,33);
 assert.ok(data.every(x=>!x.owner_approved_public_fields));
 assert.ok(data.some(x=>x.title==='농인의 민주공화정'));
});
