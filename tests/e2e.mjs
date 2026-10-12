// Uçtan uca tarayıcı testi (iPhone boyutunda).
// Firebase modülleri bellek içi sahte sürümlerle değiştirilir: gerçek giriş yapılmaz,
// üretim veritabanına hiçbir istek gitmez. Tüm veriler test verisidir.
// Çalıştırma: npm run test:e2e   (ekran görüntüleri: test-results/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results');
fs.mkdirSync(OUT,{recursive:true});

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  const f=path.join(ROOT,p==='/'?'index.html':p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${server.address().port}/`;

const STUBS={
  'firebase-app.js':`export const initializeApp=()=>({});`,
  'firebase-auth.js':`
    export const getAuth=()=>({});
    export class GoogleAuthProvider{}
    export const signInWithPopup=async()=>{};
    export const signOut=async()=>{};
    export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb({uid:'test-uid',displayName:'Test Kullanıcı',email:'test@example.com',photoURL:''}),0);return()=>{};};`,
  'firebase-firestore.js':`
    const S=window.__store; const L={};
    const snap=p=>({docs:Object.values(S[p]||{}).map(d=>({data:()=>structuredClone(d)}))});
    const emit=p=>(L[p]||[]).forEach(cb=>cb(snap(p)));
    export const getFirestore=()=>({});
    export const collection=(db,p)=>({path:p});
    export const doc=(c,id)=>({path:c.path,id});
    export const setDoc=async(r,d)=>{window.__writes.push(['set',r.path,r.id]);(S[r.path]??={})[r.id]=structuredClone(d);emit(r.path);};
    export const deleteDoc=async r=>{window.__writes.push(['del',r.path,r.id]);delete (S[r.path]||{})[r.id];emit(r.path);};
    export const onSnapshot=(c,cb)=>{(L[c.path]??=[]).push(cb);setTimeout(()=>cb(snap(c.path)),0);return()=>{};};
    export const writeBatch=()=>{const ops=[];return{set:(r,d)=>ops.push(()=>setDoc(r,d)),delete:r=>ops.push(()=>deleteDoc(r)),commit:async()=>{for(const o of ops)await o();}};};`,
};

const TODAY=(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
const SEED_TX={id:'seed1',date:TODAY,amount:99.9,description:'Mevcut test işlemi',category:'Market',cardId:'c3'};

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
await ctx.addInitScript(seed=>{window.__store={'users/test-uid/txs':{[seed.id]:seed}};window.__writes=[];},SEED_TX);
// Dış ağ: Firebase sahte modüllerle, Chart.js boş bir sahteyle; geri kalan her şey engellenir
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
  const u=route.request().url();
  const stub=Object.keys(STUBS).find(k=>u.includes('gstatic.com/firebasejs/')&&u.endsWith(k));
  if(stub)return route.fulfill({contentType:'text/javascript',body:STUBS[stub]});
  if(u.includes('chart'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{destroy(){}};'});
  return route.abort();
});

const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});

const store=()=>page.evaluate(()=>window.__store['users/test-uid/txs']);
const txList=async()=>Object.values(await store());
const val=sel=>page.inputValue(sel);
const results=[];
const step=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message]);}};

await page.goto(BASE);
await page.waitForSelector('#app',{state:'visible'});
await page.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===7);

await step('uygulama açılır, mevcut işlem listelenir',async()=>{
  await page.waitForSelector('#home-txs .txi');
  assert.match(await page.textContent('#home-txs'),/Mevcut test işlemi/);
});
await page.screenshot({path:path.join(OUT,'1-anasayfa.png')});

await step('"Migros 450 İş Bankası" alanları doldurur',async()=>{
  await page.tap('.fab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'q-in','hızlı giriş otomatik odaklanmalı');
  await page.fill('#q-in','Migros 450 İş Bankası');
  assert.equal(await val('#f-desc'),'Migros');
  assert.equal(await val('#f-amt'),'450');
  assert.equal(await val('#f-cat'),'Market');
  assert.equal(await val('#f-crd'),'c2');
  assert.equal(await val('#f-date'),TODAY);
});
await page.screenshot({path:path.join(OUT,'2-hizli-giris.png')});

await step('Enter onay ister, onaysız kaydetmez',async()=>{
  const before=(await txList()).length;
  await page.press('#q-in','Enter');
  await page.waitForSelector('#addtx-cfm',{state:'visible'});
  assert.match(await page.textContent('#addtx-cfm'),/Migros[\s\S]*₺450,00[\s\S]*Market · İş ·/);
  assert.equal((await txList()).length,before,'onaydan önce kayıt olmamalı');
});
await page.screenshot({path:path.join(OUT,'3-onay.png')});

await step('"Düzelt" onayı kapatır, kaydetmez',async()=>{
  const before=(await txList()).length;
  await page.tap('text=Düzelt');
  assert.equal(await page.isVisible('#addtx-cfm'),false);
  assert.equal((await txList()).length,before);
  await page.press('#q-in','Enter');
  await page.waitForSelector('#addtx-cfm',{state:'visible'});
});

await step('"Onayla ve Kaydet" doğru işlemi kaydeder',async()=>{
  await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  const added=(await txList()).find(t=>t.description==='Migros');
  assert.ok(added,'işlem kaydedilmeli');
  assert.deepEqual({...added,id:undefined},{id:undefined,date:TODAY,amount:450,description:'Migros',category:'Market',cardId:'c2'});
});

await step('son kullanılan kart hatırlanır ("Kahve 120")',async()=>{
  await page.tap('.fab');
  assert.equal(await val('#f-crd'),'c2');
  await page.fill('#q-in','Kahve 120');
  assert.equal(await val('#f-cat'),'Kafe');
  assert.equal(await val('#f-crd'),'c2');
  assert.match(await page.textContent('#q-hint'),/son kullanılan/);
});

await step('"Benzin 1500 Garanti" kayıtlı olmayan kart uyarısı',async()=>{
  await page.fill('#q-in','Benzin 1500 Garanti');
  assert.equal(await val('#f-desc'),'Benzin');
  assert.equal(await val('#f-amt'),'1500');
  assert.equal(await val('#f-cat'),'Ulaşım');
  assert.match(await page.textContent('#q-hint'),/"Garanti" kartı kayıtlı değil — Kart alanından seç/);
});
await page.screenshot({path:path.join(OUT,'4-bilinmeyen-kart.png')});

await step('elle değiştirilen alan hızlı giriş tarafından ezilmez',async()=>{
  await page.selectOption('#f-cat','Fatura');
  await page.fill('#q-in','Benzin 1600 Garanti');
  assert.equal(await val('#f-cat'),'Fatura');
  assert.equal(await val('#f-amt'),'1600');
});

await step('öneri çipi hızlı girişi doldurur',async()=>{
  await page.evaluate(()=>document.getElementById('addtx-ovl').classList.remove('on'));
  await page.tap('.fab');
  const chip=page.locator('#q-sugs .ch',{hasText:'Migros'});
  await chip.tap();
  assert.equal(await val('#q-in'),'Migros ');
  assert.equal(await val('#f-cat'),'Market');
});

await step('normal (elle) giriş hâlâ çalışır',async()=>{
  await page.evaluate(()=>document.getElementById('addtx-ovl').classList.remove('on'));
  await page.tap('.fab');
  await page.fill('#f-amt','75.25');
  await page.fill('#f-desc','Elle girilen test');
  await page.selectOption('#f-cat','Sağlık');
  await page.selectOption('#f-crd','c5');
  await page.tap('#addtx-next');
  await page.waitForSelector('#addtx-cfm',{state:'visible'});
  await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  const t=(await txList()).find(x=>x.description==='Elle girilen test');
  assert.ok(t);assert.equal(t.amount,75.25);assert.equal(t.category,'Sağlık');assert.equal(t.cardId,'c5');assert.equal(t.date,TODAY);
});

await step('eksik alanla kaydedilmez',async()=>{
  const before=(await txList()).length;
  await page.tap('.fab');
  await page.fill('#q-in','Migros');
  await page.tap('#addtx-next');
  assert.equal(await page.isVisible('#addtx-cfm'),false);
  assert.match(await page.textContent('#addtx-fb'),/Tutar gir/);
  assert.equal((await txList()).length,before);
  await page.evaluate(()=>document.getElementById('addtx-ovl').classList.remove('on'));
});

await step('açıklamadaki HTML çalıştırılmaz',async()=>{
  await page.tap('.fab');
  await page.fill('#q-in','<img src=x onerror="window.__xss=1"> 10');
  await page.press('#q-in','Enter');
  await page.tap('#addtx-save');
  await page.waitForSelector('#addtx-ovl',{state:'hidden'});
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.equal(await page.locator('#home-txs img').count(),0);
});

await step('mevcut işlem değişmedi, hiçbir şey silinmedi',async()=>{
  const s=await store();
  assert.deepEqual(s.seed1,SEED_TX);
  const dels=await page.evaluate(()=>window.__writes.filter(w=>w[0]==='del'));
  assert.deepEqual(dels,[]);
});

await step('işlemler sekmesi ve kartlar sekmesi açılır',async()=>{
  await page.tap('.bni[data-tab="txs"]');
  await page.waitForSelector('#txs-wrap .txi');
  assert.ok(await page.locator('#txs-wrap .txi').count()>=4);
  await page.tap('.bni[data-tab="cards"]');
  await page.waitForSelector('#card-grid .cgi');
  await page.tap('.bni[data-tab="home"]');
});
await page.screenshot({path:path.join(OUT,'5-sonra.png')});

await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});

await browser.close();server.close();
for(const r of results)console.log(r[0]==='ok'?'✔':'✘',r[1],r[2]?'— '+r[2]:'');
const failed=results.filter(r=>r[0]!=='ok').length;
console.log(`\n${results.length-failed}/${results.length} geçti`);
process.exit(failed?1:0);
