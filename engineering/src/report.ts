/** Snapshot-based, read-only report generator. No network access or external assets. */
import { DataStore, TestCase, Run, Issue, Retest, Scorecard, Evidence, calculateWeightedScore, latestScorecard, compareEvaluations } from './domain';

export type ReportScope = 'all' | string;
export interface ReportOptions { scope: ReportScope; includeImages: boolean; generatedAt: string; reportTitle?: string }
export interface ReportIssue { item: Issue; original: Run; latestRetest?: Retest; retestRun?: Run; evidence: Evidence[] }
export interface ReportRun { run: Run; score?: Scorecard; scoreTotal?: number; evidence: Evidence[] }
export interface ReportCase { testCase: TestCase; runs: ReportRun[]; issues: ReportIssue[] }
export interface ReportModel {
  title: string; generatedAt: string; scopeLabel: string; counts: {cases:number;runs:number;issues:number;open:number;ready:number;resolved:number;retests:number;scores:number;images:number};
  cases: ReportCase[]; comparabilityWarnings: string[];
}

export function createReportModel(data: DataStore, options: ReportOptions): ReportModel {
  const chosen = options.scope === 'all' ? data.testCases : data.testCases.filter(c=>c.id===options.scope);
  if (options.scope !== 'all' && chosen.length !== 1) throw Error('指定的测试用例不存在');
  const chosenIds = new Set(chosen.map(c=>c.id));
  const includedRuns = data.runs.filter(r=>chosenIds.has(r.testCaseId));
  const runIds = new Set(includedRuns.map(r=>r.id));
  const includedIssues = data.issues.filter(i=>runIds.has(i.runId));
  const issueIds = new Set(includedIssues.map(i=>i.id));
  const retests = data.retests.filter(r=>issueIds.has(r.issueId));
  const scores = data.scorecards.filter(s=>runIds.has(s.runId));
  const images = data.evidence.filter(x=>runIds.has(x.runId));
  const cases:ReportCase[] = chosen.map(testCase=>{
    const runs = includedRuns.filter(r=>r.testCaseId===testCase.id).sort((a,b)=>a.runAt.localeCompare(b.runAt));
    const caseRunIds = new Set(runs.map(r=>r.id));
    return {
      testCase,
      runs:runs.map(run=>{
        const score=latestScorecard(data,run.id);
        return {run,score,scoreTotal:score?calculateWeightedScore(score.ratings):undefined,evidence:images.filter(i=>i.runId===run.id)};
      }),
      issues:includedIssues.filter(x=>caseRunIds.has(x.runId)).map(item=>{
        const historical=retests.filter(r=>r.issueId===item.id).sort((a,b)=>b.performedAt.localeCompare(a.performedAt));
        const latestRetest=historical[0];
        return {item,original:includedRuns.find(r=>r.id===item.runId)!, latestRetest,retestRun:includedRuns.find(r=>r.id===latestRetest?.runId),evidence:images.filter(e=>e.issueId===item.id)};
      })
    };
  });
  const comparabilityWarnings:string[]=[];
  for(const c of cases){
    const scored=c.runs.filter(x=>x.score);
    if(scored.length>=2){
      for(let i=1;i<scored.length;i++){
        if(!compareEvaluations(data,scored[0].run.id,scored[i].run.id).comparable){
          comparabilityWarnings.push(`${c.testCase.title}：评分维度或权重发生变化，版本分值不可直接比较`);
          break;
        }
      }
    }
  }
  return {
    title:options.reportTitle?.trim()||'AI 输出质量评测报告',generatedAt:options.generatedAt,
    scopeLabel: options.scope==='all'?'当前工作区 · 全部测试用例':chosen[0].title,
    counts:{cases:chosen.length,runs:includedRuns.length,issues:includedIssues.length,open:includedIssues.filter(i=>i.status==='open'||i.status==='investigating').length,ready:includedIssues.filter(i=>i.status==='ready_for_retest').length,resolved:includedIssues.filter(i=>i.status==='resolved').length,retests:retests.length,scores:scores.length,images:images.length},
    cases,comparabilityWarnings
  };
}

