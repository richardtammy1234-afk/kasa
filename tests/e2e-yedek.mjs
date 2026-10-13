// yedek.html uçtan uca testi — GERÇEK Firebase SDK 10.11.0 + yerel Auth/Firestore emülatörü.
// Tüm veriler sahtedir; üretime istek gitmez. Çalıştırma: npm run test:emulator
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,OUT,serve,newBrowser,external,resetEmulators,newestUid,putDoc,patchDoc,snapshot,waitFor,runner} from './emulator/harness.mjs';

const {step,finish}=runner();
await resetEmulators();
const server=await serve(ROOT);
const URL_=`http://127.0.0.1:${server.address().port}/yedek.html`;
const errors=[];

// Firestore emülatörüne giden her isteği say (okuma yalnızca kullanıcı düğmeye basınca başlamalı)
const track=page=>{const r={fs:0};page.on('request',q=>{if(q.url().startsWith('http://127.0.0.1:8080/'))r.fs++;});page.on('pageerror',e=>errors.push(e.message));return r;};

const A=await newBrowser('yedek-test-A');
const page=await A.ctx.newPage();
const net=track(page);
let uid,ORIG,backup,backupPath;

await step('giriş yapmamış kullanıcı: yalnızca giriş düğmesi görünür, Firestore\'a hiç istek gitmez',async()=>{
  await page.goto(URL_);
  await page.waitForSelector('#box-login:not([hidden])');
  assert.equal(await page.isVisible('#box-backup'),false);
  assert.equal(await page.isVisible('#box-verify'),false);
  assert.equal((await page.textContent('#who')).trim(),'');
  await page.waitForTimeout(1000);
  assert.equal(net.fs,0);
});

await step('giriş yapıldıktan sonra da okuma kendiliğinden başlamaz',async()=>{
  await page.tap('#btn-login');
  await page.waitForSelector('#box-backup:not([hidden])');
  uid=await newestUid();
  // Sahte "üretim" verisi: ayarlı kartlar ve işlemler (yönetici erişimiyle, yalnızca test kurulumu)
  const C=`users/${uid}/cards`,T=`users/${uid}/txs`;
  await putDoc(C,{id:'c1',name:'İş Genç Platinum',type:'Kredi',color:'#111111',limit:40000,statementDay:5,dueDay:15});
  await putDoc(C,{id:'c2',name:'İş',type:'Kredi',color:'#3b82f6',limit:0,statementDay:null,dueDay:null});
  await putDoc(C,{id:'cX',name:'Garanti Bonus',type:'Kredi',color:'#22c55e',limit:30000,statementDay:10,dueDay:20});
  for(let i=0;i<25;i++)await putDoc(T,{id:'t'+i,date:`2026-0${1+(i%9)}-${String(1+(i%27)).padStart(2,'0')}`,amount:i%2?12.75+i:100+i,description:'Sahte '+i,category:'Market',cardId:['c1','c2','cX','cSilinmis'][i%4]});
  ORIG=await snapshot(uid);
  await page.waitForTimeout(1000);
  assert.equal(net.fs,0,'düğmeye basılmadan okuma olmamalı');
  assert.equal(await page.isVisible('#report'),false);
});

