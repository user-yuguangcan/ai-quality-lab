import { DataStore, Evidence, KEY_V02, demoStore, validateStore } from './domain';

const DB_NAME = 'ai-quality-lab-v03';
const DB_VERSION = 1;
const STATE = 'state';
const FILES = 'files';
export const FILE_MAX = 8 * 1024 * 1024;
export const TOTAL_MAX = 30 * 1024 * 1024;
const ACCEPT = new Set(['image/jpeg','image/png','image/webp','image/gif']);
export interface Backup { format: 'AIQL-BACKUP-0.3'|'AIQL-BACKUP-0.4'|'AIQL-BACKUP-0.5'; exportedAt: string; data: DataStore; files: {id:string;mime:string;dataUrl:string;sha256?:string}[] }

function reqValue<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB 请求失败'));});}
function txDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('IndexedDB 事务失败'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB 事务已取消'));});}
export function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined')return reject(new Error('当前环境不支持 IndexedDB'));const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STATE))db.createObjectStore(STATE);if(!db.objectStoreNames.contains(FILES))db.createObjectStore(FILES);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('无法打开本地数据库'));});}
export async function getInitialData():Promise<{data:DataStore;message:string}>{const db=await openDB();try{const tx=db.transaction(STATE,'readonly');const existing=await reqValue(tx.objectStore(STATE).get('main'));if(existing){const wasLegacy=existing.schemaVersion!=='1.2';const migrated=validateStore(existing); if(wasLegacy)await saveData(migrated,db);return {data:migrated,message:'已加载现有工作区，旧版图片与人工评分保持不变'};}
 const old=localStorage.getItem(KEY_V02);const parsed=old?validateStore(JSON.parse(old)):demoStore();await saveData(parsed,db);return {data:parsed,message:old?'已从 V0.2 安全迁移结构化数据（旧版未删除）':'已建立 V0.6.1 本地工作区，加载三个演示案例（未附私人图片）'};
}finally{db.close();}}
export async function saveData(data:DataStore,existing?:IDBDatabase):Promise<void>{const normalized=validateStore(data);const db=existing||await openDB();try{const tx=db.transaction(STATE,'readwrite');const done=txDone(tx);tx.objectStore(STATE).put(normalized,'main');await done;}finally{if(!existing)db.close();}}
export async function saveWithEvidence(data:DataStore,meta:Evidence,file:Blob):Promise<void>{validateImage(file);if(!data.evidence.some(x=>x.id===meta.id))throw Error('附件元信息未加入工作区');validateStore(data);const db=await openDB();try{const tx=db.transaction([STATE,FILES],'readwrite');const done=txDone(tx);tx.objectStore(FILES).put(file,meta.id);tx.objectStore(STATE).put(data,'main');await done;}finally{db.close();}}
export async function getEvidenceBlob(id:string):Promise<Blob|undefined>{const db=await openDB();try{const tx=db.transaction(FILES,'readonly');return await reqValue(tx.objectStore(FILES).get(id));}finally{db.close();}}
export async function removeEvidence(data:DataStore,id:string):Promise<void>{validateStore(data);const db=await openDB();try{const tx=db.transaction([STATE,FILES],'readwrite');const done=txDone(tx);tx.objectStore(FILES).delete(id);tx.objectStore(STATE).put(data,'main');await done;}finally{db.close();}}
export function validateImage(blob:Blob){if(!ACCEPT.has(blob.type))throw Error('只支持 PNG / JPEG / WebP / GIF 图片');if(!blob.size||blob.size>FILE_MAX)throw Error('单张图片必须小于 8MB');}
function asDataURL(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('文件读取失败'));r.readAsDataURL(blob);});}
function fromDataURL(value:string):Blob{const m=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!m)throw Error('附件数据不是支持的图片格式');const binary=atob(m[2]);if(binary.length>FILE_MAX)throw Error('备份中的附件超出大小限制');const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const blob=new Blob([bytes],{type:m[1]});validateImage(blob);return blob;}
/** SHA-256 implementation for offline file:// usage when SubtleCrypto is unavailable. */
export function sha256Bytes(message:Uint8Array):string{
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const len=message.length,total=Math.ceil((len+9)/64)*64;
 const padded=new Uint8Array(total);padded.set(message);padded[len]=0x80;
 const dv=new DataView(padded.buffer);dv.setUint32(total-8,Math.floor((len*8)/4294967296));dv.setUint32(total-4,(len*8)>>>0);
 const w=new Uint32Array(64);const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
 for(let offset=0;offset<total;offset+=64){
  for(let j=0;j<16;j++)w[j]=dv.getUint32(offset+j*4);
  for(let j=16;j<64;j++){const a=w[j-15],b=w[j-2];const s0=rotr(a,7)^rotr(a,18)^(a>>>3),s1=rotr(b,17)^rotr(b,19)^(b>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;}
  let [a,b,c,d,e,f,g,v]=h;
  for(let j=0;j<64;j++){const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(v+s1+ch+k[j]+w[j])>>>0;const s0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;v=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  const cur=[a,b,c,d,e,f,g,v];for(let j=0;j<8;j++)h[j]=(h[j]+cur[j])>>>0;
 }
 return h.map(x=>x.toString(16).padStart(8,'0')).join('');
}
export async function hashBlob(blob:Blob):Promise<string>{
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(typeof crypto!=='undefined'&&crypto.subtle){
  const result=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(result)).map(v=>v.toString(16).padStart(2,'0')).join('');
 }
 return sha256Bytes(bytes);
}
export interface AuditResult {ok:boolean;checkedFiles:number;totalBytes:number;issues:string[];checkedAt:string}
export async function auditWorkspace(data:DataStore):Promise<AuditResult>{
 const issues:string[]=[];let checkedFiles=0,totalBytes=0;
 try{validateStore(data);}catch(err){issues.push('结构化数据检查失败：'+String(err));}
 for(const meta of data.evidence){
   try{const blob=await getEvidenceBlob(meta.id);
     if(!blob){issues.push('缺失附件：'+meta.fileName);continue;}
     checkedFiles++;totalBytes+=blob.size;
     if(blob.type!==meta.mime||blob.size!==meta.size)issues.push('附件格式或大小不一致：'+meta.fileName);
   }catch(err){issues.push('无法读取附件 '+meta.fileName+'：'+String(err));}
 }
 return {ok:issues.length===0,checkedFiles,totalBytes,issues,checkedAt:new Date().toISOString()};
}
export async function exportFullBackup(data:DataStore):Promise<Backup>{
 validateStore(data);
 const files:Backup['files']=[];
 for(const meta of data.evidence){
   const blob=await getEvidenceBlob(meta.id);
   if(!blob)throw Error('附件缺失：'+meta.fileName+'；为了避免不完整备份，已停止导出');
   if(blob.type!==meta.mime||blob.size!==meta.size)throw Error('附件实际文件与元数据不一致：'+meta.fileName);
   files.push({id:meta.id,mime:blob.type,dataUrl:await asDataURL(blob),sha256:await hashBlob(blob)});
 }
 return {format:'AIQL-BACKUP-0.5',exportedAt:new Date().toISOString(),data,files};
}
export async function importFullBackup(raw:unknown):Promise<DataStore>{
 if(!raw||typeof raw!=='object'||!['AIQL-BACKUP-0.3','AIQL-BACKUP-0.4','AIQL-BACKUP-0.5'].includes((raw as any).format))throw Error('不是有效的 V0.3 / V0.4 / V0.5 完整备份');
 const source=raw as Backup;
 const data=validateStore(source.data);
 if(!Array.isArray(source.files)||source.files.length!==data.evidence.length)throw Error('备份附件数量与记录不一致');
 const files=new Map<string,Blob>();let total=0;
 for(const f of source.files){
   if(!f||typeof f.id!=='string'||files.has(f.id))throw Error('附件编号无效或重复');
   const meta=data.evidence.find(x=>x.id===f.id);
   if(!meta)throw Error('备份存在未关联的附件');
   const blob=fromDataURL(f.dataUrl);
   if(blob.type!==meta.mime||blob.size!==meta.size||blob.type!==f.mime)throw Error('附件格式或大小不一致：'+meta.fileName);
   if(source.format==='AIQL-BACKUP-0.5'){
     if(typeof f.sha256!=='string'||!/^[0-9a-f]{64}$/.test(f.sha256)||await hashBlob(blob)!==f.sha256)throw Error('附件 SHA-256 完整性校验失败：'+meta.fileName);
   }
   total+=blob.size;if(total>TOTAL_MAX)throw Error('附件总量超过 30MB');
   files.set(f.id,blob);
 }
 // Only open a write transaction after every file and hash has passed.
 const db=await openDB();
 try{const tx=db.transaction([STATE,FILES],'readwrite');const done=txDone(tx);const fs=tx.objectStore(FILES);fs.clear();for(const [id,blob] of files)fs.put(blob,id);tx.objectStore(STATE).put(data,'main');await done;return data;}finally{db.close();}
}
export async function replaceDataWithoutFiles(data:DataStore):Promise<void>{validateStore(data);if(data.evidence.length)throw Error('此路径只接收不含附件的旧数据');const db=await openDB();try{const tx=db.transaction([STATE,FILES],'readwrite');const done=txDone(tx);tx.objectStore(FILES).clear();tx.objectStore(STATE).put(data,'main');await done;}finally{db.close();}}
