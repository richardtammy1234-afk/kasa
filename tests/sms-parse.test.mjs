// Banka SMS'i ayrıştırıcısı testleri.
// Örnek SMS'ler gerçek banka bildirimlerinin genel biçimini taklit eder; birebir banka metni değildir.
// Bankalar biçimlerini değiştirebildiği için ayrıştırıcı tek bir kalıba bağlı olmamalıdır.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSms,decodeB64,smsId,findAmounts,findLast4,cleanMerchant,splitEnvelope} from '../sms-parse.js';

const cards=[
  {id:'c1',name:'İş Genç',type:'Kredi'},{id:'c2',name:'İş',type:'Kredi'},
  {id:'c3',name:'QNB',type:'Kredi'},{id:'c4',name:'QNB Fix',type:'Kredi'},
  {id:'c5',name:'Enpara',type:'Kredi'},{id:'c6',name:'Hadi',type:'Kredi'},
  {id:'c7',name:'Enpara Banka',type:'Banka'},
];
const categories=['Market','Yemek','Kafe','Ulaşım','Eğlence','Giyim','Sağlık','Fatura','Elektronik','Diğer'].map(n=>({n}));
const today=new Date(2026,10,24,15,0);
const history=[
  {id:'h1',date:'2026-11-20',amount:300,description:'Migros',category:'Market',cardId:'c2'},
  {id:'h2',date:'2026-11-18',amount:120,description:'Kahve Dünyası',category:'Kafe',cardId:'c5'},
  {id:'h3',date:'2026-11-10',amount:90,description:'Boston Kafe',category:'Kafe',cardId:'c1'},
  {id:'h4',date:'2026-11-12',amount:50,description:'Bakkal',category:'Market',cardId:'c1'},
  {id:'h5',date:'2026-11-13',amount:50,description:'Bakkal',category:'Market',cardId:'c1'},
];
const ctx={cards,categories,history,today,fallbackCardId:'c2'};
const env=(s,iso='2026-11-24T14:36:02+03:00')=>`${iso}\n${s}`;

test('İş Bankası benzeri: son 4 hane, iş yeri, tutar, kalan limit atlanır',()=>{
  const r=parseSms(env('1234 ile biten kartinizla 24/11/2026 14:35 tarihinde MIGROS TICARET A.S. isyerinden 450,00 TL tutarinda harcama yapilmistir. Kullanilabilir limitiniz 12.345,67 TL. B002'),{...ctx,map:{'1234':'c1'}});
  assert.equal(r.status,'ok');
  assert.equal(r.txs.length,1);
  const t=r.txs[0];
  assert.equal(t.amount,450);
  assert.equal(t.date,'2026-11-24');
  assert.equal(t.description,'Migros'); // geçmişteki yazım kullanılır
  assert.equal(t.category,'Market');
  assert.equal(t.cardId,'c1');        // eşleştirme tablosundan
  assert.equal(r.cardSource,'map');
  assert.equal(t.src,'sms');
  assert.equal(t.l4,'1234');
});

test('QNB benzeri: "**1234", ek almış iş yeri adı, binlik ayırıcı',()=>{
  const r=parseSms(env("QNB kredi kartinizdan (**5678) 23.11.2026 19:02'de KAHVE DUNYASI'ndan 1.250,50 TL alisveris yapildi."),ctx);
  assert.equal(r.status,'ok');
  const t=r.txs[0];
  assert.equal(t.amount,1250.5);
  assert.equal(t.date,'2026-11-23');
  assert.equal(t.l4,'5678');
  assert.ok(['c3','c4'].includes(t.cardId),'QNB kartlarından biri');
  assert.equal(r.cardSource,'bank');
});

test('Enpara benzeri: tutardan sonra iş yeri ve "işlemi"; banka kartı tercih edilir',()=>{
  const r=parseSms(env('Enpara.com banka kartiniz ile 86,40 TL tutarinda SOK MARKETLER islemi yapildi.'),ctx);
  assert.equal(r.status,'ok');
  const t=r.txs[0];
  assert.equal(t.amount,86.4);
  assert.equal(t.cardId,'c7');
  assert.match(t.description,/^Sok Marketler$/);
  assert.equal(t.category,'Market');
  assert.equal(t.date,'2026-11-24'); // SMS'te tarih yok: alındığı gün
});

