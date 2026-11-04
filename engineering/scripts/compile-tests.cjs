/** Build the CommonJS domain module consumed by the pure-Node test suites. */
const fs=require('node:fs');
const path=require('node:path');
const ts=require('./load-typescript.cjs')();
const root=path.resolve(__dirname,'..');
const out=path.join(root,'tests','build');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({type:'commonjs'}));
const source=fs.readFileSync(path.join(root,'src','domain.ts'),'utf8');
const js=ts.transpileModule(source,{fileName:'domain.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});
if(js.diagnostics?.length)throw new Error(js.diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));
fs.writeFileSync(path.join(out,'domain.cjs'),js.outputText);
console.log('Built tests/build/domain.cjs');
