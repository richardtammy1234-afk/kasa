// analytics.js birim testleri — yalnızca sahte veri.
import test from 'node:test';
import assert from 'node:assert/strict';
import {toK,sumK,localDateKey,monthKeyOf,daysInMonth,addMonths,isPlanned,classify,monthState,elapsedDays,split,groupBy,
  compareMonth,monthReport,monthSeries,completedMonthsAvgK} from '../analytics.js';

let n=0;const tx=(date,amount,o={})=>({id:'t'+(n++),date,amount,description:o.d||'Sahte',category:o.c||'Market',cardId:o.card||'c1'});
const TODAY='2026-10-13';

test('1-3: geçmiş, bugün ve gelecek tarihli işlem doğru sınıflanır',()=>{
  assert.equal(classify(tx('2026-10-12',10),TODAY),'actual');
  assert.equal(classify(tx(TODAY,10),TODAY),'actual','bugünün işlemi gerçekleşendir');
  assert.equal(classify(tx('2026-10-14',10),TODAY),'planned');
  assert.equal(classify(tx('2027-01-01',10),TODAY),'planned');
});

test('4: planlanan işlem ertesi gün veriyi değiştirmeden gerçekleşene geçer',()=>{
  const t=tx('2026-10-23',229.99);const before=JSON.stringify(t);
  const r22=monthReport([t],'2026-10','2026-10-22');
  assert.deepEqual([r22.actualK,r22.plannedK],[0,22999]);
  const r23=monthReport([t],'2026-10','2026-10-23');
  assert.deepEqual([r23.actualK,r23.plannedK],[22999,0]);
  assert.equal(JSON.stringify(t),before,'işlem nesnesi değişmemeli');
});

test('5-6: ay ve yıl geçişi',()=>{
  assert.equal(addMonths('2026-10',1),'2026-11');
  assert.equal(addMonths('2026-12',1),'2027-01');
  assert.equal(addMonths('2026-01',-1),'2025-12');
  assert.equal(addMonths('2026-03',-14),'2025-01');
  // 31 Aralık'taki işlem Aralık'a, 1 Ocak'taki Ocak'a ait; 31 Aralık'ta 1 Ocak planlanandır
  const list=[tx('2026-12-31',100),tx('2027-01-01',50)];
  const dec=monthReport(list,'2026-12','2026-12-31');
  assert.deepEqual([dec.actualK,dec.plannedK,dec.state],[10000,0,'current']);
  const jan=monthReport(list,'2027-01','2026-12-31');
  assert.deepEqual([jan.actualK,jan.plannedK,jan.state,jan.dailyAvgK],[0,5000,'future',null]);
  // Ocak'ın karşılaştırması bir önceki yılın Aralık'ı ile
  const c=compareMonth(list,'2027-01','2027-01-01');
  assert.equal(c.prevKey,'2026-12');assert.equal(c.prevK,0,'Aralık 1..1 gününde harcama yok');assert.equal(c.curK,5000);
});

test('7: Şubat ve artık yıllar',()=>{
  assert.equal(daysInMonth('2026-02'),28);
  assert.equal(daysInMonth('2028-02'),29);
  assert.equal(daysInMonth('2100-02'),28,'100e bölünüp 400e bölünmeyen yıl artık değil');
  assert.equal(daysInMonth('2000-02'),29);
  // Tamamlanmış artık Şubat'ta günlük ortalama 29 güne bölünür
  const r=monthReport([tx('2028-02-29',290)],'2028-02','2028-03-05');
  assert.equal(r.state,'past');assert.equal(r.elapsed,29);assert.equal(r.dailyAvgK,1000);
});

