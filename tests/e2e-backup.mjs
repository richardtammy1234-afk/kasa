// Yedek sayfası (yedek.html) ve kart ayarlarını da geri getiren geri yükleme — emülatör testi.
// Senaryolar: salt okunur yedek, dosya doğrulama, BOŞ hesaba (felaket) geri yükleme,
// MEVCUT kartları olan hesaba geri yükleme, uygulama içi yedekle ikinci hesaba geri yükleme.
// Tüm veriler sahtedir; üretime istek gitmez. Çalıştırma: npm run test:emulator
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,putDoc,patchDoc,delDoc,snapshot,waitFor,runner} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const BASE=`http://127.0.0.1:${server.address().port}/`;
const errors=[];
const watch=page=>{page.on('pageerror',e=>errors.push(e.message));};
const dialogs=[];
const answerDialogs=page=>page.on('dialog',d=>{dialogs.push(d.message());d.accept();});

const A=await newBrowser('kasa-test-A');
const app=await A.ctx.newPage();watch(app);answerDialogs(app);
await app.goto(BASE);
await app.tap('.google-btn');
await app.waitForSelector('#app',{state:'visible'});
const uid=await newestUid();
const C=`users/${uid}/cards`,T=`users/${uid}/txs`;
await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);

// "Gerçek kullanım" gibi sahte veri: kart ayarları değiştirilmiş, bir varsayılan kart silinmiş, özel kart eklenmiş
await patchDoc(C,'c1',{id:'c1',name:'İş Genç Platinum',type:'Kredi',color:'#111111',limit:40000,statementDay:5,dueDay:15});
await patchDoc(C,'c3',{id:'c3',name:'QNB',type:'Kredi',color:'#10b981',limit:25000,statementDay:null,dueDay:28});
await delDoc(C,'c4');
await putDoc(C,{id:'cX',name:'Garanti Bonus',type:'Kredi',color:'#22c55e',limit:30000,statementDay:10,dueDay:20});
const cardsFor=['c1','c2','c3','c4','c5','c6','c7','cX'];
for(let i=0;i<40;i++)await putDoc(T,{id:'t'+i,date:`2026-${String(1+(i%9)).padStart(2,'0')}-${String(1+(i%27)).padStart(2,'0')}`,amount:i%2?12.75+i:100+i,description:'Sahte işlem '+i,category:['Market','Kafe','Ulaşım','Fatura'][i%4],cardId:cardsFor[i%8]});
const ORIG=await snapshot(uid);
assert.equal(Object.keys(ORIG.cards).length,7);assert.equal(Object.keys(ORIG.txs).length,40);

let backupPath,backup;
const page=await A.ctx.newPage();watch(page);

await step('yedek sayfası Kasa oturumunu kullanır: ayrıca giriş istemez',async()=>{
  await page.goto(BASE+'yedek.html');
  await page.waitForSelector('#box-backup:not([hidden])',{timeout:15000});
  assert.equal(await page.isVisible('#box-login'),false);
});

await step('tek dokunuşla yedek iner; veritabanında hiçbir şey değişmez',async()=>{
  const [dl]=await Promise.all([page.waitForEvent('download',{timeout:20000}),page.tap('#btn-backup')]);
  assert.match(dl.suggestedFilename(),/^kasa-yedek-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  backupPath=path.join(OUT,'emu-yedek-sayfasi.json');await dl.saveAs(backupPath);
  backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  await page.waitForFunction(()=>/Yedek indirildi/.test(document.getElementById('msg').textContent));
  assert.match(await page.textContent('#msg'),/7 kart, 40 işlem/);
  assert.deepEqual(await snapshot(uid),ORIG);
});

await step('yedek tüm kartları (tüm ayarlarıyla), tüm işlemleri ve kimlikleri içerir',async()=>{
  assert.equal(backup.app,'kasa');assert.equal(backup.counts.cards,7);assert.equal(backup.counts.txs,40);
  const byId=a=>Object.fromEntries(a.map(x=>[x._docId||x.id,x]));
  assert.deepEqual(byId(backup.cards),ORIG.cards);
  assert.deepEqual(byId(backup.txs),ORIG.txs);
  assert.deepEqual(byId(backup.cards).c1,{id:'c1',name:'İş Genç Platinum',type:'Kredi',color:'#111111',limit:40000,statementDay:5,dueDay:15});
  assert.match(backup.sha256,/^[0-9a-f]{64}$/);
});

await step('doğrulama: aynı dosya birebir eşleşir',async()=>{
  await page.setInputFiles('#verify-file',backupPath);
  await page.waitForFunction(()=>/birebir içeriyor|eşleşmiyor|Doğrulanamadı/.test(document.getElementById('vmsg').textContent));
  assert.match(await page.textContent('#vmsg'),/birebir içeriyor/);
});

await step('doğrulama: değiştirilmiş veya eksik dosyayı yakalar',async()=>{
  const bad=structuredClone(backup);bad.txs[3].amount+=1;bad.cards=bad.cards.filter(c=>c.id!=='cX');
  const p=path.join(OUT,'emu-bozuk.json');fs.writeFileSync(p,JSON.stringify(bad));
  await page.setInputFiles('#verify-file',p);
  await page.waitForFunction(()=>/eşleşmiyor/.test(document.getElementById('vmsg').textContent));
  const t=await page.textContent('#vreport');
  assert.match(t,/Dosyada eksik kart \/ işlem1 \/ 0/);
  assert.match(t,/Alanları farklı kart \/ işlem0 \/ 1/);
  assert.match(t,/Parmak iziTUTMUYOR/);
});

await step('BOŞ HESAP: her şey silindikten sonra geri yükleme kart ayarları dahil her şeyi geri getirir',async()=>{
  // Felaket: tüm kart ve işlemler silinir
  for(const id of Object.keys(ORIG.txs))await delDoc(T,id);
  for(const id of Object.keys(ORIG.cards))await delDoc(C,id);
  await app.reload();await app.waitForSelector('#app',{state:'visible'});
  // Uygulama boş hesapta varsayılan 7 kartı yeniden oluşturur
  await waitFor(async()=>Object.keys((await snapshot(uid)).cards).length===7);
  await app.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===7);
  const seeded=await snapshot(uid);assert.equal(seeded.cards.c1.name,'İş Genç');
  await app.tap('.hico');
  dialogs.length=0;
  await app.setInputFiles('#bk-file',backupPath);
  await app.waitForFunction(()=>/geri yüklendi/.test(document.getElementById('bk-fb').textContent),null,{timeout:20000});
  assert.match(dialogs[0],/40 işlem ve 1 kart eklenecek/);
  assert.match(dialogs[0],/2 varsayılan kart \(hiç değiştirilmemiş\) yedekteki ayarlarına döndürülecek: İş Genç Platinum, QNB/);
  const now=await snapshot(uid);
  for(const [id,c] of Object.entries(ORIG.cards))assert.deepEqual(now.cards[id],c,`kart ${id} ayarları geri gelmeli`);
  assert.deepEqual(now.txs,ORIG.txs);
  // Tek fark: kullanıcının eskiden sildiği varsayılan kart (c4) uygulama tarafından yeniden oluşturuldu
  assert.deepEqual(Object.keys(now.cards).filter(id=>!ORIG.cards[id]),['c4']);
  assert.equal(now.cards.c4.name,'QNB Fix');
});

