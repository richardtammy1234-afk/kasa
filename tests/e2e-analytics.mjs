// Gerçekleşen / planlanan harcama ekranları — tarayıcı testi (iPhone boyutu, Europe/Istanbul).
// Saat sabitlenir (page.clock.setFixedTime); Firebase bellek içi sahte sürümle değiştirilir.
// Tüm veriler sahtedir; hiçbir gerçek hesaba istek gitmez. Çalıştırma: npm run test:e2e
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results');fs.mkdirSync(OUT,{recursive:true});
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

const STUBS={
  'firebase-app.js':`export const initializeApp=()=>({});`,
  'firebase-auth.js':`export const getAuth=()=>({});export class GoogleAuthProvider{}export const signInWithPopup=async()=>{};export const signOut=async()=>{};
    export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb({uid:'u',displayName:'Test',email:'t@example.com',photoURL:''}),0);return()=>{};};`,
  'firebase-firestore.js':`const S=window.__store;const L={};
    const snap=p=>({metadata:{fromCache:false,hasPendingWrites:false},docs:Object.values(S[p]||{}).map(d=>({data:()=>structuredClone(d)}))});
    const emit=p=>(L[p]||[]).forEach(cb=>cb(snap(p)));
    export const getFirestore=()=>({});export const collection=(db,p)=>({path:p});export const doc=(c,id)=>({path:c.path,id});
    export const setDoc=async(r,d)=>{window.__writes.push(['set',r.path,r.id]);(S[r.path]??={})[r.id]=structuredClone(d);emit(r.path);};
    export const deleteDoc=async r=>{window.__writes.push(['del',r.path,r.id]);delete (S[r.path]||{})[r.id];emit(r.path);};
    export const onSnapshot=(c,cb)=>{(L[c.path]??=[]).push(cb);setTimeout(()=>cb(snap(c.path)),0);return()=>{};};
    export const writeBatch=()=>{const ops=[];return{set:(r,d)=>ops.push(()=>setDoc(r,d)),delete:r=>ops.push(()=>deleteDoc(r)),commit:async()=>{for(const o of ops)await o();}};};`,
};

const browser=await chromium.launch();
const results=[];const errors=[];
const step=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message]);}};
let n=0;const tx=(date,amount,description,category,cardId)=>({id:'s'+(n++),date,amount,description,category,cardId});
// İstanbul yerel saatiyle sabit an (UTC+3)
const at=(d,hm='10:00')=>new Date(`${d}T${hm}:00+03:00`);

const open=async(seed,time)=>{
  const ctx=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul'});
  await ctx.addInitScript(seed=>{window.__store={'users/u/txs':Object.fromEntries(seed.map(t=>[t.id,t]))};window.__writes=[];},seed);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{const u=route.request().url();const k=Object.keys(STUBS).find(k=>u.includes('gstatic.com/firebasejs/')&&u.endsWith(k));
    return k?route.fulfill({contentType:'text/javascript',body:STUBS[k]}):route.abort();});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>{errors.push('beklenmeyen dialog: '+d.message());d.dismiss();});
  await page.clock.setFixedTime(time);
  await page.goto(BASE);
  await page.waitForSelector('#app',{state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===7);
  return {ctx,page};
};
const txt=(page,sel)=>page.innerText(sel).then(s=>s.replace(/\s+/g,' ').trim());
const dk=(page,sel)=>page.getAttribute(sel,'data-k').then(Number);
const svgK=(page,sel,a)=>page.getAttribute(`${sel} svg`,a).then(Number);
const rollTo=async(page,time)=>{await page.clock.setFixedTime(time);await page.evaluate(()=>window.__kasaCheckDay());};

// --- Senaryo A: Mart 2026 (önceki ay Şubat 28 gün), bir iade ve planlanan işlemler ---
const SEED_A=[
  tx('2026-02-10',1200,'Migros','Market','c2'),tx('2026-02-28',300,'BİM','Market','c2'),
  tx('2026-03-05',450,'Migros','Market','c2'),tx('2026-03-20',1500,'Opet akaryakıt','Ulaşım','c3'),
  tx('2026-03-21',-250,'LC Waikiki iade','Giyim','c1'),
  tx('2026-03-31',120.5,'Kahve Dünyası','Kafe','c5'),
  tx('2026-04-01',229.99,'Netflix','Eğlence','c1'),tx('2026-04-15',649.9,'Turkcell faturası','Fatura','c7'),
];
const A=await open(SEED_A,at('2026-03-30'));
const pa=A.page;

await step('bugün 30 Mart: ana rakam yalnızca gerçekleşen; planlanan ve toplam ayrı',async()=>{
  assert.equal(await dk(pa,'#hero-v'),170000,'450 + 1500 − 250 = 1.700,00');
  const h=await txt(pa,'#home-hero');
  assert.match(h,/Bu ay gerçekleşen harcama ₺1\.700,00/);
  assert.match(h,/Planlanan ₺120,50 1 işlem/);
  assert.match(h,/Toplam kayıtlı ₺1\.820,50/);
  assert.doesNotMatch(h,/bakiye|birikim|kullanılabilir/i);
});
await pa.screenshot({path:path.join(OUT,'an-1-ana-sayfa.png')});

