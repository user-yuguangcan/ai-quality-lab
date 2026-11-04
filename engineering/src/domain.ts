/** AI Quality Lab domain model. No browser or framework dependencies. */
export type Modality = 'image' | 'text' | 'audio' | 'video' | 'mixed';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'investigating' | 'ready_for_retest' | 'resolved' | 'wont_fix';
export interface TestCase { id: string; title: string; modality: Modality; objective: string; expected: string; criteria: string; inputText?: string; tags?: string[]; createdAt: string; updatedAt?: string }
export interface Run { id: string; testCaseId: string; tool: string; runAt: string; prompt?: string; promptVersion?: string; outputDescription: string; inputEvidenceIds?: string[]; resultEvidenceIds?: string[] }
export interface Issue { id: string; runId: string; title: string; category: string; severity: Severity; status: IssueStatus; expected: string; actual: string; reproSteps?: string; suggestion?: string; evidenceIds?: string[]; createdAt: string; updatedAt?: string }
export type ClosureReason = 'fixed' | 'not_reproduced' | 'not_a_bug';
export interface Retest { id: string; issueId: string; runId: string; verdict: 'pass' | 'fail' | 'inconclusive'; performedAt: string; notes: string; resolution?: ClosureReason }
export const closureLabels:Record<ClosureReason,string>={fixed:'已修复并验证',not_reproduced:'未能复现',not_a_bug:'确认非程序缺陷'};
export function retestSummary(r:Retest):string { return r.verdict==='pass'?(r.resolution?closureLabels[r.resolution]:'通过（旧记录未细分原因）'):r.verdict==='fail'?'复测失败':'无法判断'; }
export function latestRetestForIssue(data:DataStore,id:string):Retest|undefined {return data.retests.filter(r=>r.issueId===id).sort((a,b)=>b.performedAt.localeCompare(a.performedAt))[0];}
export interface Evidence {id:string;runId:string;issueId?:string;role:'input'|'output'|'issue'|'retest';fileName:string;mime:string;size:number;note:string;createdAt:string}
export interface RatingDimension { id: string; label: string; guidance: string; weight: number; active: boolean }
export interface RatingItem { dimensionId: string; label: string; guidance: string; weight: number; score: number; rationale: string }
export interface Scorecard { id: string; runId: string; evaluator: string; evaluatedAt: string; summary: string; ratings: RatingItem[] }
export const DEFAULT_RUBRIC:RatingDimension[] = [
 {id:'goal',label:'任务达成',guidance:'输出是否达到测试用例的目标与验收标准',weight:35,active:true},
 {id:'instruction',label:'指令遵循',guidance:'是否忠实执行输入指令，没有额外修改',weight:25,active:true},
 {id:'fidelity',label:'信息与原内容保真',guidance:'事实、人物、纹理或原有内容是否正确保留',weight:25,active:true},
 {id:'presentation',label:'细节与呈现质量',guidance:'局部瑕疵、格式、易读性或视觉质量',weight:15,active:true}
];
export interface Event { id: string; entityType: 'testCase' | 'run' | 'issue' | 'retest'; entityId: string; action: string; occurredAt: string; details?: string }
export interface DataStore { schemaVersion: '1.2'; evidence:Evidence[]; testCases: TestCase[]; runs: Run[]; issues: Issue[]; retests: Retest[]; events: Event[]; rubric:RatingDimension[]; scorecards:Scorecard[] }
export interface LegacyCase { id?: string; title?: string; tool?: string; type?: string; priority?: string; status?: string; expected?: string; actual?: string; steps?: string; action?: string; evidence?: string }
export const KEY_V01='ai-quality-lab-mvp-0.1';
export const KEY_V02='ai-quality-lab-v0.2';
const DAY='2026-11-02T00:00:00.000Z';
export const newStore = (): DataStore => ({schemaVersion:'1.2',evidence:[],testCases:[],runs:[],issues:[],retests:[],events:[],rubric:DEFAULT_RUBRIC.map(x=>({...x})),scorecards:[]});
export function makeId(prefix: string): string { return prefix+'-'+(Date.now().toString(36))+'-'+Math.random().toString(36).slice(2,8); }
export function severityFromPriority(x: string|undefined): Severity { return x==='P0'?'critical':x==='P1'?'high':x==='P2'?'medium':'low'; }
export function statusFromLegacy(x: string|undefined): IssueStatus {return x==='处理中'?'investigating':x==='已完成'?'ready_for_retest':x==='已记录'?'open':'open';}
export function migrateLegacyCases(source: LegacyCase[]): DataStore {
 if(!Array.isArray(source)) throw new Error('旧版 cases 不是数组');
 const store=newStore();
 source.forEach((c,i)=>{
  if(!c || typeof c!=='object') throw new Error(`旧记录 ${i+1} 格式无效`);
  const id=(typeof c.id==='string'&&c.id.trim())?c.id.trim():`BC-${String(i+1).padStart(3,'0')}`;
  if(!c.title||!c.expected||!c.actual) throw new Error(`旧记录 ${id} 缺少标题、预期或实际结果`);
  const suffix = `${String(i+1).padStart(3,'0')}-${id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,24)}`;
  const tc: TestCase={id:'TC-MIG-'+suffix,title:c.title,modality:(/图片|外套|刘海|脸|皮肤|面部|纹理/.test([c.title,c.type].join(''))?'image':'text'),objective:'核查 '+c.title,expected:c.expected,criteria:'人工检查输出与预期的差异；记录证据并执行复测',createdAt:DAY};
  const run:Run={id:'RUN-MIG-'+suffix,testCaseId:tc.id,tool:c.tool||'未记录',runAt:DAY,promptVersion:'legacy-v0.1',outputDescription:c.actual};
  const issue:Issue={id:'ISS-MIG-'+suffix,runId:run.id,title:c.title,category:c.type||'其他',severity:severityFromPriority(c.priority),status:statusFromLegacy(c.status),expected:c.expected,actual:c.actual,reproSteps:c.steps||'',suggestion:c.action||'',createdAt:DAY};
  if(c.evidence) issue.suggestion=[issue.suggestion,`历史证据备注：${c.evidence}`].filter(Boolean).join('\n');
  store.testCases.push(tc);store.runs.push(run);store.issues.push(issue);
  store.events.push({id:'EV-MIG-'+suffix,entityType:'issue',entityId:issue.id,action:'migrated_from_v0.1',occurredAt:DAY,details:`来源编号：${id}；原状态：${c.status||'未知'}（如旧版“已完成”，仅映射为待复测，不虚构验证通过）`});
 });
 return store;
}
export function migrateLegacyExport(value: unknown): DataStore {
 if(Array.isArray(value)) return migrateLegacyCases(value as LegacyCase[]);
 if(value && typeof value==='object'&&Array.isArray((value as any).cases)) return migrateLegacyCases((value as any).cases);
 throw new Error('不是有效的 V0.1 JSON（需要 cases 数组）');
}
export function validateStore(input: unknown): DataStore {
 if(!input||typeof input!=='object') throw new Error('数据必须为对象');
 const a = input as any;
 if(!['1.0','1.1','1.2'].includes(a.schemaVersion)) throw new Error('不支持的数据版本：'+String(a.schemaVersion));
 if(a.schemaVersion==='1.0'){a.schemaVersion='1.1';a.evidence=[];}
 if(a.schemaVersion==='1.1'){a.schemaVersion='1.2';a.rubric=DEFAULT_RUBRIC.map((x:RatingDimension)=>({...x}));a.scorecards=[];}
 if(!Array.isArray(a.rubric)||!Array.isArray(a.scorecards))throw new Error('评分结构无效');
 if(!Array.isArray(a.evidence)) throw new Error('附件元信息无效');
 for(const key of ['testCases','runs','issues','retests','events']) if(!Array.isArray(a[key])) throw new Error(`缺少数据表 ${key}`);
 const requireStrings=(arr:any[], fields:string[],label:string)=>{ const ids=new Set<string>(); arr.forEach((z,i)=>{if(!z||typeof z!=='object')throw new Error(`${label} 第${i+1}项无效`); for(const k of fields) if(typeof z[k]!=='string'||!z[k].trim()) throw new Error(`${label} 第${i+1}项缺少 ${k}`); if(ids.has(z.id)) throw new Error(`${label} 重复编号 ${z.id}`);ids.add(z.id);});return ids;};
 const tcIds=requireStrings(a.testCases,['id','title','modality','objective','expected','criteria','createdAt'],'测试用例');
 const runIds=requireStrings(a.runs,['id','testCaseId','tool','runAt','outputDescription'],'执行记录');
 const issueIds=requireStrings(a.issues,['id','runId','title','category','severity','status','expected','actual','createdAt'],'异常问题');
 requireStrings(a.retests,['id','issueId','runId','verdict','performedAt','notes'],'复测记录');
 requireStrings(a.evidence,['id','runId','role','fileName','mime','createdAt'],'图片证据');
 requireStrings(a.events,['id','entityType','entityId','action','occurredAt'],'事件');
 validateRubric(a.rubric);
 requireStrings(a.scorecards,['id','runId','evaluator','evaluatedAt','summary'],'人工评分');
 for(const c of a.scorecards){
   if(!runIds.has(c.runId))throw new Error('评分关联的执行记录不存在');
   if(!Array.isArray(c.ratings)||!c.ratings.length)throw new Error('评分明细不可为空');
   const ratedIds=new Set<string>();
   for(const item of c.ratings){
     if(typeof item.dimensionId!=='string'||!item.dimensionId.trim()||ratedIds.has(item.dimensionId))throw new Error('评分维度编号无效或重复');ratedIds.add(item.dimensionId);
     if(typeof item.label!=='string'||!item.label.trim()||typeof item.guidance!=='string'||typeof item.rationale!=='string'||!item.rationale.trim())throw new Error('每项评分需包含维度名称和判断依据');
     if(!Number.isInteger(item.score)||item.score<1||item.score>5||!Number.isFinite(item.weight)||item.weight<=0||item.weight>100)throw new Error('评分只能为 1–5，权重为 1–100');
   }
 }
 for(const c of a.testCases) if(!['text','image','audio','video','mixed'].includes(c.modality))throw new Error('用例模态无效');
 for(const r of a.runs) if(!tcIds.has(r.testCaseId))throw new Error(`执行记录 ${r.id} 关联的用例不存在`);
 for(const s of a.issues){if(!runIds.has(s.runId))throw new Error(`异常 ${s.id} 关联的执行不存在`); if(!['critical','high','medium','low'].includes(s.severity))throw new Error('严重度无效');if(!['open','investigating','ready_for_retest','resolved','wont_fix'].includes(s.status))throw new Error('问题状态无效');}
 const uniqueRetests=new Set<string>();for(const r of a.retests){const key=r.issueId+'::'+r.runId;if(uniqueRetests.has(key))throw new Error('同一问题与执行记录重复创建复测');uniqueRetests.add(key);if(!issueIds.has(r.issueId)||!runIds.has(r.runId)) throw new Error('复测关联无效');const issue=a.issues.find((i:any)=>i.id===r.issueId),run=a.runs.find((v:any)=>v.id===r.runId),original=a.runs.find((v:any)=>v.id===issue.runId);if(run.testCaseId!==original.testCaseId||run.id===original.id)throw new Error('复测必须是相同用例的另一条执行记录');if(!['pass','fail','inconclusive'].includes(r.verdict))throw new Error('复测判定无效');if(r.resolution!==undefined&&(!['fixed','not_reproduced','not_a_bug'].includes(r.resolution)||r.verdict!=='pass'))throw new Error('复测关闭原因无效');}
 let total=0;for(const f of a.evidence){if(!runIds.has(f.runId))throw new Error('图片证据关联的执行记录不存在');if(f.issueId){const issue=a.issues.find((i:any)=>i.id===f.issueId);const imageRun=a.runs.find((r:any)=>r.id===f.runId);const issueRun=a.runs.find((r:any)=>r.id===issue?.runId);if(!issue||!imageRun||!issueRun||(f.role==='retest'?imageRun.testCaseId!==issueRun.testCaseId:issue.runId!==f.runId))throw new Error('图片证据关联的异常不正确');}if(!['input','output','issue','retest'].includes(f.role)||!['image/png','image/jpeg','image/webp','image/gif'].includes(f.mime))throw new Error('图片证据类型无效');if(typeof f.size!=='number'||f.size<1||f.size>8*1024*1024)throw new Error('附件大小无效');total+=f.size;}if(total>30*1024*1024)throw new Error('附件累计超过30MB');
 return a as DataStore;
}
export function importAnyJson(raw:unknown):DataStore {try{return validateStore(raw);}catch(e){if(raw && typeof raw==='object' && (Array.isArray((raw as any).cases)))return migrateLegacyExport(raw);throw e;}}
export function demoStore():DataStore {return migrateLegacyCases([
{id:'BC-001',title:'深色外套出现密集重复纹理',tool:'ChatGPT Images',type:'材质真实性',priority:'P2',status:'待验证',expected:'深蓝色外套保留自然的织物纤维、褶皱与哑光质感',actual:'部分编辑结果中出现螺旋状、网状、压花状人工重复纹路',steps:'历史使用记录；未按固定参数复测',action:'建议分材质编辑与非目标区域保护'},
{id:'BC-002',title:'刘海局部编辑导致结构失真',tool:'ChatGPT Images',type:'局部编辑',priority:'P2',status:'待验证',expected:'保持原有自然蓬松纹理烫，仅调整指定刘海区域',actual:'刘海密度不均，部分结果出现油腻粘连的发束',steps:'历史编辑对话，未标准化重现',action:'建议支持区域锁定及版本对比'},
{id:'BC-003',title:'皮肤与嘴唇出现不自然质感',tool:'ChatGPT Images',type:'面部细节',priority:'P2',status:'待验证',expected:'保留自然毛孔、唇纹和胡须细节',actual:'面部局部蜡质感、嘴唇纹理异常、磨皮过重',steps:'历史编辑结果；待复测',action:'建议区分修瑕与纹理保留模式'}]);}
export function toCSV(data:DataStore):string {
 const cols=['id','title','category','severity','status','expected','actual','runId','tool','testCaseId'];
 const rows=data.issues.map(x=>{const run=data.runs.find(r=>r.id===x.runId); return [x.id,x.title,x.category,x.severity,x.status,x.expected,x.actual,x.runId,run?.tool||'',run?.testCaseId||''];});
 return '\ufeff'+[cols,...rows].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
export function addEvent(data:DataStore, entityType: Event['entityType'],entityId:string, action:string,details=''): DataStore {return {...data,events:[{id:makeId('EV'),entityType,entityId,action,occurredAt:new Date().toISOString(),details},...data.events]};}
export function safeIssueStatus(current:IssueStatus,next:IssueStatus):boolean {if(current===next)return true;const allowed:Record<IssueStatus,IssueStatus[]>={open:['investigating','ready_for_retest','wont_fix'],investigating:['open','ready_for_retest','wont_fix'],ready_for_retest:['open','investigating','resolved','wont_fix'],resolved:['open'],wont_fix:['open']};return allowed[current].includes(next);}

/** Rubric can change later; each scorecard keeps the dimension snapshot it was judged with. */
export function validateRubric(items:RatingDimension[]):RatingDimension[]{
 if(!Array.isArray(items)||items.length<1||items.length>12)throw Error('评分维度必须有 1–12 项');
 const seen=new Set<string>(),labels=new Set<string>();
 for(const x of items){
  if(!x||typeof x.id!=='string'||!x.id.trim()||seen.has(x.id))throw Error('评分维度编号重复或缺失');seen.add(x.id);
  if(typeof x.label!=='string'||!x.label.trim()||labels.has(x.label.trim()))throw Error('评分维度名称重复或为空');labels.add(x.label.trim());
  if(typeof x.guidance!=='string'||typeof x.active!=='boolean')throw Error('维度说明或启用状态无效');
  if(!Number.isFinite(x.weight)||x.weight<=0||x.weight>100)throw Error('评分权重必须大于0且不超过100');
 }
 if(!items.some(x=>x.active))throw Error('至少保留一个启用的评分维度');
 return items;
}
export function calculateWeightedScore(items:RatingItem[]):number{
 if(!items.length)throw Error('没有可计算的评分项');
 const denom=items.reduce((a,x)=>a+x.weight,0);
 if(denom<=0)throw Error('评分权重错误');
 return Math.round(items.reduce((a,x)=>a+x.score*x.weight,0)/denom*100)/100;
}
export function createScorecard(data:DataStore,runId:string,evaluator:string,summary:string,values:Record<string,{score:number;rationale:string}>):Scorecard{
 if(!data.runs.some(x=>x.id===runId))throw Error('必须选择有效的执行记录');
 if(!evaluator.trim()||!summary.trim())throw Error('评测人和综合结论不可为空');
 validateRubric(data.rubric);
 const ratings:RatingItem[]=data.rubric.filter(x=>x.active).map(x=>{
  const value=values[x.id];
  if(!value||!Number.isInteger(value.score)||value.score<1||value.score>5||!value.rationale?.trim())throw Error(`请完成「${x.label}」的1–5分与判断依据`);
  return {dimensionId:x.id,label:x.label,guidance:x.guidance,weight:x.weight,score:value.score,rationale:value.rationale.trim()};
 });
 return {id:makeId('SCORE'),runId,evaluator:evaluator.trim(),summary:summary.trim(),evaluatedAt:new Date().toISOString(),ratings};
}
export function latestScorecard(data:DataStore,runId:string):Scorecard|undefined{
 return data.scorecards.filter(x=>x.runId===runId).sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt))[0];
}
export function compareEvaluations(data:DataStore,leftRunId:string,rightRunId:string){
 const left=data.runs.find(x=>x.id===leftRunId),right=data.runs.find(x=>x.id===rightRunId);
 if(!left||!right||left.id===right.id||left.testCaseId!==right.testCaseId)throw Error('只能比较同一测试用例的两个不同执行版本');
 const leftScore=latestScorecard(data,leftRunId),rightScore=latestScorecard(data,rightRunId);
 const sameRubric=!!leftScore&&!!rightScore&&leftScore.ratings.length===rightScore.ratings.length&&leftScore.ratings.every((item,i)=>{const b=rightScore.ratings[i];return b&&item.dimensionId===b.dimensionId&&item.weight===b.weight;});
 return {left,right,leftScore,rightScore,comparable:sameRubric,leftTotal:leftScore?calculateWeightedScore(leftScore.ratings):null,rightTotal:rightScore?calculateWeightedScore(rightScore.ratings):null};
}