test('8: Europe/Istanbul gece yarısı sınırı (UTC günü farklıyken)',()=>{
  // 12 Ekim 21:30 UTC = 13 Ekim 00:30 İstanbul
  const at=new Date('2026-10-12T21:30:00Z');
  assert.equal(localDateKey(at,'Europe/Istanbul'),'2026-10-13');
  assert.equal(localDateKey(at,'UTC'),'2026-10-12');
  const t=tx('2026-10-13',75);
  assert.equal(classify(t,localDateKey(at,'Europe/Istanbul')),'actual','İstanbul\'da bugün olan işlem gerçekleşendir');
  assert.equal(classify(t,localDateKey(at,'UTC')),'planned','UTC kullanılsaydı yanlışlıkla planlanan sayılırdı');
  // 13 Ekim 23:59 İstanbul hâlâ 13 Ekim
  assert.equal(localDateKey(new Date('2026-10-13T20:59:00Z'),'Europe/Istanbul'),'2026-10-13');
  assert.equal(localDateKey(new Date('2026-10-13T21:00:00Z'),'Europe/Istanbul'),'2026-10-14');
  // Ay anahtarı tarih metninden alınır: saat dilimi ayı kaydırmaz
  assert.equal(monthKeyOf('2026-11-01'),'2026-11');
});

test('9: hiç işlem yokken her şey sıfır, ortalama 0, yüzde yok',()=>{
  const r=monthReport([],'2026-10',TODAY);
  assert.deepEqual([r.actualK,r.plannedK,r.totalK,r.totalN,r.dailyAvgK],[0,0,0,0,0]);
  assert.deepEqual(r.cats,[]);assert.equal(r.cmp.pct,null);
  assert.equal(r.dailyActualK.length,31);
});

test('10: önceki ay harcaması sıfırsa geçersiz/sonsuz yüzde verilmez',()=>{
  const c=compareMonth([tx('2026-10-05',500)],'2026-10',TODAY);
  assert.equal(c.prevK,0);assert.equal(c.pct,null);assert.equal(c.diffK,50000);
  assert.ok(Number.isFinite(c.diffK));
});

test('11: iade (negatif tutar) toplamdan düşülür',()=>{
  const list=[tx('2026-10-02',1000),tx('2026-10-03',-250,{d:'İade'}),tx('2026-10-20',-100)];
  const r=monthReport(list,'2026-10',TODAY);
  assert.equal(r.actualK,75000);assert.equal(r.plannedK,-10000);assert.equal(r.totalK,65000);
  assert.equal(r.actualN,2);assert.equal(r.dailyAvgK,Math.round(75000/13));
});

test('12: kısa önceki ayla karşılaştırma (31 Mart ↔ Şubat) ve ay başından bugüne',()=>{
  const list=[tx('2026-02-28',100),tx('2026-03-30',40),tx('2026-03-31',60)];
  const c=compareMonth(list,'2026-03','2026-03-31');
  assert.equal(c.mode,'mtd');assert.equal(c.curTo,31);assert.equal(c.prevTo,28);assert.equal(c.prevClamped,true);
  assert.equal(c.curK,10000);assert.equal(c.prevK,10000);assert.equal(c.pct,0);
  // 13 Ekim: Eylül'ün yalnızca 1–13'ü sayılır, 20 Eylül sayılmaz
  const l2=[tx('2026-09-10',300),tx('2026-09-20',700),tx('2026-10-05',600),tx('2026-10-20',999)];
  const c2=compareMonth(l2,'2026-10',TODAY);
  assert.deepEqual([c2.curK,c2.prevK,c2.prevTo,c2.prevClamped],[60000,30000,13,false]);
  assert.equal(c2.pct,100);
  // Tamamlanmış ay: tam ay ↔ tam ay
  const c3=compareMonth(l2,'2026-09','2026-10-13');
  assert.equal(c3.mode,'full');assert.equal(c3.curK,100000);assert.equal(c3.prevK,0);
  // Gelecek ay: karşılaştırma yok
  assert.equal(compareMonth(l2,'2026-11',TODAY),null);
});