await step('günlük ortalama = gerçekleşen ÷ geçen gün (1.700 ÷ 30 = 56,67)',async()=>{
  assert.match(await txt(pa,'#home-hero'),/Günlük ortalama ₺57/);
});

await step('kısa önceki ay: 1–30 Mart ↔ Şubat\'ın tamamı (1–28); ay başından bugüne etiketli',async()=>{
  const h=await txt(pa,'#home-hero');
  assert.match(h,/Geçen ayın aynı dönemine göre \(1–28 şubat · ayın tamamı\) ₺200,00 daha fazla/i);
  assert.match(h,/1–28 şubat · ayın tamamı ₺1\.500/i);
});

await step('analiz: grafik toplamları özetle birebir; gelecek gün çubuğu planlanan',async()=>{
  await pa.tap('.bni[data-tab="trend"]');
  const hero=await dk(pa,'#an-v');
  assert.equal(await svgK(pa,'#an-bars','data-actual-k'),hero,'koyu çubuklar = gerçekleşen');
  assert.equal(await svgK(pa,'#an-bars','data-planned-k'),12050,'pastel çubuklar = planlanan');
  assert.equal(Number(await pa.getAttribute('#cat-leg','data-k')),hero,'kategoriler (gerçekleşen) = ana rakam');
  const w=await txt(pa,'#an-cmp');
  assert.match(w,/Ay başından bugüne geçen aya göre \+13%/);
  assert.match(w,/gerçekleşen ÷ 30 gün/);
  assert.match(w,/Gerçekleşen işlem 3 .*\+1 planlanan/);
  assert.match(w,/kıyas ay bitince/,'yarım ay, tam ay ortalamasıyla kıyaslanmaz');
  // Son 6 ay: Mart'ın gerçekleşeni ve planlananı ayrı
  assert.equal(await svgK(pa,'#an-6m','data-planned-k'),12050);
});
await pa.screenshot({path:path.join(OUT,'an-2-analiz.png')});

await step('kategoriler: planlanan ayrı incelenebilir',async()=>{
  await pa.tap('#cat-sum .seg button:nth-child(2)');
  assert.equal(Number(await pa.getAttribute('#cat-leg','data-k')),12050);
  assert.match(await txt(pa,'#cat-leg'),/Kafe ₺120,50 %100/);
  await pa.tap('#cat-sum .seg button:nth-child(1)');
  assert.match(await txt(pa,'#cat-leg'),/Ulaşım ₺1\.500,00/);
  assert.match(await txt(pa,'#cat-leg'),/Giyim/,'iade kategorisi negatif olarak görünür');
});

await step('kartlar: gerçekleşen ve planlanan ayrı; toplamlar tutar; limit yüzdesi eski hesapla',async()=>{
  await pa.tap('.bni[data-tab="cards"]');
  assert.equal(await dk(pa,'#cards-v'),170000);
  const per=await pa.$$eval('#card-grid .cgi .tv',els=>els.map(e=>+e.dataset.k));
  assert.equal(per.reduce((a,b)=>a+b,0),170000,'kart başına gerçekleşen toplamı = ana rakam');
  assert.match(await txt(pa,'#card-grid .cgi[data-cid="c5"]'),/Planlanan ₺120,50 · 1 işlem/);
  assert.match(await txt(pa,'#card-grid'),/Ekstre borcu, ödenecek tutar veya kullanılabilir limit değildir/);
});
await pa.screenshot({path:path.join(OUT,'an-3-kartlar.png')});

await step('ertesi gün (31 Mart): planlanan işlem veri değişmeden gerçekleşene geçer',async()=>{
  await pa.tap('.bni[data-tab="home"]');
  await rollTo(pa,at('2026-03-31','00:01'));
  assert.equal(await dk(pa,'#hero-v'),182050);
  assert.doesNotMatch(await txt(pa,'#home-hero'),/Planlanan/);
  assert.match(await txt(pa,'#home-hero'),/Günlük ortalama ₺59/,'1.820,50 ÷ 31');
  assert.deepEqual(await pa.evaluate(()=>window.__writes),[...Array(7)].map((_,i)=>['set','users/u/cards','c'+(i+1)]),'yalnızca varsayılan kartlar yazıldı; işlemlere yazılmadı');
});

await step('ay geçişi (1 Nisan): Mart tam ay kıyaslanır; Nisan ay başından bugüne, taban 0',async()=>{
  await rollTo(pa,at('2026-04-01','00:00'));
  let h=await txt(pa,'#home-hero');
  assert.match(h,/Mart 2026 harcaması ₺1\.820,50/);
  assert.match(h,/Geçen aya göre \(tam ay\) ₺320,50 daha fazla/);
  await pa.evaluate(()=>window.chM(1));
  h=await txt(pa,'#home-hero');
  assert.equal(await dk(pa,'#hero-v'),22999,'Netflix (1 Nisan) artık gerçekleşen');
  assert.match(h,/Planlanan ₺649,90 1 işlem/);
  assert.match(h,/1–1 Mart için harcama kaydı yok; karşılaştırma yapılamıyor/);
  assert.doesNotMatch(h,/NaN|Infinity|∞/);
  await pa.tap('.bni[data-tab="trend"]');
  assert.match(await txt(pa,'#an-cmp'),/— .*taban 0 · yüzde yok/);
});

