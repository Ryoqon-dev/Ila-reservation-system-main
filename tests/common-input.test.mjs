import test from 'node:test';
import assert from 'node:assert/strict';
import * as common from '../lib/common/input.mjs';
import {credentials} from '../lib/modules/accounts/credentials.mjs';
import * as legacy from '../lib/rules.mjs';

test('shared input validation preserves the existing rules contract',()=>{
  for(const name of ['assert','normalizedName','field','phoneValue','csvCell']) assert.equal(legacy[name],common[name]);
  assert.equal(common.normalizedName(' Ａ B '),'ab');
  assert.equal(common.field(' value ','항목'),'value');
  assert.throws(()=>common.phoneValue('010-1234-5678'),/전화번호/);
  assert.equal(legacy.credentials,credentials);
  assert.deepEqual(credentials('user.name','0123456789'),{username:'user.name',password:'0123456789'});
  assert.throws(()=>credentials('x','short'),/아이디/);
  assert.equal(common.csvCell('=SUM(1,2)'),`"'=SUM(1,2)"`);
  assert.equal(common.csvCell('a"b'),'"a""b"');
});
