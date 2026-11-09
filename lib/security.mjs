const encoder = new TextEncoder();
// Bounded cache of server AES keys; never retain passwords or decrypted data.
const aesKeys = new Map();
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const unhex = s => new Uint8Array(s.match(/.{2}/g).map(v => parseInt(v, 16)));
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async s => hex(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Workers WebCrypto caps a PBKDF2 invocation at 100,000 iterations.
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2', salt:unhex(salt), iterations:100000, hash:'SHA-256'}, key, 256));
}
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', unhex(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
export async function crypt(value, secret, decrypt = false) {
  if (!/^[a-f0-9]{64}$/.test(secret || '')) throw new Error('보안 설정을 확인해주세요.');
  if (!aesKeys.has(secret)) {
    aesKeys.set(secret, crypto.subtle.importKey('raw', unhex(secret), 'AES-GCM', false, ['encrypt','decrypt']));
    if (aesKeys.size > 8) aesKeys.delete(aesKeys.keys().next().value);
  }
  const key = await aesKeys.get(secret);
  if (!value) return '';
  if (decrypt) {
    const [iv, data] = value.split('.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unhex(iv)}, key, unhex(data)));
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return hex(iv) + '.' + hex(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, encoder.encode(value)));
}
export const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers}});
export const failure = (message, status = 400, scope) => Object.assign(new Error(message), {status, scope});