test('"İşyeri:" etiketli biçim ve büyük harfli tüm metin',()=>{
  const r=parseSms(env('HADI KARTINIZLA 24.11.2026 TARIHINDE 239,90 TL HARCAMA YAPILMISTIR. ISYERI: NETFLIX.COM. BILGI: 0850'),ctx);
  assert.equal(r.status,'ok');
  assert.equal(r.txs[0].amount,239.9);
  assert.equal(r.txs[0].cardId,'c6');
  assert.match(r.txs[0].description,/^Netflix/);
});

test('taksitli alışveriş taksitlere bölünür ve sonraki aylara yazılır',()=>{
  const r=parseSms(env('5678 ile biten kartinizla 10.11.2026 tarihinde TEKNOSA isyerinden 3 taksitli 1.000,00 TL tutarinda harcama yapilmistir.'),{...ctx,map:{'5678':'c3'}});
  assert.equal(r.status,'ok');
  assert.equal(r.txs.length,3);
  assert.deepEqual(r.txs.map(t=>t.date),['2026-11-10','2026-12-10','2027-01-10']);
  assert.deepEqual(r.txs.map(t=>t.amount),[333.33,333.33,333.34]);
  assert.equal(r.txs.reduce((a,t)=>a+Math.round(t.amount*100),0),100000);
  assert.equal(r.txs[0].description,'Teknosa 1/3. Taksit');
  assert.equal(r.txs[0].category,'Elektronik');
  assert.notEqual(r.txs[0].id,r.txs[1].id);
});

test('aynı SMS aynı kimliği üretir (çift kayıt olmaz), farklı SMS farklı kimlik',()=>{
  const s='1234 ile biten kartinizla 24/11/2026 14:35 tarihinde A101 isyerinden 45,00 TL tutarinda harcama yapilmistir.';
  const a=parseSms(env(s),ctx),b=parseSms(env(s,'2026-11-24T14:40:00+03:00'),ctx);
  assert.equal(a.txs[0].id,b.txs[0].id);
  assert.equal(a.txs[0].id,smsId(s));
  const c=parseSms(env(s.replace('45,00','46,00')),ctx);
  assert.notEqual(a.txs[0].id,c.txs[0].id);
});

test('doğrulama kodu, reddedilen işlem, reklam ve borç ödemesi kaydedilmez',()=>{
  const skips=[
    'MIGROS isyerinde 450,00 TL tutarli islem icin dogrulama kodunuz: 482913. Kimseyle paylasmayiniz.',
    '1234 ile biten kartinizla 120,00 TL tutarindaki isleminiz yetersiz limit nedeniyle gerceklestirilemedi.',
    "Kasim'a ozel kampanya! Market harcamalariniza 100 TL'ye varan ParafPara kazanmak icin KATIL yazip 3340'a gonderin. RET yazip 3340'a gonderin.",
    'Kredi karti borcunuza 5.000,00 TL odeme yapilmistir. Tesekkur ederiz.',
    'Hesabiniza 15.000,00 TL maas yatirildi.',
    'Merhaba, yarin saat 14:00 randevunuzu hatirlatiriz.',
  ];
  for(const s of skips){const r=parseSms(env(s),ctx);assert.equal(r.status,'skip',s+' -> '+r.status+' '+(r.reason||''));}
});

test('iade, nakit çekim, transfer ve yabancı para incelemeye düşer (otomatik kaydedilmez)',()=>{
  const cases=[
    ['1234 ile biten kartiniza MIGROS isyerinden 450,00 TL iade yapilmistir.','iade'],
    ['1234 ile biten kartinizla ATM\'den 1.000,00 TL nakit cekim islemi yapilmistir.','nakit çekim'],
    ['Hesabinizdan Ahmet Y. adina 2.500,00 TL FAST islemi yapilmistir.','para transferi'],
    ['1234 ile biten kartinizla STEAMGAMES.COM isyerinden 19,99 USD tutarinda harcama yapilmistir.','yabancı para'],
  ];
  for(const [s,why] of cases){const r=parseSms(env(s),ctx);assert.equal(r.status,'review',s);assert.equal(r.reason,why,s);}
});

