// Run after: vite build --ssr tests/render-check.tsx --outDir qa-render --emptyOutDir
// Static semantic rendering only; this is not browser interaction or viewport QA.
import assert from 'node:assert/strict';
import {initialSiteContent} from '../lib/site-defaults.mjs';
import {renderTimetableForCheck,renderFoldedTimetableForCheck,renderReaderLoginForCheck,renderReadListForCheck,renderReadAccessForCheck,renderAdminRemainingForCheck,renderPhotoControlForCheck,renderOpeningFormForCheck,renderCountdownForCheck,renderAdminLoginForCheck,renderAdminSecurityForCheck,renderRecoveryForCheck,renderHomeForCheck,renderEditorForCheck,renderClubAreaForCheck,renderReportForCheck,renderBookingForCheck,renderPenaltyFormForCheck,renderConfirmationForCheck,renderBookingRecordForCheck,renderSemesterForCheck,renderUsageForCheck,renderDataManagerForCheck,renderCatalogForCheck,renderFloorForCheck,renderOfficersForCheck,renderRentalNoticesForCheck,renderDirectoryFiltersForCheck,renderClubProfileForCheck,renderClubProfileFieldsForCheck,renderClubEditorForCheck} from '../qa-render/render-check.js';
const content=initialSiteContent();
const profile={id:'account-1',club:'테스트 동아리',clubId:'own',room:'301',username:'club-test',status:'APPROVED',rentalAccess:true};
let html=renderHomeForCheck(content);
assert.match(html,/<h3>장소대여<\/h3>/);assert.match(html,/<h3>내 동아리 관리<\/h3>/);assert.doesNotMatch(html,/FOR ADMINISTRATORS|일반 동아리 사용자|class="home-announcement"/);
const nav=html.match(/<nav[\s\S]*?<\/nav>/)[0];assert.equal((nav.match(/class="navlink/g)||[]).length,4);assert.match(nav,/내 동아리/);assert.match(nav,/안내/);assert.match(nav,/rental-dropdown/);assert.doesNotMatch(nav,/>로그인<|account-nav/);
html=renderHomeForCheck(content,profile);assert.match(html.match(/<nav[\s\S]*?<\/nav>/)[0],/내 동아리\(club-test\)/);assert.doesNotMatch(html,/대표 계정 관리/);
content.settings.homeNoticeEnabled=true;content.settings.homeNoticeTitle='<script>공지</script>';content.settings.homeNoticeBody='새 공지\n<img src=x onerror=alert(1)>';
html=renderHomeForCheck(content);assert.match(html,/aria-label="첫 화면 공지"/);assert.match(html,/<dialog/);assert.match(html,/확인했습니다/);assert.doesNotMatch(html,/class="home-announcement"/);assert.match(html,/&lt;script&gt;공지/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img src=x/);
content.settings.homeNoticeEnabled=false;assert.doesNotMatch(renderHomeForCheck(content),/새 공지/);
html=renderEditorForCheck(content);assert.match(html,/첫 화면 공지/);assert.match(html,/role="switch"/);assert.match(html,/OFF · 숨김/);assert.match(html,/첫 화면 공지 내용/);assert.match(html,/대여 팝업 공지/);
for(const mode of ['booking','club']){html=renderClubAreaForCheck(content,null,mode);assert.match(html,/동아리 대표 로그인/);assert.doesNotMatch(html,/예약 화면 표시|우리 동아리 활동 현황/)}
html=renderClubAreaForCheck(content,{...profile,status:'PENDING'},'club');assert.match(html,/가입 신청을 접수/);assert.doesNotMatch(html,/우리 동아리 활동 현황|가장 빠른 장소대여 일정/);
html=renderClubAreaForCheck(content,profile,'booking');assert.match(html,/우리 동아리 예약/);assert.match(html,/예약 화면 표시/);
html=renderClubAreaForCheck(content,{...profile,rentalAccess:false},'booking');assert.match(html,/장소 대여 메뉴는 한 명만 입장 가능합니다/);assert.doesNotMatch(html,/예약 화면 표시|class="subtabs account-tabs"/);
html=renderClubAreaForCheck(content,{...profile,rentalAccess:false},'club');assert.match(html,/우리 동아리 활동 현황/);
html=renderClubAreaForCheck(content,profile,'club');assert.match(html,/우리 동아리 활동 현황/);assert.doesNotMatch(html,/예약 화면 표시/);
html=renderClubAreaForCheck(content,profile,'account');assert.match(html,/우리 동아리 활동 현황/);assert.match(html,/계정 변경/);assert.match(html,/로그아웃/);assert.doesNotMatch(html,/대표 계정 관리|위의 계정 변경에서/);
html=renderBookingForCheck(content);assert.doesNotMatch(html,/내 예약 조회·취소|예약한 연락처|예약 확인코드로 조회/);
html=renderReportForCheck({stats:{photo:{points:10,count:1},inspection:{points:7,count:1}},totalPoints:17,bookings:[{id:'R-test',room:'심정실',date:'2030-01-07',start:900,end:1020,status:'APPROVED'},{id:'R-cancelled',room:'창의실',date:'2030-01-08',start:1020,end:1140,status:'CANCELLED'}],bookingsMore:true,serverDate:'2030-01-07',serverMinute:960,penalties:[{id:'p',kind:'inspection',date:'2026-01-02',points:7,content:'<script>청소 미흡</script>'}],more:false});
assert.match(html,/<h2>예약 내역<\/h2>/);assert.doesNotMatch(html,/가장 빠른 장소대여 일정/);assert.match(html,/대여 날짜 · 빠른 순/);assert.match(html,/다음 예약/);assert.match(html,/이전 예약/);assert.match(html,/창의실/);assert.match(html,/취소/);assert.match(html,/현재 이용 중/);assert.match(html,/15:00–17:00/);assert.match(html,/총합 벌점/);assert.doesNotMatch(html,/R-test|R-cancelled|예약번호|확인서|예약 취소<\/button>/);assert.match(html,/-17/);assert.match(html,/&lt;script&gt;청소 미흡/);assert.doesNotMatch(html,/<script>|벌점 기록하기|기록 취소/);
html=renderPenaltyFormForCheck();assert.match(html,/동방점검·사진 벌점 입력/);assert.match(html,/<select name="kind"/);assert.match(html,/value="photo"/);assert.match(html,/사진 미제출/);assert.match(html,/name="points"/);assert.match(html,/name="content"/);
const booking={id:'R-INTERNAL-ONLY',bookingCode:'secret-receipt-code',room:'심정실',date:'2030-01-07',start:900,end:1020,club:'테스트 동아리',representative:'대표자',status:'APPROVED',rentalAccess:true};
html=renderConfirmationForCheck(booking);assert.match(html,/예약이 확정되었습니다/);assert.match(html,/2030-01-07/);assert.match(html,/심정실/);assert.match(html,/15:00–17:00/);assert.doesNotMatch(html,/R-INTERNAL-ONLY|secret-receipt-code|확인서|예약번호|예약 확인코드|<button|<input/);
html=renderBookingRecordForCheck(booking);assert.match(html,/예약 확정/);assert.match(html,/예약 취소/);assert.match(html,/대표자/);assert.doesNotMatch(html,/R-INTERNAL-ONLY|secret-receipt-code|확인서|예약번호/);
for(const status of ['OVERRIDE','CANCELLED']){html=renderBookingRecordForCheck({...booking,status});assert.doesNotMatch(html,/R-INTERNAL-ONLY|확인서|예약번호/);if(status==='CANCELLED')assert.doesNotMatch(html,/예약 취소/);else assert.match(html,/예약 취소/)}
html=renderSemesterForCheck();assert.match(html,/전체 동아리 벌점 초기화/);assert.match(html,/선택 동아리 벌점 초기화/);assert.match(html,/개별 벌점 초기화/);assert.match(html,/학기·처리명/);assert.match(html,/사진 \+ 동방점검/);
html=renderUsageForCheck(null);assert.match(html,/확인 필요/);assert.doesNotMatch(html,/<strong>0/);
html=renderUsageForCheck(480);assert.match(html,/danger/);assert.match(html,/96.0%/);assert.match(html,/<progress/);
html=renderDataManagerForCheck();for(const label of ['용량·사용량','CSV 내보내기','학기 벌점 초기화','이전 기록 정리'])assert.ok(html.includes(label));
console.log('SSR semantic UI checks: data tabs/semester reset controls/unknown and high usage, receipt/code/booking-ID hidden with cancellation retained, four menus and rental dropdown, removed account page, manual photo form, home notice ON/OFF/escaping, editor controls, login/approval gates, booking tabs, duplicate form removal, private club report PASS');

html=renderCatalogForCheck();assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/catalog-entry/);
html=renderFloorForCheck();assert.match(html,/viewBox="0 0 2858.67 547.08"/);assert.match(html,/role="button"/);assert.match(html,/313I·313H/);assert.match(html,/302/);assert.match(html,/317/);assert.doesNotMatch(html,/1029\*|password|phone/);
html=renderOfficersForCheck();for(const label of ['회장 이름','회장 전화번호','부회장 이름','부회장 전화번호','총무 이름','총무 전화번호'])assert.ok(html.includes(label));
html=renderRentalNoticesForCheck(content);for(const label of ['장소대여 팝업 공지','장비대여 팝업 공지','보드게임 대여 팝업 공지','메뉴에 들어갈 때마다 표시'])assert.ok(html.includes(label));
console.log('New SSR checks: four-menu navigation/dropdown, escaped image catalog, proportional combined floorplan/keyboard room controls, six officer fields, separate mandatory rental notices PASS');

html=renderDirectoryFiltersForCheck();for(const label of ['등록 동아리','가입 승인 대기','정식 대표 계정','정동아리','준동아리','신규동아리','공연분과','봉사분과','체육분과','교양/학술 분과'])assert.ok(html.includes(label));assert.equal((html.match(/aria-pressed=/g)||[]).length,10);
html=renderClubProfileForCheck({type:'REGULAR',typeDate:'2026-09-01',division:'CULTURE_ACADEMIC',memberCount:0,advisor:'<script>교수</script>'});for(const label of ['정동아리','상태 기준일','2026-09-01','교양/학술 분과','0명','지도교수'])assert.ok(html.includes(label));assert.match(html,/&lt;script&gt;교수/);assert.doesNotMatch(html,/<script>/);
html=renderClubProfileFieldsForCheck();for(const label of ['동아리 상태','상태 기준일','동아리 분과','회원 수','지도교수 이름'])assert.ok(html.includes(label));assert.match(html,/value="2026-09-01"/);
html=renderOfficersForCheck();for(const label of ['회장 학번','부회장 학번','총무 학번'])assert.ok(html.includes(label));assert.equal((html.match(/pattern="\[0-9\]\{10\}"/g)||[]).length,3);assert.equal((html.match(/inputMode="numeric"/g)||[]).length,3);
console.log('Club profile SSR checks: 10 filter cards/type date/division/member count/advisor/escaped names/three ten-digit officer IDs PASS');

html=renderClubEditorForCheck();assert.match(html,/club-editor-dialog/);assert.match(html,/club-form-body/);assert.match(html,/club-form-actions/);for(const text of ["동아리 정보 저장","취소","회장 학번","지도교수 이름"])assert.ok(html.includes(text));console.log("Club editor semantic checks: modal/input scroll region/fixed actions and existing fields PASS");

html=renderAdminLoginForCheck(content,{initialized:true,canSetup:true,admin:false});assert.match(html,/15분 동안 사용하지/);assert.match(html,/다음: 2차 인증/);assert.doesNotMatch(html,/관리자 추가승인|현 동아리 관리/);
html=renderAdminLoginForCheck(content,{initialized:true,challenge:true,enroll:true,secret:'TESTONLYSECRET2345',uri:'otpauth://totp/TESTONLY'});assert.match(html,/인증앱 등록/);assert.match(html,/인증앱 등록 완료/);assert.match(html,/one-time-code/);assert.match(html,/pattern="\[0-9\]\{6\}"/);assert.match(html,/QR 코드 스캔/);
html=renderAdminLoginForCheck(content,{initialized:true,challenge:true,enroll:false});assert.match(html,/관리자 2차 인증/);assert.doesNotMatch(html,/TESTONLY|인증앱 등록 완료/);
html=renderAdminSecurityForCheck();for(const text of ['인증앱 변경','복구 코드 재발급','현재 관리자 비밀번호','2차 인증 코드','2차 인증 후 계정 수정'])assert.ok(html.includes(text));
html=renderRecoveryForCheck();assert.equal((html.match(/<li>/g)||[]).length,10);assert.match(html,/한 번만/);assert.match(html,/disabled=""/);
assert.match(renderHomeForCheck(content),/© 2026 김주영/);assert.match(renderHomeForCheck(content),/2026.10.14/);
console.log('Security SSR UI checks: MFA login/enrollment/recovery states, current-password + fresh-MFA credential form, one-time recovery acknowledgement and copyright PASS');

html=renderOpeningFormForCheck('scheduled');for(const text of ['시간 지정 자동 오픈','오픈 날짜 (한국시간)','오픈 시·분·초','자동 오픈 설정','현재 예약 목록·예약 상태는 유지'])assert.ok(html.includes(text));assert.match(html,/type="time" step="1"/);assert.match(html,/2026-10-30 12:59:50/);assert.doesNotMatch(html,/선택 날짜 마감<\/button>/);
html=renderOpeningFormForCheck('now');assert.match(html,/선택 날짜 오픈/);assert.match(html,/선택 날짜 마감/);
html=renderCountdownForCheck();assert.match(html,/2026-10-30 13:00:00/);assert.match(html,/00:00:10/);assert.match(html,/서버의 한국시간/);
console.log('Scheduled opening SSR checks: distinct rental period and KST release date/time/seconds, server-clock display, 10-second countdown, existing reservation preservation, immediate controls PASS');

html=renderPhotoControlForCheck(0,0);assert.equal((html.match(/<button/g)||[]).length,1);assert.match(html,/사진 미제출/);assert.match(html,/aria-pressed="false"/);
html=renderPhotoControlForCheck(1,1);assert.equal((html.match(/<button/g)||[]).length,1);assert.match(html,/사진 제출/);assert.match(html,/aria-pressed="true"/);
html=renderPhotoControlForCheck(1,0);assert.match(html,/기존 기록: 입실만 확인됨/);assert.match(html,/aria-pressed="false"/);
html=renderPhotoControlForCheck(0,1);assert.match(html,/기존 기록: 퇴실만 확인됨/);
html=renderPhotoControlForCheck(0,0,'CANCELLED');assert.match(html,/disabled=""/);
console.log('Combined photo SSR checks: exactly one accessible toggle for submitted/unsubmitted/legacy partial states; cancelled reservations disabled PASS');

html=renderFoldedTimetableForCheck();assert.match(html,/aria-expanded="false"/);assert.match(html,/예약 시간표/);assert.doesNotMatch(html,/시간표 날짜|이미지 저장|timetable-grid/);
html=renderTimetableForCheck([{date:'2026-11-02',room:'심정실',start:900,end:1020,status:'APPROVED',club:'<script>동아리</script>',phone:'01012345678'}]);for(const text of ['심정실','진리실','창의실','09:00','21:00'])assert.ok(html.includes(text));assert.match(html,/&lt;script&gt;동아리/);assert.doesNotMatch(html,/<script>|01012345678|phone/);
html=renderReaderLoginForCheck();assert.match(html,/2차 인증은 사용하지/);assert.doesNotMatch(html,/one-time-code|name="code"|예약 취소/);
html=renderReadListForCheck([{date:'2026-11-02',room:'진리실',start:900,end:1020,status:'APPROVED',club:'조회용 동아리',representative:'노출금지',phone:'01012345678',note:'비공개'}]);assert.match(html,/조회용 동아리/);assert.doesNotMatch(html,/노출금지|01012345678|비공개|<button|CSV|취소하기/);
html=renderReadAccessForCheck();assert.match(html,/조회 계정·링크 관리/);assert.match(html,/aria-expanded="false"/);
html=renderAdminRemainingForCheck();assert.match(html,/관리자 로그인 남은 시간/);assert.match(html,/14:59/);
console.log('Reservation access SSR checks: folded daily timetable, escaped club-only blocks, no-MFA reader login, minimal read-only list, owner access panel, authoritative countdown PASS');