await step('gelecek ay (Nisan, bugün 30 Mart): planlanan sunumu: günlük ortalama gösterilmez',async()=>{
  await rollTo(pa,at('2026-03-30'));// seçili ay Nisan; bugün 30 Mart → Nisan gelecek ay
  assert.match(await txt(pa,'#an-sum'),/Nisan 2026 · planlanan ₺879,89/);
  assert.match(await txt(pa,'#an-sum'),/Bu ay henüz başlamadı/);
  const w=await txt(pa,'#an-cmp');
  assert.match(w,/Günlük ortalama — .*ay henüz başlamadı/);
  assert.equal(await svgK(pa,'#an-bars','data-actual-k'),0);
  assert.equal(await svgK(pa,'#an-bars','data-planned-k'),87989);
  assert.match(await txt(pa,'#mt-trend'),/Nisan/,'planlanan işlemi olan gelecek ay sekmesi görünür');
});
await pa.screenshot({path:path.join(OUT,'an-4-gelecek-ay.png')});

await step('işlemler: tüm kayıtlar görünür ve aranabilir; kart filtresi ve özet doğru',async()=>{
  await pa.tap('.bni[data-tab="txs"]');
  await pa.tap('#f-btn');await pa.tap('#s-per-chips .ch[data-per=""]');
  await pa.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===8);
  assert.equal(await dk(pa,'#txs-sum .big'),420039,'toplam kayıtlı (tüm zamanlar)');
  assert.match(await txt(pa,'#txs-sum'),/gerçekleşen ₺3\.200,00 · 3 planlanan ₺1\.000,39/);
  await pa.tap('#s-crd-chips .ch[data-cid="c1"]');
  await pa.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===2);
  assert.match(await txt(pa,'#txs-wrap'),/LC Waikiki iade.*\+₺250,00/,'iade + işaretiyle');
  await pa.tap('#s-crd-chips .ch[data-cid=""]');await pa.tap('#f-btn');
  await pa.fill('#s-q','netflix');
  await pa.waitForFunction(()=>document.querySelectorAll('#txs-wrap .txi').length===1);
  await pa.fill('#s-q','');
});
await A.ctx.close();

// --- Senaryo B: yıl geçişi (31 Aralık 2027 → 1 Ocak 2028) ---
const SEED_B=[tx('2027-12-01',500,'Migros','Market','c2'),tx('2027-12-31',80,'Simit','Kafe','c7'),tx('2028-01-01',300,'Yılbaşı yemeği','Yemek','c1'),tx('2027-11-15',1000,'Teknosa','Elektronik','c4')];
const B=await open(SEED_B,at('2027-12-31','23:59'));
await step('yıl geçişi: 31 Aralık 23:59\'da 1 Ocak planlanan; 00:00\'da Ocak gerçekleşen, kıyas Aralık 2027',async()=>{
  assert.equal(await dk(B.page,'#hero-v'),58000);
  assert.doesNotMatch(await txt(B.page,'#home-hero'),/Planlanan/,'1 Ocak, Aralık ayına sayılmaz');
  await rollTo(B.page,at('2028-01-01','00:00'));
  await B.page.evaluate(()=>window.chM(1));
  assert.equal(await dk(B.page,'#hero-v'),30000);
  assert.match(await txt(B.page,'#home-hero'),/Geçen ayın aynı dönemine göre \(1–1 aralık\) ₺200,00 daha az/i,'1 Ocak 300 ↔ 1 Aralık 500');
});
await B.ctx.close();

// --- Senaryo C: hiç işlem yok ---
const C=await open([],at('2026-10-13'));
await step('hiç işlem yok: sıfırlar, geçersiz yüzde yok',async()=>{
  assert.equal(await dk(C.page,'#hero-v'),0);
  const h=await txt(C.page,'#home-hero');
  assert.match(h,/karşılaştırma yapılamıyor/);
  await C.page.tap('.bni[data-tab="trend"]');
  const all=await txt(C.page,'#v-trend');
  assert.doesNotMatch(all,/NaN|Infinity|undefined|null/);
  await C.page.tap('.bni[data-tab="cards"]');
  assert.doesNotMatch(await txt(C.page,'#v-cards'),/NaN|Infinity|undefined/);
});
await C.ctx.close();

await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});
await browser.close();server.close();
for(const r of results)console.log(r[0]==='ok'?'✔':'✘',r[1],r[2]?'— '+r[2]:'');
const f=results.filter(r=>r[0]!=='ok').length;console.log(`\n${results.length-f}/${results.length} geçti`);
process.exit(f?1:0);
