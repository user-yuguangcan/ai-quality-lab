const fs=require('fs'),path=require('path');const root=path.join(__dirname,'..'),out=path.join(root,'offline');
let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
const css=fs.readFileSync(path.join(out,'styles.css'),'utf8');
const react=fs.readFileSync(path.join(out,'vendor/react.js'),'utf8');
const reactdom=fs.readFileSync(path.join(out,'vendor/react-dom.js'),'utf8');
const app=fs.readFileSync(path.join(out,'app.js'),'utf8');
for(const [t,n] of [['<script src="./vendor/react.js"></script>',react],['<script src="./vendor/react-dom.js"></script>',reactdom],['<script src="./app.js"></script>',app]]){
 if(!html.includes(t))throw Error('offline HTML token missing: '+t);
 if(n.includes('</script>'))throw Error('Unexpected script closing literal');
 html=html.replace(t,`<script>${n}</script>`);
}
html=html.replace('<link rel="stylesheet" href="./styles.css"/>',`<style>${css}</style>`);
if(html.includes('src="./')||html.includes('href="./'))throw Error('External file dependency still present');
fs.writeFileSync(path.join(out,'AI_Quality_Lab_V0.6.1_离线单文件演示.html'),html);
console.log('Single file created',html.length,'bytes');