test('13: gerçekleşen + planlanan = toplam kayıtlı (kategori, kart, gün ve ay dahil)',()=>{
  const list=[];const cats=['Market','Kafe','Fatura'],cardsL=['c1','c2','c3'];
  for(let d=1;d<=31;d++)for(let i=0;i<3;i++)list.push(tx(`2026-10-${String(d).padStart(2,'0')}`,0.1*(i+1)+d*3.33,{c:cats[(d+i)%3],card:cardsL[(d*i)%3]}));
  const r=monthReport(list,'2026-10',TODAY);
  assert.equal(r.actualK+r.plannedK,r.totalK);
  assert.equal(r.totalK,sumK(list));
  assert.equal(r.dailyActualK.reduce((a,b)=>a+b,0),r.actualK,'günlük gerçekleşen çubukların toplamı = gerçekleşen');
  assert.equal(r.dailyPlannedK.reduce((a,b)=>a+b,0),r.plannedK,'günlük planlanan çubukların toplamı = planlanan');
  assert.ok(r.dailyPlannedK.slice(0,13).every(v=>v===0),'bugüne kadarki günlerde planlanan olmaz');
  assert.ok(r.dailyActualK.slice(13).every(v=>v===0),'gelecek günlerde gerçekleşen olmaz');
  for(const g of [...r.cats,...r.cards])assert.equal(g.actualK+g.plannedK,g.totalK);
  assert.equal(r.cats.reduce((a,g)=>a+g.actualK,0),r.actualK);
  assert.equal(r.cards.reduce((a,g)=>a+g.plannedK,0),r.plannedK);
  const s=monthSeries(list,'2026-10',6,TODAY);
  assert.equal(s.length,6);assert.deepEqual(s.map(x=>x.key),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
  assert.equal(s[5].actualK,r.actualK);assert.equal(s[5].plannedK,r.plannedK);
});

test('kuruş hassasiyeti: kayan nokta hatası birikmez',()=>{
  assert.equal(0.1+0.2===0.3,false);
  assert.equal(sumK([{amount:0.1},{amount:0.2}]),30);
  assert.equal(sumK(Array.from({length:1000},()=>({amount:0.01}))),1000);
  assert.equal(toK(1.005),101);assert.equal(toK('x'),0);assert.equal(toK(undefined),0);
});

test('günlük ortalama: içinde bulunulan / geçmiş / gelecek ay',()=>{
  const list=[tx('2026-10-01',130),tx('2026-10-20',1000),tx('2026-09-15',300),tx('2026-11-02',50)];
  const cur=monthReport(list,'2026-10',TODAY);
  assert.equal(cur.elapsed,13);assert.equal(cur.dailyAvgK,1000,'yalnızca gerçekleşen / geçen gün: 130 / 13 = 10');
  const past=monthReport(list,'2026-09',TODAY);
  assert.equal(past.elapsed,30);assert.equal(past.dailyAvgK,1000,'300 / 30 = 10');
  const fut=monthReport(list,'2026-11',TODAY);
  assert.equal(fut.dailyAvgK,null);assert.equal(fut.plannedK,5000);
  assert.equal(elapsedDays('2026-11',TODAY),0);assert.equal(monthState('2026-11',TODAY),'future');
});

test('gruplama ve tamamlanmış ay ortalaması',()=>{
  const list=[tx('2026-10-01',10,{c:'Kafe'}),tx('2026-10-02',30,{c:'Market'}),tx('2026-10-25',500,{c:'Kafe'})];
  const g=groupBy(list,t=>t.category,TODAY);
  assert.equal(g[0].key,'Market','gerçekleşene göre sıralı');assert.equal(g[1].plannedK,50000);
  const s=[{state:'past',actualK:100},{state:'past',actualK:0},{state:'past',actualK:300},{state:'current',actualK:9999}];
  assert.equal(completedMonthsAvgK(s),200,'boş ay ve içinde bulunulan ay hariç');
  assert.equal(completedMonthsAvgK([]),null);
  assert.equal(split(list,TODAY).totalN,3);assert.equal(isPlanned(list[2],TODAY),true);
});
