// Banka SMS'inden otomatik kayıt — uçtan uca tarayıcı testi (iPhone boyutunda, sahte Firebase).
// Gerçek giriş yapılmaz, üretim veritabanına hiçbir istek gitmez. Tüm veriler test verisidir.
// Çalıştırma: node tests/e2e-sms.mjs   (ekran görüntüleri: test-results/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results');
fs.mkdirSync(OUT,{recursive:true});

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  const f=path.join(ROOT,p==='/'?'index.html':p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${server.address().port}/`;

// Sahte Firestore: belgeler kimlikleriyle döner (gerçek SDK'daki doc.id gibi)
const STUBS={
  'firebase-app.js':`export const initializeApp=()=>({});`,
  'firebase-auth.js':`
    export const getAuth=()=>({});
    export class GoogleAuthProvider{}
    export const signInWithPopup=async()=>{};
    export const signOut=async()=>{};
    export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb({uid:'test-uid',displayName:'Test',email:'test@example.com',photoURL:''}),0);return()=>{};};`,
  'firebase-firestore.js':`
    const S=window.__store; const L={};
    const snap=p=>({metadata:{fromCache:false,hasPendingWrites:false},docs:Object.entries(S[p]||{}).map(([id,d])=>({id,data:()=>structuredClone(d)}))});
    const emit=p=>(L[p]||[]).forEach(cb=>cb(snap(p)));
    export const getFirestore=()=>({});
    export const collection=(db,p)=>({path:p});
    export const doc=(c,id)=>({path:c.path,id});
    export const setDoc=async(r,d)=>{window.__writes.push(['set',r.path,r.id]);(S[r.path]??={})[r.id]=structuredClone(d);emit(r.path);};
    export const deleteDoc=async r=>{window.__writes.push(['del',r.path,r.id]);delete (S[r.path]||{})[r.id];emit(r.path);};
    export const onSnapshot=(c,cb)=>{(L[c.path]??=[]).push(cb);setTimeout(()=>cb(snap(c.path)),0);return()=>{};};
    export const writeBatch=()=>{const ops=[];return{set:(r,d)=>ops.push(()=>setDoc(r,d)),delete:r=>ops.push(()=>deleteDoc(r)),commit:async()=>{for(const o of ops)await o();}};};`,
};

const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const [Y,M,D]=TODAY.split('-');
const SMSDATE=`${D}/${M}/${Y}`;
const b64=s=>Buffer.from(`${TODAY}T14:36:02+03:00\n${s}`,'utf8').toString('base64');
const KEY='abcdefghijklmnopqrstuvwxyz012345';
const SPEND=`1234 ile biten kartinizla ${SMSDATE} 14:35 tarihinde MIGROS TICARET A.S. isyerinden 450,00 TL tutarinda harcama yapilmistir. Kullanilabilir limitiniz 12.345,67 TL.`;
const seed={
  'users/test-uid/txs':{h1:{id:'h1',date:TODAY,amount:300,description:'Migros',category:'Market',cardId:'c2'}},
  'users/test-uid/private':{sms:{id:'sms',k:KEY,map:{},ok:[]}},
  'users/test-uid/inbox':{
    a:{k:KEY,b:b64(SPEND)},
    dup:{k:KEY,b:b64(SPEND)}, // aynı SMS ikinci kez: tek işlem olmalı
    otp:{k:KEY,b:b64('MIGROS isyerinde 450,00 TL tutarli islem icin dogrulama kodunuz: 482913.')},
    ref:{k:KEY,b:b64('1234 ile biten kartiniza ZARA isyerinden 899,00 TL iade yapilmistir.')},
  },
};

const browser=await chromium.launch();
const mk=async(store)=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul'});
  await ctx.addInitScript(s=>{window.__store=s;window.__writes=[];},store);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
    const u=route.request().url();
    const stub=Object.keys(STUBS).find(k=>u.includes('gstatic.com/firebasejs/')&&u.endsWith(k));
    if(stub)return route.fulfill({contentType:'text/javascript',body:STUBS[stub]});
    return route.abort();
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(BASE);
  return{ctx,page,errs};
};
const store=(page,p)=>page.evaluate(p=>structuredClone(window.__store[p]||{}),p);

// 1) Gelen kutusu otomatik işlenir
{
  const {page,errs}=await mk(seed);
  await page.waitForFunction(()=>Object.keys(window.__store['users/test-uid/inbox']||{}).length===1,null,{timeout:8000});
  const txs=await store(page,'users/test-uid/txs');
  const sms=Object.values(txs).filter(t=>t.src==='sms');
  assert.equal(sms.length,1,'aynı SMS iki kez gelse de tek işlem');
  const t=sms[0];
  assert.equal(t.amount,450);assert.equal(t.description,'Migros');assert.equal(t.category,'Market');
  assert.equal(t.date,TODAY);assert.equal(t.l4,'1234');assert.match(t.id,/^sms/);
  const inbox=await store(page,'users/test-uid/inbox');
  assert.deepEqual(Object.keys(inbox),['ref'],'harcama ve doğrulama kodu silinir, iade bekler');
  assert.equal(inbox.ref.st,'review');assert.equal(inbox.ref.why,'iade');assert.equal(inbox.ref.p.amount,899);
  const priv=await store(page,'users/test-uid/private');
  assert.equal(priv.sms.map['1234'],t.cardId,'son 4 hane eşleşmesi öğrenildi');
  assert.equal(priv.sms.k,KEY,'anahtar korunur');
  // Bildirim ve ana sayfa uyarıları
  await page.waitForSelector('#toast:not([hidden])');
  assert.match(await page.textContent('#toast-t'),/Migros/);
  await page.waitForSelector('#home-sms .sms-al');
  const al=await page.textContent('#home-sms');
  assert.match(al,/1 banka SMS'i/);assert.match(al,/•••• 1234/);
  await page.screenshot({path:path.join(OUT,'sms-1-ana-sayfa.png')});

  // 2) Ayarlar: kart eşleştirmesini değiştir -> işlem yeni karta taşınır, onaylandı sayılır
  await page.click('#home-sms .sms-al');
  await page.waitForSelector('#sms-box .sms-map select');
  await page.screenshot({path:path.join(OUT,'sms-2-ayarlar.png'),fullPage:true});
  await page.selectOption('#sms-box .sms-map select','c5');
  await page.waitForFunction(()=>window.__store['users/test-uid/private'].sms.ok?.includes('1234'));
  const t2=Object.values(await store(page,'users/test-uid/txs')).find(x=>x.src==='sms');
  assert.equal(t2.cardId,'c5','önceki SMS kaydı yeni karta taşındı');
  assert.equal((await page.textContent('#home-sms')).includes('1234'),false,'onaylanan eşleşme uyarısı kalkar');

  // 3) İncelemedeki iadeyi harcama olarak ekle (form dolu açılır, onayla kaydedilir, gelen kutusundan silinir)
  await page.click('text=Harcama olarak ekle');
  await page.waitForSelector('#addtx-ovl.on');
  assert.equal(await page.inputValue('#f-amt'),'899');
  assert.equal(await page.inputValue('#f-desc'),'Zara');
  assert.equal(await page.inputValue('#f-cat'),'Giyim');
  await page.click('#addtx-next');
  await page.click('#addtx-save');
  await page.waitForFunction(()=>!Object.keys(window.__store['users/test-uid/inbox']||{}).length);
  assert.ok(Object.values(await store(page,'users/test-uid/txs')).some(x=>x.description==='Zara'&&x.amount===899));

  // 4) Deneme kutusu kaydetmeden sonucu gösterir
  await page.waitForTimeout(800);
  await page.click('text=Bir SMS\'i dene');
  await page.fill('#sms-test','Enpara.com banka kartiniz ile 86,40 TL tutarinda SOK MARKETLER islemi yapildi.');
  const before=Object.keys(await store(page,'users/test-uid/txs')).length;
  await page.click('text=Nasıl okunacağını göster');
  assert.match(await page.textContent('#sms-test-out'),/Kaydedilir: Sok Marketler · ₺86,40 · Market · Enpara Banka/);
  assert.equal(Object.keys(await store(page,'users/test-uid/txs')).length,before,'deneme kaydetmez');
  assert.deepEqual(errs,[]);
}

// 5) Kurulum: kapalıyken açılır, anahtar oluşturulur, adres ve gövde gösterilir
{
  const {page,errs}=await mk({'users/test-uid/txs':{}});
  await page.evaluate(()=>window.goTab('settings'));
  await page.waitForSelector('text=Otomatik kaydı aç');
  await page.screenshot({path:path.join(OUT,'sms-3-kapali.png')});
  await page.click('text=Otomatik kaydı aç');
  await page.waitForSelector('#sms-url');
  const k=(await store(page,'users/test-uid/private')).sms.k;
  assert.match(k,/^[A-Za-z0-9_-]{32}$/);
  assert.equal(await page.textContent('#sms-url'),'https://firestore.googleapis.com/v1/projects/kasa-18dce/databases/(default)/documents/users/test-uid/inbox');
  assert.equal(await page.textContent('#sms-body'),`{"fields":{"k":{"stringValue":"${k}"},"b":{"stringValue":"BASE64"}}}`);
  await page.screenshot({path:path.join(OUT,'sms-4-kurulum.png'),fullPage:true});
  assert.deepEqual(errs,[]);
}

await browser.close();server.close();
console.log('e2e-sms: tüm kontroller geçti');
