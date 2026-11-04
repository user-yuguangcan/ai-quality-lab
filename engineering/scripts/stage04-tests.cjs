/* Stage04 business rules + report output + SHA256 (no browser mock needed). */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const nodeCrypto=require('node:crypto');
const ts=require('./load-typescript.cjs')();
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests','build');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({type:'commonjs'}));
for(const f of ['domain','report','storage']){
 const src=fs.readFileSync(path.join(root,'src',f+'.ts'),'utf8');
 fs.writeFileSync(path.join(out,f+'.js'),ts.transpileModule(src,{fileName:f+'.ts',compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);
}
const domain=require(path.join(out,'domain.js'));
const report=require(path.join(out,'report.js'));
const storage=require(path.join(out,'storage.js'));
let checks=0;function check(name,fn){fn();checks++;console.log('PASS',name)}
(async()=>{
 const sample=domain.demoStore();
 const opt={scope:'all',includeImages:false,generatedAt:'2026-11-03T12:00:00Z'};
 let m=report.createReportModel(sample,opt);
 check('全工作区3条用例',()=>assert.equal(m.counts.cases,3));
 check('初始输出含3条执行',()=>assert.equal(m.counts.runs,3));
 check('初始数据不虚构评分',()=>assert.equal(m.counts.scores,0));
 check('初始数据不虚构复测',()=>assert.equal(m.counts.retests,0));
 check('旧版问题数量汇总',()=>assert.equal(m.counts.issues,3));
 check('单用例过滤',()=>assert.equal(report.createReportModel(sample,{...opt,scope:sample.testCases[0].id}).counts.cases,1));
 check('非法筛选拒绝',()=>assert.throws(()=>report.createReportModel(sample,{...opt,scope:'NOT-THERE'})));
 const html=report.renderReportHtml(m,opt,{});
 check('报告包含安全打印操作',()=>assert.ok(html.includes('window.print()')));
 check('报告含中文测试标题',()=>assert.ok(html.includes('AI 输出质量评测报告')));
 check('未选图片不引入附件',()=>assert.ok(html.includes('未包含图片原文件')));
 check('不推断未评分结果',()=>assert.ok(html.includes('尚无人工评分')));
 const s=structuredClone(sample);s.testCases[0].title='<img src=x onerror=alert(1)>';m=report.createReportModel(s,opt);
 check('转义 HTML 注入内容',()=>{const html=report.renderReportHtml(m,opt);assert.ok(!html.includes('<img src=x onerror=alert(1)>'));assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));});
 const enhanced=structuredClone(sample);const baseRun=enhanced.runs[0],a=enhanced.rubric;
 const scoreA=domain.createScorecard(enhanced,baseRun.id,'验收员','本次有缺陷',Object.fromEntries(a.filter(x=>x.active).map(x=>[x.id,{score:3,rationale:'按截图检查后扣分'}])));
 enhanced.scorecards.push(scoreA);
 check('评测数据汇总',()=>assert.equal(report.createReportModel(enhanced,opt).counts.scores,1));
 const sameCaseRun={...baseRun,id:'TEST-RUN-SECOND',promptVersion:'v2',runAt:'2026-11-03T12:02:00Z'};enhanced.runs.push(sameCaseRun);
 const scoreB=domain.createScorecard(enhanced,sameCaseRun.id,'验收员','本次改善',Object.fromEntries(a.filter(x=>x.active).map(x=>[x.id,{score:5,rationale:'按截图验证提升'}])));
 enhanced.scorecards.push(scoreB);
 check('不同执行版本归于同用例',()=>assert.equal(report.createReportModel(enhanced,opt).cases.find(x=>x.testCase.id===baseRun.testCaseId).runs.length,2));
 check('一致评分口径无警示',()=>assert.equal(report.createReportModel(enhanced,opt).comparabilityWarnings.length,0));
 enhanced.scorecards[1].ratings[0].weight=55;
 check('不同权重触发比较警示',()=>assert.equal(report.createReportModel(enhanced,opt).comparabilityWarnings.length,1));
 const bytes=new TextEncoder().encode('abc');const digest=nodeCrypto.createHash('sha256').update(bytes).digest('hex');
 check('纯JS SHA256 标准向量 abc',()=>assert.equal(storage.sha256Bytes(bytes),digest));
 check('纯JS SHA256 空字串',()=>assert.equal(storage.sha256Bytes(new Uint8Array()),nodeCrypto.createHash('sha256').update('').digest('hex')));
 for(const size of [55,64,65,100,1000,1024*1024+1]){
  const b=nodeCrypto.randomBytes(size),want=nodeCrypto.createHash('sha256').update(b).digest('hex');
  check('SHA256 跨分组长度 '+size,()=>assert.equal(storage.sha256Bytes(b),want));
 }
 const img={id:'IMG-TEST',runId:baseRun.id,fileName:'test.png',mime:'image/png',size:3,role:'output',note:'模拟像素',createdAt:opt.generatedAt};enhanced.evidence=[img];
 const imageHtml=report.renderReportHtml(report.createReportModel(enhanced,{...opt,includeImages:true}),{...opt,includeImages:true},{'IMG-TEST':'data:image/png;base64,YWJj'});
 check('勾选后附件嵌入报告',()=>assert.ok(imageHtml.includes('data:image/png;base64,YWJj')));
 const noimageHtml=report.renderReportHtml(report.createReportModel(enhanced,opt),opt,{'IMG-TEST':'data:image/png;base64,YWJj'});
 check('未勾选不能嵌入附件',()=>assert.ok(!noimageHtml.includes('data:image/png;base64,YWJj')));
 check('自定义报告标题',()=>assert.ok(report.renderReportHtml(report.createReportModel(sample,{...opt,reportTitle:'专项报告ABC'}),opt).includes('专项报告ABC')));
 console.log('STAGE04',checks,'checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
