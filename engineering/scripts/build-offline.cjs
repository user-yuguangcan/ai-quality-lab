const fs=require('fs'),path=require('path');
const ts=require('./load-typescript.cjs')();
const root=path.join(__dirname,'..'),out=path.join(root,'offline');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'vendor'),{recursive:true});
const files=[['./domain','domain.ts'],['./storage','storage.ts'],['./report','report.ts'],['./main','main.tsx']];
let source='/* AI Quality Lab V0.6.1 offline bundle: same TS(X) sources as Vite project */\n(function(){\n';
source+='var modules=Object.create(null),cache=Object.create(null);\n';
for(const [name,file] of files){const input=fs.readFileSync(path.join(root,'src',file),'utf8');const result=ts.transpileModule(input,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}});if(result.diagnostics?.length){throw Error(`${file}: ${result.diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' / ')}`);}source+=`modules[${JSON.stringify(name)}]=function(require,module,exports){\n${result.outputText}\n};\n`;}
source+=`function require(name){if(name==='react')return window.React;if(name==='react-dom')return window.ReactDOM;if(cache[name])return cache[name].exports;if(!modules[name])throw Error('Missing module '+name);var module={exports:{}};cache[name]=module;modules[name](require,module,module.exports);return module.exports;}\n`;
source+=`if(!window.React.Fragment)window.React.Fragment='div';require('./main');})();`;
fs.writeFileSync(path.join(out,'app.js'),source);
fs.copyFileSync(path.join(root,'src','styles.css'),path.join(out,'styles.css'));
// The MIT-licensed offline React 16 compatibility runtime is an explicit
// vendored project asset. Do not depend on a host-specific Python path.
for(const asset of ['react.js','react-dom.js']) {
 const filename=path.join(out,'vendor',asset);
 if(!fs.existsSync(filename))throw Error('Missing vendored runtime: '+filename);
}
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('href="/src/styles.css"','href="./styles.css"').replace('<script type="module" src="/src/main.tsx"></script>','<script src="./vendor/react.js"></script><script src="./vendor/react-dom.js"></script><script src="./app.js"></script>');fs.writeFileSync(path.join(out,'index.html'),html);
const license=`React 16.0.0 and ReactDOM 16.0.1 JavaScript UMD runtime copies, copyright (c) Facebook, Inc.\nLicensed under the MIT License.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`;
fs.writeFileSync(path.join(out,'vendor','LICENSE.txt'),license);
fs.mkdirSync(path.join(root,'tests/build'),{recursive:true});
const domain=ts.transpileModule(fs.readFileSync(path.join(root,'src','domain.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
fs.writeFileSync(path.join(root,'tests/build/domain.cjs'),domain);
console.log('Offline bundle created:',path.join(out,'index.html'),'bytes=',source.length);
