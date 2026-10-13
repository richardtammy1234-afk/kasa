// Gerçekleşen / planlanan hesapları — GERÇEK Firebase SDK + Firestore emülatörü ile.
// Saat geçmiş bir tarihe alınır ve oradan AKAR (setSystemTime). setFixedTime kullanılmaz: Firebase SDK'sının
// bağlantı bekçisi (WebChannel WatchDog) zaman aşımını Date.now() farkıyla ölçer; donmuş saatte hiç tetiklenmez,
// yavaş ortamda (CI) kopan dinleme bağlantısı yenilenmez ve yeni kayıtlar uygulamaya ulaşmaz. Tüm veriler sahtedir; üretime istek gitmez.
// Doğrulananlar: ekran rakamları, grafik uyumu, gün/ay geçişinde verinin hiç yazılmaması,
// yedek dosyasının tarih ve alanları birebir taşıması, geri yüklemenin değişmemesi, arama ve filtre.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,putDoc,snapshot,waitFor,runner} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const BASE=`http://127.0.0.1:${server.address().port}/`;
const at=(d,hm='10:00')=>new Date(`${d}T${hm}:00+03:00`);

const {browser,ctx}=await newBrowser('kasa-test-analytics');
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
// Geçmiş bir "bugün": Auth belirteçleri gerçek saatle üretildiği için geçerliliğini korur
await page.clock.setSystemTime(at('2026-03-30'));
await page.goto(BASE);
await page.tap('.google-btn');
await page.waitForSelector('#app',{state:'visible'});
const uid=await newestUid();
const T=`users/${uid}/txs`;
await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);

let n=0;const tx=(date,amount,description,category,cardId)=>({id:'e'+(n++),date,amount,description,category,cardId});
const SEED=[
  tx('2026-02-10',1200,'Migros','Market','c2'),tx('2026-02-28',300,'BİM','Market','c2'),
  tx('2026-03-05',450,'Migros','Market','c2'),tx('2026-03-20',1500,'Opet akaryakıt','Ulaşım','c3'),
  tx('2026-03-21',-250,'LC Waikiki iade','Giyim','c1'),tx('2026-03-31',120.5,'Kahve Dünyası','Kafe','c5'),
  tx('2026-04-01',229.99,'Netflix','Eğlence','c1'),tx('2026-04-15',649.9,'Turkcell faturası','Fatura','c7'),
];
for(const t of SEED)await putDoc(T,t);
const ORIG=await snapshot(uid);
const txt=sel=>page.innerText(sel).then(s=>s.replace(/\s+/g,' ').trim());
const dk=sel=>page.getAttribute(sel,'data-k').then(Number);
const svgK=(sel,a)=>page.getAttribute(`${sel} svg`,a).then(Number);
const rollTo=async t=>{await page.clock.setSystemTime(t);await page.evaluate(()=>window.__kasaCheckDay());};
// Gerçek SDK eşitlemesi eşzamansızdır: değeri hemen okumak yerine beklenen değere ulaşmasını bekle
const waitK=(sel,k,ms=20000)=>page.waitForFunction(([sel,k])=>+document.querySelector(sel)?.dataset.k===k,[sel,k],{timeout:ms});

await step('gerçek SDK: 30 Mart\'ta gerçekleşen 1.700, planlanan 120,50, toplam 1.820,50',async()=>{
  await waitK('#hero-v',170000);
  // Tüm sahte kayıtlar (Nisan'dakiler dahil) uygulamaya ulaşmadan hiçbir hesap doğrulanmaz
  await page.tap('.bni[data-tab="txs"]');
  await page.tap('#f-btn');await page.tap('#s-per-chips .ch[data-per=""]');await page.tap('#f-btn');
  await page.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===8,null,{timeout:20000});
  await page.tap('.bni[data-tab="home"]');
  const h=await txt('#home-hero');
  assert.match(h,/Planlanan ₺120,50/);assert.match(h,/Toplam kayıtlı ₺1\.820,50/);
  assert.match(h,/Günlük ortalama ₺57/);
});

await step('ana sayfa, analiz grafiği, kategoriler ve kartlar aynı rakamı verir',async()=>{
  await page.tap('.bni[data-tab="trend"]');
  assert.equal(await dk('#an-v'),170000);
  assert.equal(await svgK('#an-bars','data-actual-k'),170000);
  assert.equal(await svgK('#an-bars','data-planned-k'),12050);
  assert.equal(Number(await page.getAttribute('#cat-leg','data-k')),170000);
  await page.tap('.bni[data-tab="cards"]');
  assert.equal(await dk('#cards-v'),170000);
  const per=await page.$$eval('#card-grid .cgi .tv',els=>els.map(e=>+e.dataset.k));
  assert.equal(per.reduce((a,b)=>a+b,0),170000);
});
await page.screenshot({path:path.join(OUT,'emu-an-kartlar.png')});

await step('gün ve ay geçişi: planlanan → gerçekleşen; Firestore\'a hiçbir yazma yok',async()=>{
  await page.tap('.bni[data-tab="home"]');
  await rollTo(at('2026-03-31','00:00'));
  await waitK('#hero-v',182050);
  await rollTo(at('2026-04-01','00:00'));
  assert.match(await txt('#home-hero'),/Mart 2026 harcaması ₺1\.820,50/);
  assert.match(await txt('#home-hero'),/Geçen aya göre \(tam ay\) ₺320,50 daha fazla/);
  await page.evaluate(()=>window.chM(1));
  await waitK('#hero-v',22999);
  await page.waitForTimeout(1500);
  assert.deepEqual(await snapshot(uid),ORIG,'tarih geçişi veriyi değiştirmemeli');
});

let backup;
await step('yedek indir: planlananlar dahil tüm işlemler tarih ve alanlarıyla birebir',async()=>{
  await page.tap('.hico');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.tap('text=Yedek indir')]);
  const fp=path.join(OUT,'emu-analytics-yedek.json');await dl.saveAs(fp);
  backup=JSON.parse(fs.readFileSync(fp,'utf8'));
  assert.equal(backup.txs.length,SEED.length);
  for(const t of SEED)assert.deepEqual(backup.txs.find(x=>x.id===t.id),t);
  assert.equal(backup.cards.length,7);
});

await step('aynı yedeği geri yükleme hiçbir şeyi değiştirmez (geri yükleme davranışı aynı)',async()=>{
  await page.setInputFiles('#bk-file',path.join(OUT,'emu-analytics-yedek.json'));
  await page.waitForFunction(()=>/Eksik kayıt yok/.test(document.getElementById('bk-fb').textContent),null,{timeout:15000});
  assert.deepEqual(await snapshot(uid),ORIG);
});

await step('işlemler: tümü görünür ve aranabilir; kart filtresi çalışır',async()=>{
  await page.tap('.bni[data-tab="txs"]');
  await page.tap('#f-btn');await page.tap('#s-per-chips .ch[data-per=""]');
  await page.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===8,null,{timeout:10000});
  assert.equal(await dk('#txs-sum .big'),420039);
  await page.tap('#s-crd-chips .ch[data-cid="c7"]');
  await page.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===1);
  assert.match(await txt('#txs-wrap'),/Turkcell faturası/);
  await page.tap('#s-crd-chips .ch[data-cid=""]');await page.tap('#f-btn');
  await page.fill('#s-q','opet');
  await page.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===1);
  await page.fill('#s-q','');
});

await step('üretim Firebase\'ine veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});
await browser.close();server.close();
process.exit(finish());
