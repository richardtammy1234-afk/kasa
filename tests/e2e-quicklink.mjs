// Hızlı ekleme bağlantısı (#ekle) ve Ana Ekran (PWA) dosyaları — tarayıcı testi, iPhone boyutu.
// Firebase bellek içi sahte sürümle değiştirilir; tüm veriler sahtedir, hiçbir gerçek hesaba istek gitmez.
// Chromium her zaman; WebKit (Safari motoru) kuruluysa çalışır. CI'da (CI=true) WebKit zorunludur.
// Çalıştırma: npm run test:e2e
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results');fs.mkdirSync(OUT,{recursive:true});
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const requests=[];
const server=http.createServer((req,res)=>{
  requests.push(req.url);
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  const f=path.join(ROOT,p==='/'?'index.html':p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${server.address().port}/`;

const STUBS={
  'firebase-app.js':`export const initializeApp=()=>({});`,
  'firebase-auth.js':`export const getAuth=()=>({});export class GoogleAuthProvider{}
    const U={uid:'u',displayName:'Test',email:'t@example.com',photoURL:''};let cb0=null;
    // signInWithPopup'a giden adres kaydedilir: bağlantıdaki metin Google girişine taşınmamalı
    export const signInWithPopup=async()=>{window.__signInHref=location.href;cb0&&cb0(U);};
    export const signOut=async()=>{cb0&&cb0(null);};
    export const onAuthStateChanged=(a,cb)=>{cb0=cb;setTimeout(()=>cb(window.__loggedOut?null:U),0);return()=>{};};`,
  'firebase-firestore.js':`const S=window.__store;const L={};
    const snap=p=>({metadata:{fromCache:false,hasPendingWrites:false},docs:Object.values(S[p]||{}).map(d=>({data:()=>structuredClone(d)}))});
    const emit=p=>(L[p]||[]).forEach(cb=>cb(snap(p)));
    export const getFirestore=()=>({});export const collection=(db,p)=>({path:p});export const doc=(c,id)=>({path:c.path,id});
    export const setDoc=async(r,d)=>{window.__writes.push(['set',r.path,r.id]);(S[r.path]??={})[r.id]=structuredClone(d);emit(r.path);};
    export const deleteDoc=async r=>{window.__writes.push(['del',r.path,r.id]);delete (S[r.path]||{})[r.id];emit(r.path);};
    export const onSnapshot=(c,cb)=>{(L[c.path]??=[]).push(cb);setTimeout(()=>cb(snap(c.path)),0);return()=>{};};
    // Gerçek Firestore gibi: toplu yazma tek seferde uygulanır, dinleyiciler bir kez bilgilendirilir
    export const writeBatch=()=>{const ops=[];return{set:(r,d)=>ops.push(['set',r,d]),delete:r=>ops.push(['del',r]),commit:async()=>{const ps=new Set();
      for(const [k,r,d] of ops){window.__writes.push([k,r.path,r.id]);if(k==='set')(S[r.path]??={})[r.id]=structuredClone(d);else delete (S[r.path]||{})[r.id];ps.add(r.path);}ps.forEach(emit);}};};`,
};
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const SEED={id:'s1',date:TODAY,amount:42,description:'Mevcut sahte işlem',category:'Kafe',cardId:'c5'};

const engines=[['chromium',chromium]];
try{const b=await webkit.launch();await b.close();engines.push(['webkit',webkit]);}
catch(e){if(process.env.CI){console.error('WebKit CI ortamında kurulu olmalı:',e.message.split('\n')[0]);process.exit(1);}console.log('ℹ WebKit kurulu değil; yalnızca Chromium ile çalışıyor (CI WebKit ile de çalıştırır).');}

const results=[];
const step=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message.split('\n').slice(0,6).join(' ')]);}};

for(const [eng,type] of engines){
  const browser=await type.launch();
  const errors=[];
  const open=async(hash,{loggedOut=false}={})=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:eng==='chromium',hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul'});
    await ctx.addInitScript(([seed,lo])=>{window.__store={'users/u/txs':{[seed.id]:seed}};window.__writes=[];window.__loggedOut=lo;},[SEED,loggedOut]);
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{const u=route.request().url();const k=Object.keys(STUBS).find(k=>u.includes('gstatic.com/firebasejs/')&&u.endsWith(k));
      return k?route.fulfill({contentType:'text/javascript',body:STUBS[k]}):route.abort();});
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
    await page.goto(BASE+hash);
    return {ctx,page};
  };
  const txWrites=page=>page.evaluate(()=>window.__writes.filter(w=>w[1]==='users/u/txs'));
  const sheetOpen=page=>page.waitForSelector('#addtx-ovl.on',{timeout:8000});
  const T=s=>`[${eng}] ${s}`;

  await step(T('#ekle=… Türkçe karakterlerle ekranı açar, alanları doldurur, KAYDETMEZ'),async()=>{
    const {ctx,page}=await open('#ekle='+encodeURIComponent('Migros 450 İş Genç'));
    await sheetOpen(page);
    assert.equal(await page.inputValue('#q-in'),'Migros 450 İş Genç');
    assert.equal(await page.inputValue('#f-desc'),'Migros');
    assert.equal(await page.inputValue('#f-amt'),'450');
    assert.equal(await page.inputValue('#f-cat'),'Market');
    assert.equal(await page.inputValue('#f-crd'),'c1','İş Genç kartı');
    assert.equal(await page.inputValue('#f-date'),TODAY);
    assert.ok(await page.isHidden('#addtx-cfm'),'onay kartı kendiliğinden açılmamalı');
    await page.waitForTimeout(500);
    assert.deepEqual(await txWrites(page),[],'bağlantı açmak kayıt yapmamalı');
    assert.equal(await page.evaluate(()=>location.hash),'','metin adres çubuğundan silinmeli');
    await page.screenshot({path:path.join(OUT,`ql-${eng}-1-doldu.png`)});
    // Kayıt yalnızca mevcut iki adımlı onayla
    await page.click('#addtx-next');
    await page.waitForSelector('#addtx-cfm',{state:'visible'});
    assert.match(await page.textContent('#addtx-cfm'),/₺450,00[\s\S]*Migros[\s\S]*Market · İş Genç/);
    assert.deepEqual(await txWrites(page),[],'onaydan önce kayıt yok');
    await page.screenshot({path:path.join(OUT,`ql-${eng}-2-onay.png`)});
    await page.click('#addtx-save');
    await page.waitForSelector('#addtx-ovl',{state:'hidden'});
    const w=await txWrites(page);assert.equal(w.length,1);
    const saved=await page.evaluate(id=>window.__store['users/u/txs'][id],w[0][2]);
    assert.deepEqual({...saved,id:undefined},{id:undefined,date:TODAY,amount:450,description:'Migros',category:'Market',cardId:'c1'});
    await ctx.close();
  });

  await step(T('#ekle (metinsiz) boş ekranı açar ve hızlı girişe odaklanır'),async()=>{
    const {ctx,page}=await open('#ekle');
    await sheetOpen(page);
    assert.equal(await page.inputValue('#q-in'),'');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'q-in');
    assert.deepEqual(await txWrites(page),[]);
    await ctx.close();
  });

  await step(T('bozuk kodlama (%E0%A4%A) çökmeden açılır ve uyarı verir'),async()=>{
    const {ctx,page}=await open('#ekle=%E0%A4%A');
    await sheetOpen(page);
    assert.match(await page.textContent('#q-hint'),/Bağlantıdaki metin okunamadı/);
    assert.equal(await page.inputValue('#q-in'),'');
    assert.deepEqual(await txWrites(page),[]);
    await ctx.close();
  });

  await step(T('"+" boşluk sayılır; aşırı uzun metin 120 karaktere kısalır; görünmez karakterler atılır'),async()=>{
    let {ctx,page}=await open('#ekle=Simit+25');
    await sheetOpen(page);
    assert.equal(await page.inputValue('#q-in'),'Simit 25');
    assert.equal(await page.inputValue('#f-amt'),'25');
    await ctx.close();
    ({ctx,page}=await open('#ekle='+encodeURIComponent('Kahve 120 '+'x'.repeat(500))));
    await sheetOpen(page);
    assert.equal((await page.inputValue('#q-in')).length,120);
    await ctx.close();
    ({ctx,page}=await open('#ekle='+encodeURIComponent('Kahve‮ 120\u0000\n Enpara')));
    await sheetOpen(page);
    assert.equal(await page.inputValue('#q-in'),'Kahve 120 Enpara');
    await ctx.close();
  });

  await step(T('HTML/komut içeren metin çalıştırılmaz, yalnızca yazı olarak görünür'),async()=>{
    const {ctx,page}=await open('#ekle='+encodeURIComponent('<img src=x onerror="window.__xss=1"> 50'));
    await sheetOpen(page);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.__xss),undefined);
    assert.equal(await page.locator('#addtx-ovl img').count(),0);
    assert.deepEqual(await txWrites(page),[]);
    await ctx.close();
  });

  await step(T('giriş yapılmamışsa: not gösterilir, girişten sonra ekran doldurulmuş açılır; metin girişe gitmez'),async()=>{
    const {ctx,page}=await open('#ekle='+encodeURIComponent('Kahve 120 Enpara'),{loggedOut:true});
    await page.waitForSelector('#login-quick',{state:'visible'});
    assert.equal(await page.evaluate(()=>location.hash),'');
    await page.click('.google-btn');
    await sheetOpen(page);
    assert.equal(await page.inputValue('#q-in'),'Kahve 120 Enpara');
    assert.equal(await page.inputValue('#f-crd'),'c5');
    assert.doesNotMatch(await page.evaluate(()=>window.__signInHref),/ekle|Kahve/,'giriş adresinde metin olmamalı');
    assert.deepEqual(await txWrites(page),[]);
    await ctx.close();
  });

  await step(T('uygulama açıkken yeni bağlantı (hashchange) ekranı yeniden doldurur'),async()=>{
    const {ctx,page}=await open('');
    await page.waitForSelector('#home-txs .txi');
    assert.ok(await page.isHidden('#addtx-ovl'),'bağlantısız açılışta ekleme ekranı açılmaz');
    await page.evaluate(()=>{location.hash='#ekle='+encodeURIComponent('Benzin 1500 QNB');});
    await sheetOpen(page);
    assert.equal(await page.inputValue('#f-amt'),'1500');
    assert.equal(await page.inputValue('#f-crd'),'c3');
    assert.deepEqual(await txWrites(page),[]);
    await ctx.close();
  });

  await step(T('mevcut kayıt ve yedek etkilenmez; normal ekleme ve onay çalışır'),async()=>{
    const {ctx,page}=await open('');
    await page.waitForSelector('#home-txs .txi');
    await page.click('.fab');
    await page.fill('#q-in','Çay 15');
    await page.press('#q-in','Enter');
    await page.waitForSelector('#addtx-cfm',{state:'visible'});
    assert.deepEqual(await txWrites(page),[]);
    await page.click('#addtx-save');
    await page.waitForSelector('#addtx-ovl',{state:'hidden'});
    assert.deepEqual(await page.evaluate(id=>window.__store['users/u/txs'][id],'s1'),SEED);
    await page.click('.hico[aria-label="Ayarlar"]');
    const [dl]=await Promise.all([page.waitForEvent('download'),page.click('text=Yedek indir')]);
    const b=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
    assert.equal(b.txs.length,2);assert.deepEqual(b.txs.find(t=>t.id==='s1'),SEED);
    await ctx.close();
  });

  await step(T('sayfada JavaScript hatası yok'),async()=>{assert.deepEqual(errors,[]);});
  await browser.close();
}

await step('bağlantıdaki metin sunucuya hiç gitmedi (fragment)',async()=>{
  assert.ok(requests.length>10);
  assert.ok(!requests.some(u=>/ekle|Migros|Kahve|Simit|Benzin|%C4%B0/i.test(u)),requests.filter(u=>/ekle/.test(u)).join(','));
});

await step('Ana Ekran: manifest geçerli; simgeler doğru boyutta PNG',async()=>{
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8'));
  assert.equal(m.display,'standalone');assert.equal(m.start_url,'./');assert.equal(m.scope,'./');
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert.match(html,/<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html,/<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png">/);
  assert.doesNotMatch(html,/serviceWorker/,'çevrimdışı önbellek (service worker) yok');
  const dims=f=>{const b=fs.readFileSync(path.join(ROOT,f));assert.equal(b.toString('latin1',1,4),'PNG',f);return[b.readUInt32BE(16),b.readUInt32BE(20)];};
  assert.deepEqual(dims('icons/apple-touch-icon.png'),[180,180]);
  for(const i of m.icons){const [w,h]=dims(i.src);assert.equal(`${w}x${h}`,i.sizes,i.src);}
});

server.close();
for(const r of results)console.log(r[0]==='ok'?'✔':'✘',r[1],r[2]?'— '+r[2]:'');
const f=results.filter(r=>r[0]!=='ok').length;console.log(`\n${results.length-f}/${results.length} geçti`);
process.exit(f?1:0);
