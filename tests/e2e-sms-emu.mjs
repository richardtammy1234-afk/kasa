// Banka SMS'inden otomatik kayıt — GERÇEK Firebase SDK + Auth/Firestore emülatörü + gerçek güvenlik kuralları.
// iPhone Kestirmesinin yaptığı isteği (girişsiz REST POST) taklit eder; kuralların yalnızca doğru anahtarla
// yeni kayıt oluşturmaya izin verdiğini ve uygulamanın SMS'i işleme çevirdiğini doğrular. Tüm veriler sahtedir.
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,snapshot,waitFor,runner,j} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const BASE=`http://127.0.0.1:${server.address().port}/`;
const FS='http://127.0.0.1:8080/v1/projects/demo-kasa/databases/(default)/documents';
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const [Y,M,D]=TODAY.split('-');
const b64=s=>Buffer.from(`${TODAY}T10:00:00+03:00\n${s}`,'utf8').toString('base64');
// Kestirmenin isteği: kimlik doğrulama başlığı YOK
const shortcut=(uid,body)=>fetch(`${FS}/users/${uid}/inbox`,{method:'POST',headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
const fields=o=>({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{stringValue:v}]))});

const {browser,ctx}=await newBrowser('kasa-test-sms');
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
let uid,key;

await step('giriş ve otomatik kaydı açma: anahtar oluşur, adres ve gövde gösterilir',async()=>{
  await page.goto(BASE);
  await page.tap('.google-btn');
  await page.waitForSelector('#app',{state:'visible',timeout:20000});
  uid=await newestUid();
  await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);
  await page.evaluate(()=>window.goTab('settings'));
  await page.click('text=Otomatik kaydı aç');
  await page.waitForSelector('#sms-body',{timeout:15000});
  key=JSON.parse(await page.textContent('#sms-body')).fields.k.stringValue;
  assert.match(key,/^[A-Za-z0-9_-]{32}$/);
  assert.match(await page.textContent('#sms-url'),new RegExp(`/projects/demo-kasa/databases/\\(default\\)/documents/users/${uid}/inbox$`));
});

await step('kural: girişsiz istek anahtarsız / yanlış anahtarla / fazla alanla REDDEDİLİR',async()=>{
  for(const body of [fields({b:b64('x')}),fields({k:'yanlis-anahtar-yanlis-anahtar-00',b:b64('x')}),fields({k:key,b:b64('x'),cardId:'c1'}),fields({k:key,b:''})]){
    const r=await shortcut(uid,body);
    assert.equal(r.status,403,JSON.stringify(body).slice(0,80));
  }
  // Başka bir kullanıcının gelen kutusuna da yazılamaz (o kullanıcıda anahtar yok)
  assert.equal((await shortcut('baska-kullanici',fields({k:key,b:b64('x')}))).status,403);
});

await step('kural: girişsiz istek okuyamaz, değiştiremez, silemez',async()=>{
  assert.equal((await fetch(`${FS}/users/${uid}/inbox`)).status,403);
  assert.equal((await fetch(`${FS}/users/${uid}/private/sms`)).status,403);
  assert.equal((await fetch(`${FS}/users/${uid}/txs`)).status,403);
  assert.equal((await fetch(`${FS}/users/${uid}/txs/x`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(fields({a:'b'}))})).status,403);
});

await step('doğru anahtarla SMS gelir → uygulama onaysız kaydeder, gelen kutusunu boşaltır',async()=>{
  const sms=`1234 ile biten kartinizla ${D}/${M}/${Y} 14:35 tarihinde SHELL PETROL A.S. isyerinden 1.850,00 TL tutarinda harcama yapilmistir.`;
  const r=await shortcut(uid,fields({k:key,b:b64(sms)}));
  assert.equal(r.status,200,await r.text());
  // Kestirme bunu iki kez gönderirse de tek kayıt olmalı
  assert.equal((await shortcut(uid,fields({k:key,b:b64(sms)}))).status,200);
  // Doğrulama kodu SMS'i kaydedilmemeli
  assert.equal((await shortcut(uid,fields({k:key,b:b64('Islem icin dogrulama kodunuz: 123456. Tutar: 50,00 TL')}))).status,200);
  const tx=await waitFor(async()=>Object.values((await snapshot(uid)).txs).find(t=>t.src==='sms'));
  assert.equal(tx.amount,1850);assert.equal(tx.description,'Shell Petrol');assert.equal(tx.category,'Ulaşım');assert.equal(tx.date,TODAY);assert.equal(tx.l4,'1234');
  await waitFor(async()=>!(await j(`${FS}/users/${uid}/inbox`)).documents?.length);
  await page.waitForTimeout(1000);
  assert.equal(Object.values((await snapshot(uid)).txs).filter(t=>t.src==='sms').length,1,'tek kayıt');
});

await step('anahtar yenilenince eski anahtar reddedilir',async()=>{
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  await page.click('text=Anahtarı yenile');
  await waitFor(async()=>{const k=JSON.parse(await page.textContent('#sms-body')).fields.k.stringValue;return k!==key;});
  assert.equal((await shortcut(uid,fields({k:key,b:b64('x')}))).status,403);
});
await page.screenshot({path:path.join(OUT,'emu-sms.png'),fullPage:true});

await step('sayfa hatası yok, dış adrese istek yok',async()=>{
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
});

await browser.close();server.close();
process.exit(finish());
