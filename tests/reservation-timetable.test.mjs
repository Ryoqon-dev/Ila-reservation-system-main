import test from 'node:test';
import assert from 'node:assert/strict';
import {timetableModel,timetableSummary,remainingSession,TABLE_START,TABLE_END} from '../lib/reservation-timetable.mjs';
const date='2026-11-02';
const row=patch=>({date,room:'심정실',club:'확인 동아리',start:900,end:1020,status:'APPROVED',phone:'01012345678',representative:'비공개 담당자',note:'비공개 메모',...patch});
test('timetable shows real interval boundaries, all three rooms, merged multi-slot reservations and only club names in each block',()=>{
 const model=timetableModel([row({start:600,end:720}),row({room:'진리실',start:900,end:1140,status:'OVERRIDE'})],date);assert.equal(TABLE_START,540);assert.equal(TABLE_END,1260);assert.deepEqual(model.rooms,['심정실','진리실','창의실']);assert.deepEqual(model.bookings,[{room:'심정실',club:'확인 동아리',start:600,end:720},{room:'진리실',club:'확인 동아리',start:900,end:1140}]);assert.doesNotMatch(JSON.stringify(model),/phone|representative|note|01012345678|비공개/);
});
test('timetable excludes cancellations, deleted rows, other dates and unauthorized rooms without mutating reservation records',()=>{
 const rows=[row({}),row({status:'CANCELLED'}),row({status:'DELETED'}),row({date:'2026-11-03'}),row({room:'진리실'})],before=structuredClone(rows);const model=timetableModel(rows,date,['심정실']);assert.equal(model.bookings.length,1);assert.deepEqual(model.rooms,['심정실']);assert.deepEqual(rows,before);
});
test('empty dates have an empty grid and malformed or outside-hours records cannot create invalid drawing coordinates',()=>{
 assert.deepEqual(timetableModel([],date).bookings,[]);const model=timetableModel([row({start:NaN}),row({end:900}),row({start:1260,end:1320}),row({start:500,end:600})],date);assert.deepEqual(model.bookings,[{room:'심정실',club:'확인 동아리',start:540,end:600}]);
});
test('long or markup-like club names remain plain strings for escaped DOM and canvas rendering',()=>{
 const model=timetableModel([row({club:'<img src=x onerror=alert(1)> 긴 동아리 이름'})],date);assert.equal(model.bookings[0].club,'<img src=x onerror=alert(1)> 긴 동아리 이름');assert.match(timetableSummary(model),/심정실 15:00~17:00/);
});
test('main administrator countdown respects server-derived remaining time, rounds seconds and clamps expiry',()=>{
 assert.equal(remainingSession(900000,0),'15:00');assert.equal(remainingSession(900000,1001),'14:59');assert.equal(remainingSession(900000,899999),'00:01');assert.equal(remainingSession(900000,900000),'00:00');assert.equal(remainingSession(900000,910000),'00:00');
});