test('yabancı para + TL karşılığı varsa TL tutarı alınır',()=>{
  const r=parseSms(env('**1234 kartinizla SPOTIFY isyerinden 10,99 USD (376,42 TL) tutarinda harcama yapilmistir.'),ctx);
  assert.equal(r.status,'ok');
  assert.equal(r.txs[0].amount,376.42);
  assert.equal(r.txs[0].category,'Eğlence');
});

test('puan / ParafPara tutarı harcama tutarı sanılmaz',()=>{
  const r=parseSms(env('1234 ile biten kartinizla BIM isyerinden 312,75 TL harcama yapilmistir. Bu harcamanizdan 3,13 TL ParafPara kazandiniz.'),ctx);
  assert.equal(r.status,'ok');
  assert.equal(r.txs[0].amount,312.75);
  assert.equal(r.txs[0].category,'Market');
});

test('kart bilinmiyorsa son kullanılan karta yazılır ve tahmin olarak işaretlenir',()=>{
  const r=parseSms(env('Kartinizla 24/11/2026 tarihinde ZARA isyerinden 899,00 TL harcama yapilmistir.'),ctx);
  assert.equal(r.status,'ok');
  assert.equal(r.txs[0].cardId,'c2');
  assert.equal(r.cardSource,'fallback');
  assert.equal(r.txs[0].category,'Giyim');
});

test('iş yeri bulunamazsa "Kart harcaması" olarak kaydedilir',()=>{
  const r=parseSms(env('1234 ile biten kartinizla 75,00 TL harcama yapilmistir.'),ctx);
  assert.equal(r.status,'ok');
  assert.equal(r.txs[0].description,'Kart harcaması');
  assert.equal(r.merchantFound,false);
  assert.equal(r.txs[0].category,'Diğer');
});

test('SMS tarihi alındığı günden çok farklıysa alındığı gün kullanılır',()=>{
  const r=parseSms(env('1234 ile biten kartinizla 01.01.2025 tarihinde A101 isyerinden 45,00 TL harcama yapilmistir.'),ctx);
  assert.equal(r.txs[0].date,'2026-11-24');
});

test('Base64 (UTF-8) çözme ve zarf satırı',()=>{
  const s='2026-11-24T09:15:00+03:00\nİş Bankası: ÇİÇEKSEPETİ 150,00 TL';
  const b=Buffer.from(s,'utf8').toString('base64');
  assert.equal(decodeB64(b),s);
  assert.equal(decodeB64(b.match(/.{1,20}/g).join('\n')),s); // satır sonlu Base64 da çözülür
  assert.equal(decodeB64('bozuk!!'),null);
  assert.deepEqual(splitEnvelope(s),{receivedDate:'2026-11-24',text:'İş Bankası: ÇİÇEKSEPETİ 150,00 TL'});
  assert.deepEqual(splitEnvelope('zarfsız metin'),{receivedDate:null,text:'zarfsız metin'});
});

test('yardımcılar: tutar, son 4 hane, iş yeri temizleme',()=>{
  assert.deepEqual(findAmounts('1.250,50 TL ve TL 99,90 ve 2026').filter(a=>!a.excluded).map(a=>a.value),[1250.5,99.9]);
  assert.equal(findLast4('kart no 5400 **** **** 9876 ile'),'9876');
  assert.equal(findLast4('4321 nolu kartiniz'),'4321');
  assert.equal(findLast4('tarih 24.11.2026'),null);
  assert.equal(cleanMerchant('IYZICO/YEMEKSEPETI ISTANBUL TR'),'Yemeksepeti');
  assert.equal(cleanMerchant('PAYPAL *STEAM'),'Steam');
  assert.equal(cleanMerchant('H&M KADIKOY'),'H&M');
  assert.equal(cleanMerchant('A101 YENI MAGAZACILIK A.S.'),'A101 Yeni Magazacilik');
});
