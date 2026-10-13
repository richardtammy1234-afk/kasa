// Hızlı ekleme bağlantısı — GERÇEK Firebase SDK + Auth/Firestore emülatörü ile.
// Giriş yapılmamışken #ekle=… açılır, Google girişi (emülatör) yapılır, ekran dolu açılır;
// onaya kadar veritabanına hiçbir işlem yazılmaz. Tüm veriler sahtedir; üretime istek gitmez.
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,snapshot,waitFor,runner} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const BASE=`http://127.0.0.1:${server.address().port}/`;
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

const {browser,ctx}=await newBrowser('kasa-test-quicklink');
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
let uid;

await step('giriş yokken bağlantı: not görünür, metin adres çubuğundan silinir',async()=>{
  await page.goto(BASE+'#ekle='+encodeURIComponent('Kahve Dünyası 120,50 Enpara'));
  await page.waitForSelector('#login-quick',{state:'visible',timeout:15000});
  assert.equal(await page.evaluate(()=>location.hash),'');
});

await step('Google girişinden sonra ekran dolu açılır; onaya kadar hiçbir işlem yazılmaz',async()=>{
  await page.tap('.google-btn');
  await page.waitForSelector('#addtx-ovl.on',{timeout:20000});
  uid=await newestUid();
  await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);
  assert.equal(await page.inputValue('#q-in'),'Kahve Dünyası 120,50 Enpara');
  assert.equal(await page.inputValue('#f-amt'),'120.5');
  assert.equal(await page.inputValue('#f-crd'),'c5');
  assert.equal(await page.inputValue('#f-cat'),'Kafe');
  await page.waitForTimeout(1500);
  assert.deepEqual((await snapshot(uid)).txs,{},'bağlantı açmak kayıt yapmamalı');
});
await page.screenshot({path:path.join(OUT,'emu-ql-doldu.png')});

await step('onaylanınca gerçek Firestore\'a doğru alanlarla tek kayıt yazılır',async()=>{
  await page.tap('#addtx-next');
  await page.waitForSelector('#addtx-cfm',{state:'visible'});
  assert.deepEqual((await snapshot(uid)).txs,{},'onay kartı açıkken de kayıt yok');
  await page.tap('#addtx-save');
  const txs=await waitFor(async()=>{const t=(await snapshot(uid)).txs;return Object.keys(t).length===1&&t;});
  const t=Object.values(txs)[0];
  assert.deepEqual({date:t.date,amount:t.amount,description:t.description,category:t.category,cardId:t.cardId},
    {date:TODAY,amount:120.5,description:'Kahve Dünyası',category:'Kafe',cardId:'c5'});
});

await step('üretim Firebase\'ine veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});
await browser.close();server.close();
process.exit(finish());
