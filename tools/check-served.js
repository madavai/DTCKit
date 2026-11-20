// Load the portal the way the artifact service serves it (document shell + body, window.claude present) and walk through it.
const {chromium}=require('playwright');const fs=require('fs');(async()=>{const b=await chromium.launch();
const arg=process.argv[2];let raw=fs.readFileSync(arg,'utf8');
if(!raw.startsWith('<!doctype'))raw='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>\n'+raw+'\n</body></html>';
const ctx=await b.newContext({viewport:{width:1300,height:900}});const p=await ctx.newPage();const errs=[];let tabs=0;ctx.on('page',()=>tabs++);
p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.__saved=[];window.__db={};window.claude={use:n=>Promise.resolve(n=='downloads'?{save:r=>{window.__saved.push(r.filename);return Promise.resolve({status:'saved'})}}:n=='user'?{canEdit:()=>Promise.resolve(true)}:n=='db'?{doc:path=>({onSnapshot(){},set:d=>{window.__db[path]=d;return Promise.resolve()}}),collection:()=>({onSnapshot(){}})}:null)}});
await p.route('https://artifact.test/**',r=>r.fulfill({contentType:'text/html',body:raw}));
await p.goto('https://artifact.test/index.html');await p.waitForTimeout(600);
console.log('ends properly:',raw.trim().endsWith('</body></html>'),'| doors:',await p.locator('.door').count());
await p.click('a.door[href="#organization"]');await p.click('a.item[href="#leadership"]');await p.waitForTimeout(500);
console.log('leadership tiles:',await p.locator('.stage .p').count(),'| Edit shown:',await p.isVisible('#edit'),'| new tabs:',tabs,'| trail:',(await p.locator('.crumbs li').allTextContents()).join(' / '));
await p.click('#edit');await p.click('.matrix [data-person="anamika"]');await p.fill('.form label:nth-child(2) input','Anamika Test');await p.keyboard.press('Tab');await p.click('#commit');await p.waitForTimeout(700);
console.log('status:',await p.textContent('#status'),'| stored docs:',await p.evaluate(()=>Object.keys(window.__db).join(',')));
await p.click('#nav-back');await p.click('#nav-back');await p.waitForTimeout(200);await p.click('a.door[href="#chargeback"]');await p.waitForTimeout(400);
console.log('chargeback tiles:',await p.locator('.tile').count(),'| original page is a link:',await p.locator('a.detail').count());
await p.click('#portal-save');await p.waitForTimeout(300);await p.locator('button',{hasText:'Download lines (CSV)'}).click();await p.waitForTimeout(300);
console.log('saved through Claude:',await p.evaluate(()=>window.__saved.join(', ')),'| errors:',errs.join(' ; ')||'none');
await b.close()})();
