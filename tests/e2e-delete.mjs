// Tek işlem silme ve "Geri al" — GERÇEK Firebase SDK + Firestore emülatörü ile.
// Senaryolar: geri al, sayfa yenileme, arka plan, çevrimdışı, planlanan kaydın korunması.
// Tüm veriler sahtedir; üretime istek gitmez. Çalıştırma: npm run test:emulator
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,putDoc,snapshot,waitFor,runner} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const BASE=`http://127.0.0.1:${server.address().port}/`;
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const NEXT_YEAR=String(+TODAY.slice(0,4)+1)+TODAY.slice(4,8)+'15';

const {browser,ctx}=await newBrowser('kasa-test-del');
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
await page.goto(BASE);
await page.tap('.google-btn');
await page.waitForSelector('#app',{state:'visible'});
const uid=await newestUid();
const T=`users/${uid}/txs`;
await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);
const SEED=[
  {id:'a1',date:TODAY,amount:450,description:'Sahte market',category:'Market',cardId:'c2'},
  {id:'a2',date:TODAY,amount:120,description:'Sahte kahve',category:'Kafe',cardId:'c5'},
  {id:'a3',date:TODAY,amount:75.5,description:'Sahte simit',category:'Kafe',cardId:'c7'},
  {id:'f1',date:NEXT_YEAR,amount:229.99,description:'Sahte planlı abonelik',category:'Eğlence',cardId:'c1'},
];
for(const t of SEED)await putDoc(T,t);
const onServer=async id=>!!(await snapshot(uid)).txs[id];

const openTxs=async()=>{
  await page.tap('.bni[data-tab="txs"]');
  await page.tap('#f-btn');await page.tap('#s-per-chips .ch[data-per=""]');await page.tap('#f-btn');
  await page.waitForFunction(n=>document.querySelectorAll('#txs-wrap .txi').length===n,Object.keys((await snapshot(uid)).txs).length,{timeout:15000});
};
const askDelete=async id=>{
  await page.locator(`#txs-wrap .txi[data-id="${id}"]`).tap();
  await page.waitForSelector('#tx-ovl.on');
  await page.tap('#txd-del');await page.tap('#txd-yes');
  await page.waitForFunction(()=>/silinecek/.test(document.getElementById('toast').textContent));
};
const setHidden=h=>page.evaluate(h=>{Object.defineProperty(document,'visibilityState',{value:h?'hidden':'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));},h);
const toastText=()=>page.textContent('#toast');

await step('geri al: sunucuya hiçbir silme gitmez, kayıt geri gelir',async()=>{
  await openTxs();
  await askDelete('a1');
  assert.equal(await page.locator('#txs-wrap .txi[data-id="a1"]').count(),0);
  await page.tap('#toast-undo');
  await page.waitForSelector('#txs-wrap .txi[data-id="a1"]');
  await page.waitForTimeout(7000);
  assert.ok(await onServer('a1'));
});

await step('süre dolmadan sayfa yenilenirse silinmez; açılışta açıkça bildirilir',async()=>{
  await askDelete('a1');
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForSelector('#app',{state:'visible'});
  await page.waitForFunction(()=>/Uygulama kapandığı için “Sahte market” silinmedi; kayıt yerinde/.test(document.getElementById('toast').textContent),null,{timeout:15000});
  await page.waitForTimeout(6000);
  assert.ok(await onServer('a1'));
  // Bildirim bir kez gösterilir
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('kasa-del:')).length),0);
});
await page.screenshot({path:path.join(OUT,'emu-silme-yenileme.png')});

await step('arka planda sayaç durur (silme hızlanmaz); ön plana dönünce sürer ve tamamlanır',async()=>{
  await openTxs();
  await askDelete('a2');
  await setHidden(true);
  await page.waitForTimeout(9000);
  assert.ok(await onServer('a2'),'arka planda silinmemeli');
  await setHidden(false);
  assert.match(await toastText(),/“Sahte kahve” silinecek/);
  await waitFor(async()=>!(await onServer('a2')),12000);
  await page.waitForFunction(()=>/“Sahte kahve” silindi/.test(document.getElementById('toast').textContent),null,{timeout:10000});
});

await step('çevrimdışı: "bu cihazda silindi, eşitlenecek" der; bağlantı gelince sunucudan silinir',async()=>{
  await askDelete('a3');
  await ctx.setOffline(true);
  await page.waitForFunction(()=>/bu cihazda silindi; bağlantı gelince/.test(document.getElementById('toast').textContent),null,{timeout:15000});
  assert.ok(await onServer('a3'),'çevrimdışıyken sunucuda hâlâ durmalı');
  await page.screenshot({path:path.join(OUT,'emu-silme-cevrimdisi.png')});
  await ctx.setOffline(false);
  await waitFor(async()=>!(await onServer('a3')),30000);
  await page.waitForFunction(()=>/“Sahte simit” silindi/.test(document.getElementById('toast').textContent),null,{timeout:30000});
});

await step('yalnızca onaylanan kayıtlar silindi; planlanan kayıt ve diğer alanlar birebir korundu',async()=>{
  const s=await snapshot(uid);
  assert.deepEqual(Object.keys(s.txs).sort(),['a1','f1']);
  assert.deepEqual(s.txs.a1,SEED[0]);
  assert.deepEqual(s.txs.f1,SEED[3]);
});

await step('üretim Firebase\'ine veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});

await browser.close();server.close();
process.exit(finish());
