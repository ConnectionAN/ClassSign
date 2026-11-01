import test from 'node:test';import assert from 'node:assert/strict';
import {billingStudentSuggestions,matchesStudentKeyword} from '../src/billingStudentSearch.ts';
test('billing suggestions match names at any position, preserve input order and identify duplicate names by id',()=>{
 const students=[{id:'a',name:'李王明',active:1},{id:'b',name:'王小安',active:1},{id:'c',name:'林小王',active:1},{id:'d',name:'王小安',active:1},{id:'e',name:'林小安',active:1}];
 assert.deepEqual(billingStudentSuggestions(students,[],' 王 ').map(s=>s.id),['a','b','c','d']);
 assert.deepEqual(billingStudentSuggestions(students,[],'   '),[]);assert.deepEqual(billingStudentSuggestions(students,[],'不存在'),[]);
 assert.equal(matchesStudentKeyword('alice','ＡＬＩＣＥ Wang'),true);
 assert.equal(matchesStudentKeyword('王','歷史姓名','王小安'),true);
 assert.deepEqual(billingStudentSuggestions(students,[{student:'old',student_name:'歷史王同學'},{student:'old',student_name:'歷史王同學'}],'王').map(s=>s.id),['a','b','c','d','old']);
 assert.equal(students.length,5);
});
