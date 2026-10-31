import test from 'node:test';import assert from 'node:assert/strict';
import {studentOrder} from '../src/studentOrder.ts';
test('folders follow Monday to Sunday and fixed time; edits and future effective slots change ordering',()=>{
 const students=['sun','late','early','none'].map(id=>({id,name:id}));
 const slot=(student,weekday,minute,starts='2026-01-01',ends=null)=>({student,weekday,minute,starts,ends});
 const slots=[slot('sun',7,480),slot('late',1,600),slot('early',1,540),slot('none',1,0,'2026-01-01','2026-02-01')];
 assert.deepEqual(studentOrder(students,slots,'2026-10-31').map(s=>s.id),['early','late','sun','none']);
 slots[2].ends='2026-11-01';slots.push(slot('early',6,600,'2026-11-02'));
 assert.deepEqual(studentOrder(students,slots,'2026-10-31').map(s=>s.id),['early','late','sun','none']);
 assert.deepEqual(studentOrder(students,slots,'2026-11-02').map(s=>s.id),['late','early','sun','none']);
});
