// Çalıştırma: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuick,parseAmount,localDate,frequentDescriptions,norm,guessCategory} from '../quick-parse.js';

// Sahte (test) veriler — gerçek kullanıcı verisi değil
const CARDS=[
  {id:'c1',name:'İş Genç'},{id:'c2',name:'İş'},{id:'c3',name:'QNB'},{id:'c4',name:'QNB Fix'},
  {id:'c5',name:'Enpara'},{id:'c6',name:'Hadi'},{id:'c7',name:'Enpara Banka'},
];
const CATS=['Market','Yemek','Kafe','Ulaşım','Eğlence','Giyim','Sağlık','Fatura','Elektronik','Diğer'].map(n=>({n}));
const ctx={cards:CARDS,categories:CATS};

test('örnek: "Migros 450 İş Bankası"',()=>{
  const r=parseQuick('Migros 450 İş Bankası',ctx);
  assert.equal(r.description,'Migros');
  assert.equal(r.amount,450);
  assert.equal(r.category,'Market');
  assert.equal(r.cardId,'c2');
  assert.equal(r.unknownBank,null);
});

test('örnek: "Kahve 120" — kart yok',()=>{
  const r=parseQuick('Kahve 120',ctx);
  assert.deepEqual([r.description,r.amount,r.category,r.cardId],['Kahve',120,'Kafe',null]);
});

test('örnek: "Benzin 1500 Garanti" — kayıtlı olmayan banka uyarısı',()=>{
  const r=parseQuick('Benzin 1500 Garanti',ctx);
  assert.equal(r.description,'Benzin');
  assert.equal(r.amount,1500);
  assert.equal(r.category,'Ulaşım');
  assert.equal(r.cardId,null);
  assert.equal(r.unknownBank,'Garanti');
});

test('"Benzin 1500 Garanti" — Garanti kartı varsa eşleşir',()=>{
  const r=parseQuick('Benzin 1500 Garanti',{...ctx,cards:[...CARDS,{id:'g',name:'Garanti Bonus'}]});
  assert.equal(r.cardId,'g');assert.equal(r.unknownBank,null);assert.equal(r.description,'Benzin');
});

test('uzun kart adı önceliklidir',()=>{
  assert.equal(parseQuick('Market 300 Enpara Banka',ctx).cardId,'c7');
  assert.equal(parseQuick('Market 300 Enpara',ctx).cardId,'c5');
  assert.equal(parseQuick('Yemek 250 İş Genç',ctx).cardId,'c1');
  assert.equal(parseQuick('Yemek 250 qnb fix',ctx).cardId,'c4');
  assert.equal(parseQuick('Yemek 250 QNB',ctx).cardId,'c3');
});

test('Türkçe karakter olmadan yazım ve eş adlar',()=>{
  assert.equal(parseQuick('migros 450 is bankasi',ctx).cardId,'c2');
  assert.equal(parseQuick('Migros 450 Maximum',ctx).cardId,'c2');
  assert.equal(parseQuick('Migros 450 İş Bankası kartı ile',ctx).description,'Migros');
});

test('kart tutardan önce, açıklamanın sonunda',()=>{
  const r=parseQuick('Migros Enpara 450',ctx);
  assert.equal(r.cardId,'c5');assert.equal(r.description,'Migros');
});

test('"İş yemeği" kart olarak algılanmaz',()=>{
  const r=parseQuick('İş yemeği 300',ctx);
  assert.equal(r.cardId,null);assert.equal(r.description,'İş yemeği');assert.equal(r.category,'Yemek');
});

test('tutar biçimleri',()=>{
  assert.equal(parseAmount('450'),450);
  assert.equal(parseAmount('1.500'),1500);
  assert.equal(parseAmount('1500,50'),1500.5);
  assert.equal(parseAmount('1.250,75'),1250.75);
  assert.equal(parseAmount('1,250.75'),1250.75);
  assert.equal(parseAmount('45.5'),45.5);
  assert.equal(parseAmount('2,500'),2500);
  assert.equal(parseAmount('₺120'),120);
  assert.equal(parseAmount('120TL'),120);
  assert.equal(parseAmount('120₺'),120);
  assert.equal(parseAmount('0'),null);
  assert.equal(parseAmount('abc'),null);
  assert.equal(parseAmount('1.2.3'),null);
});

test('ayrı yazılan para birimi açıklamaya karışmaz',()=>{
  assert.equal(parseQuick('Kahve 120 TL',ctx).description,'Kahve');
  assert.equal(parseQuick('Kahve ₺ 120',ctx).description,'Kahve');
  assert.equal(parseQuick('Kahve 120 TL',ctx).amount,120);
});

test('birden çok sayı: para birimi işaretli olan / son sayı tutardır',()=>{
  assert.equal(parseQuick('A101 2 ekmek 45',ctx).amount,45);
  assert.equal(parseQuick('3 kahve 240tl',ctx).amount,240);
});

test('tutarsız giriş: tutar null',()=>{
  const r=parseQuick('Migros',ctx);
  assert.equal(r.amount,null);assert.equal(r.description,'Migros');assert.equal(r.category,'Market');
});

test('boş giriş',()=>{
  const r=parseQuick('   ',ctx);
  assert.equal(r.amount,null);assert.equal(r.description,'');assert.equal(r.category,null);
});

test('geçmiş kategori anahtar kelimeden önceliklidir',()=>{
  const history=[{description:'Kahve',category:'Yemek',date:'2026-01-01'},{description:'kahve',category:'Market',date:'2026-02-01'}];
  const r=parseQuick('kahve 80',{...ctx,history});
  assert.equal(r.category,'Market');assert.equal(r.categorySource,'history');
});

test('tarih sözcükleri',()=>{
  assert.equal(parseQuick('Kahve 120 dün',ctx).dayOffset,-1);
  assert.equal(parseQuick('Kahve 120 dün',ctx).description,'Kahve');
  assert.equal(parseQuick('Kahve 120 bugün',ctx).dayOffset,0);
  assert.equal(parseQuick('Kahve 120 önceki gün',ctx).dayOffset,-2);
});

test('ek almış kelimeler',()=>{
  assert.equal(parseQuick("Migros'tan 200",ctx).category,'Market');
  assert.equal(parseQuick('benzine 900',ctx).category,'Ulaşım');
  // kısa anahtar kelimeler ek toleransı almaz: "suşi" -> Ulaşım/Fatura değil
  assert.notEqual(guessCategory('Sumo',CATS),'Fatura');
});

test('bilinmeyen açıklama kategori atamaz',()=>{
  assert.equal(parseQuick('Xyz 50',ctx).category,null);
});

test('localDate yerel tarihi verir',()=>{
  assert.equal(localDate(new Date(2026,0,1,1,30)),'2026-01-01');
  assert.equal(localDate(new Date(2026,0,1,1,30),-1),'2025-12-31');
});

test('norm',()=>{assert.equal(norm('İŞ BANKASI Çğöü'),'is bankasi cgou');});

test('frequentDescriptions',()=>{
  const r=frequentDescriptions([{description:'Kahve',date:'2026-01-01'},{description:'kahve',date:'2026-01-03'},{description:'Migros',date:'2026-01-02'}]);
  assert.deepEqual(r,['kahve','Migros']);
});
