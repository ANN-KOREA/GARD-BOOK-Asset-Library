import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionRequest } from '../shared/deployment.mjs';

const env={ URL: 'https://spectacular-manatee-b76f72.netlify.app' };
const request=(url)=>({url});

test('Netlify 기본 운영 주소의 HTTPS 요청은 허용한다',()=>{
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/library'),env),true);
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/book-file?bookId=GARD-BOOK-001'),env),true);
});
test('CONTEXT가 Functions 런타임에서 undefined여도 운영 주소는 허용한다',()=>{
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/library'),{...env,CONTEXT:undefined}),true);
});
test('Deploy Preview, branch deploy, 다른 사이트 주소는 차단한다',()=>{
  for(const url of [
    'https://deploy-preview-12--spectacular-manatee-b76f72.netlify.app/api/library',
    'https://testing--spectacular-manatee-b76f72.netlify.app/api/library',
    'https://malicious.example.net/api/library',
    'https://spectacular-manatee-b76f72.netlify.app.evil.example/api/library'
  ]) assert.equal(isProductionRequest(request(url),env),false,url);
});
test('HTTP 또는 환경변수 URL 누락 시 차단한다',()=>{
  assert.equal(isProductionRequest(request('http://spectacular-manatee-b76f72.netlify.app/api/library'),env),false);
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/library'),{}),false);
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/library'),{URL:'INVALID'}),false);
});
test('URL에 custom domain이 설정되어도 exact HTTPS origin 비교를 유지한다',()=>{
  assert.equal(isProductionRequest(request('https://book.gard.example/api/library'),{URL:'https://book.gard.example'}),true);
  assert.equal(isProductionRequest(request('https://spectacular-manatee-b76f72.netlify.app/api/library'),{URL:'https://book.gard.example'}),false);
});
