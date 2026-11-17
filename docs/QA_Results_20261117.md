# GARD BOOK Asset Library — 실제 작업 결과 및 미검증 사항

- 작업일: 2026-11-17
- 확인된 입력: 사용자가 이전 대화에서 공동 생성한 33종 BOOK 원장 `GARD_BOOK_Discovery_Catalog_20261117.json`
- 방법: 정적 웹 UI + Netlify Identity 서버인증 + Functions 서버측 승인 검사 + Blobs 선택 게시 + 오너 브라우저 AES-256-GCM 암호화

## 성공한 검증
- `node --check src/app.js` 및 Netlify Function 2개: 구문 오류 없음
- `node --test tests/library.test.mjs`: 10/10 통과. 33종 실데이터 로컬 가져오기 정규화도 시험함
- 기존 33종 JSON을 임포트해도 공개 승인이 자동 활성화되지 않음
- '공개 승인' 전송 허용필드에서 비공개 메모, 원본 파일명, 원고 전체 내용 제외
- 권한 없는 이메일과 철회된 구독자, 만료 계정, 미허용 BOOK의 열람 차단을 순수 로직 시험으로 확인
- 암호화 테스트: AES-256-GCM 복호화 성공, 잘못된 암호 거부
- 대표 정적 화면 두 개(오너·구독자)를 Chromium `set_content`로 렌더링해 레이아웃 확인

## 미검증 — 설치 전·실서비스 인증 및 서버 연결
- `npm install` 및 실제 Vite 번들 빌드: 현재 실행 환경에서 npm 레지스트리 연결 불가 / 오프라인 캐시 없음
- Chromium의 localhost/http 및 외부 URL 페이지 이동이 관리자 정책으로 차단되어 전체 JS 브라우저-API 흐름 E2E 미검증
- 실제 Netlify Identity 초대 메일, 비밀번호 설정, 세션 쿠키 발급
- 실제 Netlify Functions + Blobs 데이터 저장, PDF 업로드/다운로드
- 실서비스 GitHub/Netlify 배포와 타 사용자 계정 간 승인/철회 시험

## 사용자에게 안내할 내용
- 이 ZIP은 **소스 패키지 + 단위시험 완료판**입니다. 단위시험이 Netlify 실서비스의 완전 검증을 의미하지 않습니다.
- 첫 Netlify 배포 뒤 README 단계대로 `GARD_OWNER_EMAIL`, Invite-only Identity, 오너 승인, 구독자 2계정 테스트를 완료해야 실제 운영 가능 여부가 확인됩니다.
- 원고 PDF는 승인 전 서버에 업로드되지 않으며, GitHub ZIP에 포함되어 있지 않습니다.