await step('"Yedeği indir": dosya iner, veritabanında hiçbir şey değişmez',async()=>{
  const [dl]=await Promise.all([page.waitForEvent('download',{timeout:20000}),page.tap('#btn-backup')]);
  assert.match(dl.suggestedFilename(),/^kasa-yedek-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  backupPath=path.join(OUT,'yedek-testi.json');await dl.saveAs(backupPath);
  backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  await page.waitForFunction(()=>/Yedek indirildi/.test(document.getElementById('msg').textContent));
  assert.match(await page.textContent('#msg'),/3 kart, 25 işlem/);
  assert.ok(net.fs>0);
  assert.deepEqual(await snapshot(uid),ORIG);
});

await step('dosya tüm kartları (tüm ayarlarıyla), tüm işlemleri ve kimlikleri birebir içerir',async()=>{
  const byId=a=>Object.fromEntries(a.map(x=>[x._docId||x.id,x]));
  assert.equal(backup.app,'kasa');assert.equal(backup.projectId,'demo-kasa');
  assert.deepEqual(backup.counts,{cards:3,txs:25});
  assert.deepEqual(byId(backup.cards),ORIG.cards);
  assert.deepEqual(byId(backup.txs),ORIG.txs);
  assert.match(backup.sha256,/^[0-9a-f]{64}$/);
  assert.match(await page.textContent('#report'),/Ayarları dolu kart \(limit \/ ekstre \/ son ödeme\)2/);
  assert.match(await page.textContent('#report'),/Silinmiş karta bağlı işlem \(bilgi\)6/);
});

await step('ekranda yalnızca sayılar var; tutar veya açıklama gösterilmez',async()=>{
  const text=await page.textContent('body');
  assert.ok(!text.includes('Sahte'));assert.ok(!text.includes('Garanti Bonus'));assert.ok(!/112[.,]75/.test(text));
});

await step('doğrulama: aynı dosya birebir eşleşir; değiştirilmiş dosya yakalanır',async()=>{
  await page.setInputFiles('#verify-file',backupPath);
  await page.waitForFunction(()=>/birebir içeriyor|eşleşmiyor/.test(document.getElementById('vmsg').textContent));
  assert.match(await page.textContent('#vmsg'),/birebir içeriyor/);
  const bad=structuredClone(backup);bad.cards.find(c=>c.id==='c1').limit=1;bad.txs.pop();
  const p=path.join(OUT,'yedek-bozuk.json');fs.writeFileSync(p,JSON.stringify(bad));
  await page.setInputFiles('#verify-file',p);
  await page.waitForFunction(()=>/eşleşmiyor/.test(document.getElementById('vmsg').textContent));
  const t=await page.textContent('#vreport');
  assert.match(t,/Dosyada eksik kart \/ işlem0 \/ 1/);assert.match(t,/Alanları farklı kart \/ işlem1 \/ 0/);assert.match(t,/Parmak iziTUTMUYOR/);
  assert.deepEqual(await snapshot(uid),ORIG);
});

await step('oturum kapanınca sonuçlar ve indirilebilir dosya ekrandan silinir',async()=>{
  await page.evaluate(async()=>{const {getAuth,signOut}=await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js');const {getApp}=await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js');await signOut(getAuth(getApp()));});
  await page.waitForSelector('#box-login:not([hidden])');
  assert.equal(await page.isVisible('#box-backup'),false);
  assert.equal(await page.getAttribute('#dl-again','href'),null);
  assert.equal(await page.$$eval('#report tbody tr',r=>r.length),0);
});

await step('başka bir kullanıcı yalnızca kendi verisini alır; A\'nın verisine erişemez',async()=>{
  const B=await newBrowser('yedek-test-B');const pb=await B.ctx.newPage();track(pb);
  await pb.goto(URL_);await pb.tap('#btn-login');await pb.waitForSelector('#box-backup:not([hidden])');
  const uidB=await newestUid();
  await putDoc(`users/${uidB}/txs`,{id:'b1',date:'2026-10-01',amount:9,description:'B işlemi',category:'Kafe',cardId:'c1'});
  const [dl]=await Promise.all([pb.waitForEvent('download',{timeout:20000}),pb.tap('#btn-backup')]);
  const fb=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  assert.deepEqual(fb.counts,{cards:0,txs:1});assert.equal(fb.txs[0].id,'b1');
  const denied=await pb.evaluate(async a=>{
    const G='https://www.gstatic.com/firebasejs/10.11.0/';
    const {getApp}=await import(G+'firebase-app.js');const {getFirestore,collection,getDocs}=await import(G+'firebase-firestore.js');
    try{await getDocs(collection(getFirestore(getApp()),`users/${a}/txs`));return 'okundu';}catch(e){return e.code;}
  },uid);
  assert.equal(denied,'permission-denied');
  await B.browser.close();
});

await step('üretim Firebase\'ine veya başka bir dış adrese istek gitmedi',async()=>{assert.deepEqual(external,[]);});
await step('sayfada JavaScript hatası yok',async()=>{assert.deepEqual(errors,[]);});

await A.browser.close();server.close();
process.exit(finish());
