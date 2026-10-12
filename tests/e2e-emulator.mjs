// GERÇEK Firebase SDK (10.11.0, canlıdaki sürümle aynı) + yerel Firebase emülatörleri ile uçtan uca test.
// Üretim projesine hiçbir istek gitmez: proje kimliği "demo-kasa"ya çevrilir, Auth ve Firestore
// 127.0.0.1'deki emülatörlere bağlanır, diğer tüm dış istekler engellenir ve kaydedilir.
// Çalıştırma: npm run test:emulator   (Java ve firebase-tools gerekir)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results');fs.mkdirSync(OUT,{recursive:true});
const FB=path.join(ROOT,'node_modules/firebase');
const PROJECT='demo-kasa',FS='http://127.0.0.1:8080',AUTH='http://127.0.0.1:9099';
const OWNER={Authorization:'Bearer owner'}; // emülatörde kuralları atlayan yönetici erişimi

const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  const f=path.join(ROOT,p==='/'?'index.html':p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${server.address().port}/`;

// Canlı kodun içe aktardığı gstatic URL'leri, gerçek SDK'yı saran ince modüllerle karşılanır
const G='https://www.gstatic.com/firebasejs/10.11.0/';
const MODS={
  'firebase-app.js':`import * as A from '${G}real/firebase-app.js';export * from '${G}real/firebase-app.js';
    export const initializeApp=cfg=>A.initializeApp({...cfg,projectId:'${PROJECT}',apiKey:'demo-api-key',authDomain:'127.0.0.1'});`,
  'firebase-auth.js':`import * as A from '${G}real/firebase-auth.js';export * from '${G}real/firebase-auth.js';
    export const getAuth=app=>{const a=A.getAuth(app);if(!a.emulatorConfig)A.connectAuthEmulator(a,'${AUTH}',{disableWarnings:true});return a;};
    export const signInWithPopup=auth=>A.signInWithCredential(auth,A.GoogleAuthProvider.credential(JSON.stringify({sub:'kasa-test-google-1',email:'test@example.com',email_verified:true,name:'Test Kullanıcı'})));`,
  'firebase-firestore.js':`import * as F from '${G}real/firebase-firestore.js';export * from '${G}real/firebase-firestore.js';
    let done=false;export const getFirestore=app=>{const d=F.getFirestore(app);if(!done){F.connectFirestoreEmulator(d,'127.0.0.1',8080);done=true;}return d;};`,
};
// Gerçek SDK dosyaları birbirini "…/firebase-app.js" adresinden içe aktarır; o adres sarmalayıcıya gider,
// sarmalayıcı da real/ altındaki gerçek dosyayı yükler. Böylece tek bir firebase-app örneği olur.
const realBody=name=>fs.readFileSync(path.join(FB,name),'utf8').replaceAll(`${G}firebase-app.js`,`${G}real/firebase-app.js`);

const external=[];
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul'});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
  const u=route.request().url();
  if(u.startsWith(G+'real/'))return route.fulfill({contentType:'text/javascript',body:realBody(u.slice((G+'real/').length))});
  if(u.startsWith(G)&&MODS[u.slice(G.length)])return route.fulfill({contentType:'text/javascript',body:MODS[u.slice(G.length)]});
  // Firestore SDK'sının bağlantı yoklaması (google.com/images/cleardot.gif): proje verisi içermez
  if(/^https:\/\/www\.google\.com\/images\/cleardot\.gif/.test(u))return route.fulfill({status:204,body:''});
  if(u.includes('chart'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{destroy(){}};'});
  external.push(u);return route.abort();
});

const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});

// --- emülatör REST yardımcıları ---
const j=async(url,opt={})=>{const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...OWNER,...opt.headers}});const t=await r.text();if(!r.ok)throw new Error(`${r.status} ${t}`);return t?JSON.parse(t):{};};
const docsUrl=p=>`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`;
const fromFs=f=>Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k,'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'nullValue'in v?null:v]));
const toFs=o=>({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='number'?{doubleValue:v}:v===null?{nullValue:null}:{stringValue:String(v)}]))});
const list=async col=>{const r=await j(docsUrl(col)+'?pageSize=300');return Object.fromEntries((r.documents||[]).map(d=>[d.name.split('/').pop(),fromFs(d.fields)]));};
const rawTypes=async(col,id)=>Object.fromEntries(Object.entries((await j(docsUrl(`${col}/${id}`))).fields).map(([k,v])=>[k,Object.keys(v)[0]]));

await j(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,{method:'DELETE'});
await j(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});

const results=[];
const step=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message]);}};
// Tarayıcı Europe/Istanbul saat diliminde çalışır; beklenen "bugün" de aynı dilimden hesaplanmalı
// (sunucu UTC'deyken Türkiye'de 00:00-03:00 arası farklı gün olur).
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

let uid,T,C;
await step('Google girişi (gerçek Auth SDK, emülatör) ve varsayılan kartlar',async()=>{
  await page.goto(BASE);
  await page.waitForSelector('#login-screen:not(.hidden)');
  await page.tap('.google-btn');
  await page.waitForSelector('#app',{state:'visible'});
  const acc=await j(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,{method:'POST',body:'{}'});
  assert.equal(acc.userInfo.length,1);uid=acc.userInfo[0].localId;
  T=`users/${uid}/txs`;C=`users/${uid}/cards`;
  await page.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===7,null,{timeout:15000});
  let n=0;for(let i=0;i<50&&n<7;i++){n=Object.keys(await list(C)).length;if(n<7)await new Promise(r=>setTimeout(r,200));}
  assert.equal(n,7);
});

// Önceden var olan (eski sürümle girilmiş gibi) kayıtlar
const SEED={id:'seedOld1',date:'2026-01-15',amount:1234.5,description:'Eski kayıt',category:'Fatura',cardId:'c3'};
await step('mevcut kayıt sayfa yenilenince oturum korunarak görünür',async()=>{
  await j(docsUrl(T)+`?documentId=${SEED.id}`,{method:'POST',body:JSON.stringify(toFs(SEED))});
  await page.reload();
  await page.waitForSelector('#app',{state:'visible'});
  await page.tap('.bni[data-tab="txs"]');
  await page.fill('#s-mo','');await page.dispatchEvent('#s-mo','change');
  await page.waitForFunction(()=>/Eski kayıt/.test(document.getElementById('txs-wrap').textContent),null,{timeout:15000});
  await page.tap('.bni[data-tab="home"]');
});

await step('hızlı giriş gerçek Firestore\'a doğru alan ve türlerle yazar',async()=>{
  await page.tap('.fab');
  await page.fill('#q-in','Migros 450,75 İş Bankası');
  await page.press('#q-in','Enter');
  await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  let doc;
  for(let i=0;i<50&&!doc;i++){doc=Object.entries(await list(T)).find(([,t])=>t.description==='Migros');if(!doc)await new Promise(r=>setTimeout(r,200));}
  assert.ok(doc,'emülatörde işlem bulunmalı');
  const [id,t]=doc;
  assert.deepEqual(t,{id,date:TODAY,amount:450.75,description:'Migros',category:'Market',cardId:'c2'});
  assert.deepEqual(await rawTypes(T,id),{id:'stringValue',date:'stringValue',amount:'doubleValue',description:'stringValue',category:'stringValue',cardId:'stringValue'});
});

await step('normal giriş tam sayı tutarı da sayı olarak yazar (eski sürümle aynı)',async()=>{
  await page.tap('.fab');
  await page.fill('#f-amt','80');await page.fill('#f-desc','Elle kayıt');
  await page.tap('#addtx-next');await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  let doc;
  for(let i=0;i<50&&!doc;i++){doc=Object.entries(await list(T)).find(([,t])=>t.description==='Elle kayıt');if(!doc)await new Promise(r=>setTimeout(r,200));}
  assert.ok(doc);assert.equal(doc[1].amount,80);
  assert.match((await rawTypes(T,doc[0])).amount,/integerValue|doubleValue/);
});

await step('internet kesikken kayıt arayüzü kilitlemez, bağlantı gelince sunucuya ulaşır',async()=>{
  await ctx.setOffline(true);
  await page.tap('.fab');
  await page.fill('#q-in','Simit 30');
  await page.press('#q-in','Enter');
  await page.tap('#addtx-save');
  assert.match(await page.textContent('#addtx-fb'),/internet gelince/);
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  await page.tap('.fab');
  await page.fill('#q-in','Çay 20');
  await page.press('#q-in','Enter');
  await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  assert.match(await page.textContent('#home-txs'),/Simit/,'yerelde hemen görünmeli');
  await ctx.setOffline(false);
  let ok=false;
  for(let i=0;i<100&&!ok;i++){const v=Object.values(await list(T));ok=v.some(t=>t.description==='Simit')&&v.some(t=>t.description==='Çay');if(!ok)await new Promise(r=>setTimeout(r,300));}
  assert.ok(ok,'bağlantı gelince iki kayıt da sunucuya yazılmalı');
});

await step('yedek indir → yedekten geri yükle: mevcutlar değişmez, silinen geri gelir',async()=>{
  await page.tap('.hico');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.tap('text=Yedek indir')]);
  const bk=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  const before=await list(T);
  assert.equal(bk.txs.length,Object.keys(before).length);
  // Bir kaydın "yanlışlıkla" silindiğini canlandır
  await j(docsUrl(`${T}/${SEED.id}`),{method:'DELETE'});
  // Uygulamanın silmeyi görmesini bekle (İşlemler sekmesi, tüm aylar)
  await page.tap('.bni[data-tab="txs"]');
  await page.waitForFunction(()=>!/Eski kayıt/.test(document.getElementById('txs-wrap').textContent),null,{timeout:15000});
  await page.tap('.bni[data-tab="home"]');await page.tap('.hico');
  const fp=path.join(OUT,'emu-backup.json');
  fs.writeFileSync(fp,JSON.stringify({...bk,txs:bk.txs.map(t=>t.id===SEED.id?t:{...t,description:'DEĞİŞTİRİLMİŞ'})}));
  page.removeAllListeners('dialog');
  page.once('dialog',d=>{assert.match(d.message(),/1 işlem ve 0 kart eklenecek/);d.accept();});
  await page.setInputFiles('#bk-file',fp);
  await page.waitForFunction(()=>/geri yüklendi/.test(document.getElementById('bk-fb').textContent),null,{timeout:15000}).catch(async e=>{throw new Error('bk-fb: '+await page.textContent('#bk-fb'));});
  page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
  const after=await list(T);
  assert.deepEqual(after,before,'geri yükleme sonrası veriler yedekteki ile birebir aynı olmalı');
});

await step('oturum açmadan veriye erişilemez (emülatör kuralları)',async()=>{
  const r=await fetch(docsUrl(T));
  assert.equal(r.status,403);
});

await step('üretim Firebase\'ine veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});

await page.screenshot({path:path.join(OUT,'emulator-son.png')});
await browser.close();server.close();
for(const r of results)console.log(r[0]==='ok'?'✔':'✘',r[1],r[2]?'— '+r[2]:'');
const failed=results.filter(r=>r[0]!=='ok').length;
console.log(`\n${results.length-failed}/${results.length} geçti`);
process.exit(failed?1:0);
