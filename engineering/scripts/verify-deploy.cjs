/** Ensure regenerated static output matches the checked-in release candidate.
 *  Optional --repo-root-index also verifies the live Pages root artifact. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const single=path.join(root,'offline','AI_Quality_Lab_V0.6.1_离线单文件演示.html');
const expected=path.join(root,'deploy','index.html');
const digest=(f)=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const a=digest(single),b=digest(expected);
if(a!==b)throw Error(`Build parity failed: rebuilt=${a}, deploy=${b}. Update deploy/index.html intentionally after verifying release.`);
console.log('PASS rebuilt single-file artifact matches deploy/index.html SHA-256',a);
if(process.argv.includes('--repo-root-index')){
 const live=path.join(root,'..','index.html');
 const c=digest(live);
 if(a!==c)throw Error(`Published root index.html differs from source build: published=${c}, rebuilt=${a}`);
 console.log('PASS published GitHub Pages index.html matches source build');
}