export function escapeHtml(input: unknown): string {
 return String(input??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const safe = escapeHtml;
const status:Record<string,string>={open:'待处理',investigating:'处理中',ready_for_retest:'待复测',resolved:'已解决',wont_fix:'不处理'};
const verdict:Record<string,string>={pass:'通过',fail:'未通过',inconclusive:'无法判断'};
function retestLabel(r:Retest):string {return r.verdict==='pass'?({fixed:'修复后验证通过',not_reproduced:'未能复现（未修改代码）',not_a_bug:'确认非程序缺陷'} as Record<string,string>)[r.resolution||'']||'通过（旧版记录未细分原因）':verdict[r.verdict]||r.verdict;}
const severity:Record<string,string>={critical:'严重',high:'高',medium:'中',low:'低'};
const evidenceRole:Record<string,string>={input:'输入原图',output:'AI 输出',issue:'异常证据',retest:'复测结果'};
const fmt=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?s.replace('T',' ').slice(0,16):d.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
const detail=(label:string,value:unknown)=>`<div class="detail"><span>${safe(label)}</span><p>${safe(value||'未填写')}</p></div>`;

/** imageDataUrls must come from already-loaded, validated local Blob files. Missing images are shown as omissions. */
export function renderReportHtml(model:ReportModel, options:ReportOptions, imageDataUrls:Record<string,string>={}):string {
 const c=model.counts;
 const counts=[['测试用例',c.cases],['执行记录',c.runs],['Bad Case',c.issues],['待跟进',c.open+c.ready],['已关闭',c.resolved],['复测次数',c.retests],['人工评分',c.scores],['图片附件',c.images]];
 const allCases=model.cases.map((entry,index)=>{
  const testCase=entry.testCase;
  const runRows=entry.runs.map(r=>{
    const card=r.score;
    const items=card?`<div class="rating-grid">${card.ratings.map(i=>`<div><strong>${safe(i.label)}</strong> <em>${i.score}/5 · 权重${i.weight}</em><p>${safe(i.rationale)}</p></div>`).join('')}</div>`:'';
    const photos=options.includeImages&&r.evidence.length?`<div class="photos">${r.evidence.map(e=>{
     const url=imageDataUrls[e.id];
     return `<figure>${url&&/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(url)?`<img src="${url}" alt="${safe(e.fileName)}"/>`:'<div class="missing">图片未载入，请核对工作区附件</div>'}<figcaption>${safe(evidenceRole[e.role]||e.role)} · ${safe(e.fileName)}${e.note?` · ${safe(e.note)}`:''}</figcaption></figure>`;
    }).join('')}</div>`:'';
    return `<div class="subsection"><div class="subheading"><strong>执行 ${safe(r.run.promptVersion||'未标版本')}</strong><span>${safe(r.run.tool)} · ${safe(fmt(r.run.runAt))}</span></div>${detail('输入提示词',r.run.prompt||'未记录')}${detail('实际输出',r.run.outputDescription)}${card?`<div class="rating"><b>最近一次人工评分 ${r.scoreTotal?.toFixed(2)}/5</b><span>${safe(card.evaluator)} · ${safe(fmt(card.evaluatedAt))}</span><p>${safe(card.summary)}</p>${items}</div>`:'<div class="unrated">尚无人工评分，不推断本次运行是否通过</div>'}${photos}</div>`;
  }).join('');
  const issueRows=entry.issues.map(x=>`<div class="issue"><div class="issue-head"><b>${safe(x.item.title)}</b><span>${safe(x.item.status==='resolved'&&x.latestRetest?.verdict==='pass'?'已关闭 · '+retestLabel(x.latestRetest):status[x.item.status]||x.item.status)} · ${safe(severity[x.item.severity]||x.item.severity)}</span></div>${detail('异常说明',x.item.actual)}${detail('优化建议',x.item.suggestion||'未填写')}${x.latestRetest?`<div class="retest"><strong>最近复测：${safe(retestLabel(x.latestRetest))}</strong> · ${safe(fmt(x.latestRetest.performedAt))}<p>${safe(x.latestRetest.notes)}</p><small>复测运行：${safe(x.retestRun?.promptVersion||x.latestRetest.runId)}</small></div>`:'<p class="unrated">没有复测记录</p>'}</div>`).join('');
  return `<article class="case"><div class="case-intro"><div class="case-head"><span>TEST CASE ${String(index+1).padStart(2,'0')}</span><h2>${safe(testCase.title)}</h2><small>${safe(testCase.id)} · ${safe(testCase.modality)}</small></div><div class="case-objective">${detail('测试目标',testCase.objective)}${detail('预期结果',testCase.expected)}${detail('验收标准',testCase.criteria)}</div></div><div class="section-block"><h3>执行与人工评分 <small>${entry.runs.length} 次</small></h3>${runRows||'<p class="empty">本用例暂无执行记录</p>'}</div><div class="section-block"><h3>异常问题与复测 <small>${entry.issues.length} 条</small></h3>${issueRows||'<p class="empty">本用例尚未记录 Bad Case</p>'}</div></article>`;
 }).join('');
 const warnings=model.comparabilityWarnings.length?`<section class="warnings"><h3>评分口径提醒</h3>${model.comparabilityWarnings.map(x=>`<p>${safe(x)}</p>`).join('')}</section>`:'';
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safe(model.title)} - AI Quality Lab</title><style>
:root{font-family:Arial,"Microsoft YaHei","PingFang SC",sans-serif;color:#23344a;background:#f3f6f7;font-size:14px}*{box-sizing:border-box}body{margin:0}.toolbar{display:flex;justify-content:space-between;align-items:center;padding:14px max(24px,calc((100% - 900px)/2));background:#182c40;color:#fff}.toolbar button{padding:10px 16px;border-radius:8px;border:0;background:#d8f1ed;color:#1c554f;font-weight:700;cursor:pointer}.document{max-width:900px;margin:34px auto;background:#fff;padding:52px 56px;box-shadow:0 10px 40px #20314818}.kicker{color:#207e79;font-size:11px;letter-spacing:2px;font-weight:800}.masthead h1{font-size:29px;letter-spacing:-.6px;margin:14px 0 9px}.subtitle{color:#647688;line-height:1.6}.meta{margin:25px 0;display:flex;gap:24px;color:#6c7d8b;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:26px 0 20px}.stat{background:#f1f7f6;border:1px solid #dfeee9;border-radius:9px;padding:13px}.stat span{display:block;font-size:11px;color:#68817f}.stat strong{display:block;font-size:23px;margin-top:5px;color:#163e3c}.note,.warnings{background:#f9fbfb;border-left:3px solid #519f98;padding:13px 17px;color:#687c86;font-size:12px;line-height:1.75;margin:25px 0}.warnings{border-color:#dfab62;background:#fff9ef;color:#7d6034}.case{padding:27px 0;border-top:2px solid #e5ecef;break-before:auto}.case-head span{font-size:10px;letter-spacing:2px;color:#5b9b94;font-weight:800}.case-head h2{font-size:21px;margin:9px 0 3px}.case-head small,.subheading span{font-size:11px;color:#8493a1}.case-objective{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 27px}.detail{min-width:0}.detail>span{color:#718697;font-size:11px}.detail p{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.case h3{font-size:14px;color:#304c5b;border-bottom:1px solid #e4ebee;padding-bottom:9px;margin:26px 0 13px}.case h3 small{float:right;font-weight:400;color:#8698a5}.subsection{border:1px solid #e6ecee;border-radius:9px;padding:17px 19px;margin:14px 0;break-inside:auto}.subheading,.issue-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.subheading strong{color:#276c67}.rating{margin-top:13px;padding:14px;background:#eff8f6;border-radius:8px}.rating b{color:#276c67}.rating>span{color:#80908f;font-size:10px;margin-left:10px}.rating>p{font-size:12px}.rating-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rating-grid>div{background:#fff;border-radius:6px;padding:9px}.rating-grid strong{font-size:11px}.rating-grid em{font-style:normal;color:#718e89;font-size:10px}.rating-grid p{font-size:11px;line-height:1.5;white-space:pre-wrap}.unrated,.empty{color:#8294a0;font-size:12px;padding:9px 0}.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:15px}.photos figure{margin:0;min-width:0;break-inside:avoid}.photos img{height:210px;max-width:100%;width:100%;object-fit:contain;background:#f2f5f6;border-radius:6px}.photos figcaption{font-size:10px;color:#72828e;line-height:1.5;word-break:break-all;margin-top:6px}.missing{border:1px dashed #d7ad77;border-radius:5px;color:#9b7b52;padding:20px}.issue{background:#fafbfc;padding:15px;border-radius:8px;border:1px solid #e9eef2;margin:13px 0;break-inside:avoid-page}.issue-head b{font-size:12px}.issue-head span{font-size:11px;color:#657e8c}.retest{padding:11px 12px;background:#eaf6f3;border-radius:6px;color:#376962;font-size:12px}.retest p{white-space:pre-wrap;line-height:1.6}.retest small{color:#75948d}.endnote{margin-top:30px;padding-top:15px;border-top:1px solid #e9edf0;color:#94a4af;font-size:10px;line-height:1.8}@media(max-width:700px){.document{padding:28px 20px;margin:0;box-shadow:none}.summary{grid-template-columns:repeat(2,1fr)}.case-objective,.rating-grid,.photos{grid-template-columns:1fr}.meta{display:block}.toolbar{padding:12px 20px}}@page{size:A4;margin:14mm 12mm}@media print{:root{background:#fff;font-size:12px}.toolbar{display:none!important}.document{box-shadow:none;margin:0;padding:0;max-width:none}.case{break-inside:auto}.subsection{break-inside:auto}.issue,.photos figure{break-inside:avoid-page}.photos img{height:160px}.stat{padding:10px}.case-objective{gap:10px}.masthead h1{font-size:25px}.endnote{display:block!important;margin:15px 0 0;padding:8px 0 0;font-size:9px;line-height:1.45;break-inside:avoid-page;page-break-inside:avoid}.case-intro{break-inside:avoid-page;page-break-inside:avoid}.case-head,.case h3,.subheading,.issue-head{break-after:avoid-page;page-break-after:avoid}.case h3{break-inside:avoid-page;page-break-inside:avoid}.section-block{break-inside:auto;orphans:2;widows:2}.detail p,.rating-grid p{orphans:3;widows:3}.issue{break-inside:auto;page-break-inside:auto}.retest{break-inside:avoid-page}.case{padding:19px 0}.case h3{margin:17px 0 9px;padding-bottom:7px}.case-objective{margin:12px 0 17px}.subsection{margin:9px 0;padding:12px 15px}.issue{margin:8px 0;padding:11px}.note,.warnings{margin:15px 0;padding:10px 12px}.meta{margin:18px 0}.summary{margin:17px 0}.detail p{line-height:1.5}.rating{padding:10px;margin-top:8px}.rating-grid{gap:7px}.rating-grid>div{padding:7px}.rating-grid p{margin:6px 0;line-height:1.4}.subheading,.issue-head{margin-bottom:7px}}}</style></head><body><div class="toolbar"><span>AI Quality Lab · 独立报告</span><button type="button" onclick="window.print()">打印 / 另存为 PDF</button></div><main class="document"><header class="masthead"><div class="kicker">AI QUALITY LAB / ASSESSMENT REPORT</div><h1>${safe(model.title)}</h1><p class="subtitle">${safe(model.scopeLabel)}</p><div class="meta"><span>生成时间：${safe(fmt(model.generatedAt))}</span><span>评测方式：人工记录与人工评分</span></div></header><section class="summary">${counts.map(([label,n])=>`<div class="stat"><span>${safe(label)}</span><strong>${n}</strong></div>`).join('')}</section><p class="note">数据来自生成时的本地工作区快照，包含用户自行录入和可能存在的演示案例。报告记录评分依据与异常状态，不构成模型基准性能或统计显著性结论。${options.includeImages?'本报告包含本地图片附件，请确认素材可以共享。':'本报告未包含图片原文件，可在生成前勾选“包含图片证据”。'}</p>${warnings}${allCases||'<p class="empty">当前没有测试用例。请先创建并记录执行结果。</p>'}<footer class="endnote">AI Quality Lab V0.6.1 · 本地生成 · 无服务器数据传输 · 请确认个人信息与图片授权后再公开分享</footer></main></body></html>`;
}
