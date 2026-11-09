import {assert} from '../../common/input.mjs';
export function credentials(username,password){assert(typeof username==='string'&&/^[a-zA-Z0-9_.-]{4,40}$/.test(username),'아이디는 영문·숫자·._- 4~40자로 입력하세요.');assert(typeof password==='string'&&password.length>=10&&password.length<=128,'비밀번호는 10~128자로 입력하세요.');return{username,password}}
