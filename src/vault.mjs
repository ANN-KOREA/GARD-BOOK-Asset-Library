// Browser encrypted owner vault: AES-256-GCM + PBKDF2, encrypted bytes persisted only.
const VAULT_KEY='gard-book-vault-v1';
const enc=new TextEncoder(); const dec=new TextDecoder();
const b64 = bytes => {
  const input=new Uint8Array(bytes); let binary='';
  for(let i=0;i<input.length;i+=8192) binary+=String.fromCharCode(...input.subarray(i,i+8192));
  return btoa(binary);
};
const fromB64 = str => Uint8Array.from(atob(str), x => x.charCodeAt(0));

export async function encryptObject(data, passphrase) {
  if(String(passphrase).length<10) throw new Error('보관함 암호는 10자 이상으로 입력하세요.');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(passphrase,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(data)));
  return {format:'GARD-BOOK-ENCRYPTED-VAULT',v:1,salt:b64(salt),iv:b64(iv),data:b64(ciphertext),kdf:'PBKDF2-SHA256',iterations:310000};
}
export async function decryptObject(blob,passphrase) {
  if(blob?.format!=='GARD-BOOK-ENCRYPTED-VAULT'||blob?.v!==1) throw new Error('지원하지 않는 암호화 백업 형식입니다.');
  try {
    const salt=fromB64(blob.salt),iv=fromB64(blob.iv),cipher=fromB64(blob.data);
    const key=await deriveKey(passphrase,salt);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher)));
  } catch { throw new Error('보관함 암호가 틀렸거나 암호화 파일이 손상되었습니다.'); }
}
async function deriveKey(passphrase,salt){
  const base=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function getStoredVault(){
  try {return JSON.parse(localStorage.getItem(VAULT_KEY)??'null');} catch {return null;}
}
export function saveStoredVault(v){localStorage.setItem(VAULT_KEY,JSON.stringify(v));}
export function newVault(){return {schemaVersion:1,books:[],updatedAt:new Date().toISOString(),localEvents:[]};}
export function clearVault(){localStorage.removeItem(VAULT_KEY);}