await step('MEVCUT KARTLAR: kullanıcının değiştirdiği karta ve mevcut işlemlere dokunulmaz, yalnızca eksikler eklenir',async()=>{
  // Yedekten sonra kullanıcı c1'i yeniden adlandırdı, yeni işlem girdi, bir işlemi sildi
  await patchDoc(C,'c1',{id:'c1',name:'Yeni Ad',type:'Kredi',color:'#000000',limit:1000,statementDay:1,dueDay:2});
  await putDoc(T,{id:'yeni1',date:'2026-10-01',amount:55,description:'Yedekten sonra girilen',category:'Kafe',cardId:'c2'});
  await delDoc(T,'t5');
  await app.reload();await app.waitForSelector('#app',{state:'visible'});
  await app.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===8);
  const before=await snapshot(uid);
  await app.tap('.hico');
  dialogs.length=0;
  await app.setInputFiles('#bk-file',backupPath);
  await app.waitForFunction(()=>/geri yüklendi/.test(document.getElementById('bk-fb').textContent),null,{timeout:20000});
  assert.match(dialogs[0],/1 işlem ve 0 kart eklenecek/);
  assert.doesNotMatch(dialogs[0],/varsayılan kart/);
  assert.match(dialogs[0],/1 kart sende farklı ayarlı; olduğu gibi kalacak/);
  const now=await snapshot(uid);
  assert.deepEqual(now.cards,before.cards,'hiçbir kart değişmemeli');
  assert.equal(now.cards.c1.name,'Yeni Ad');
  assert.deepEqual(now.txs.t5,ORIG.txs.t5,'silinen işlem geri gelmeli');
  assert.deepEqual(now.txs.yeni1,before.txs.yeni1,'yeni işlem korunmalı');
  for(const id of Object.keys(before.txs))assert.deepEqual(now.txs[id],before.txs[id]);
  assert.match(await app.textContent('#bk-fb'),/1 kart sende farklı ayarlı olduğu için olduğu gibi bırakıldı/);
});

await step('uygulama içi "Yedek indir" dosyası ikinci (boş) hesaba kart ayarlarıyla birlikte yüklenir',async()=>{
  const [dl]=await Promise.all([app.waitForEvent('download'),app.tap('text=Yedek indir')]);
  const p=path.join(OUT,'emu-uygulama-yedegi.json');await dl.saveAs(p);
  const srcNow=await snapshot(uid);
  const B=await newBrowser('kasa-test-B');
  const pb=await B.ctx.newPage();watch(pb);answerDialogs(pb);
  await pb.goto(BASE);await pb.tap('.google-btn');await pb.waitForSelector('#app',{state:'visible'});
  const uidB=await newestUid();
  await waitFor(async()=>Object.keys((await snapshot(uidB)).cards).length===7);
  await pb.waitForFunction(()=>document.querySelectorAll('#f-crd option').length===7);
  await pb.tap('.hico');
  await pb.setInputFiles('#bk-file',p);
  await pb.waitForFunction(()=>/geri yüklendi/.test(document.getElementById('bk-fb').textContent),null,{timeout:20000});
  const b=await snapshot(uidB);
  for(const [id,c] of Object.entries(srcNow.cards))assert.deepEqual(b.cards[id],c,`B kartı ${id}`);
  assert.deepEqual(b.txs,srcNow.txs);
  assert.deepEqual(await snapshot(uid),srcNow,'A hesabı değişmemeli');
  await B.browser.close();
});

await step('üretime veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfalarda JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});

await page.screenshot({path:path.join(OUT,'yedek-sayfasi.png')});
await A.browser.close();server.close();
process.exit(finish());
