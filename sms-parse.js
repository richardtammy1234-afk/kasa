// Kasa — banka SMS'inden işlem çıkaran ayrıştırıcı.
// Saf (DOM / ağ / Firebase kullanmaz) ve deterministiktir; Node ile test edilir (tests/sms-parse.test.mjs).
//
// Akış: iPhone Kestirmesi gelen SMS'i (başına alındığı anı ISO biçiminde ekleyip) Base64 olarak
// users/{uid}/inbox'a yazar. Uygulama açıkken bu kayıtları okur, parseSms ile işleme çevirir ve kaydeder.
//
// Bankalar SMS biçimlerini zaman zaman değiştirir. Bu yüzden ayrıştırıcı tek bir bankanın kalıbına bağlı
// değildir: tutarı para birimi işaretinden, kartı "1234 ile biten" / "**1234" gibi son dört haneden ve
// banka adından, iş yerini birkaç genel kalıptan çıkarır. Emin olamadığı SMS'leri kaydetmez,
// "incelenecek" olarak bırakır.

import {norm,parseAmount,guessCategory,BANK_GROUPS} from './quick-parse.js?v=3';

// ---------- yardımcılar ----------

// Görünmez/kontrol karakterlerini at, boşlukları sadeleştir
export const cleanText=s=>String(s??'')
  .replace(/[   ]/g,' ')
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g,' ')
  .replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();

// Kestirmenin gönderdiği Base64 (UTF-8) metni çöz. Bozuksa null.
export const decodeB64=b=>{
  try{
    const s=String(b||'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
    if(!s||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))return null;
    const bin=atob(s);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }catch{return null;}
};

// Kararlı 53 bit özet (cyrb53) — aynı SMS iki kez gelirse aynı işlem kimliği oluşur, çift kayıt olmaz
const cyrb53=(str,seed=0)=>{
  let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;
  for(let i=0,ch;i<str.length;i++){ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507);h1^=Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507);h2^=Math.imul(h1^(h1>>>13),3266489909);
  return 4294967296*(2097151&h2)+(h1>>>0);
};
export const smsId=text=>'sms'+cyrb53(norm(cleanText(text)).replace(/[^a-z0-9]/g,'')).toString(36);

const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
// Büyük harfli kelimeyi küçült: Türkçe harf içermeyen (ASCII) SMS'lerde I -> i ('NETFLIX' -> 'Netflix'),
// Türkçe harf içerenlerde tr-TR kuralı ('KAHVE DÜNYASI' -> 'Kahve Dünyası')
const lowerWord=w=>/[ÇĞÖŞÜİçğöşüı]/.test(w)?w.toLocaleLowerCase('tr-TR'):w.toLowerCase();
const capWord=w=>w?w.charAt(0).toLocaleUpperCase('tr-TR')+lowerWord(w.slice(1)):w;
const addMonths=(iso,k)=>{const [y,m,d]=iso.split('-').map(Number);const last=new Date(y,m-1+k+1,0).getDate();return ymd(new Date(y,m-1+k,Math.min(d,last)));};

// Kestirme metnin başına alındığı anı ekler: "2026-11-24T14:35:10+03:00\n<SMS>"
export const splitEnvelope=raw=>{
  const s=cleanText(raw);
  const m=/^(\d{4}-\d{2}-\d{2})(?:[T ][0-9:.]+)?(?:Z|[+-]\d{2}:?\d{2})?\s*\n([\s\S]*)$/.exec(s);
  return m?{receivedDate:m[1],text:m[2].trim()}:{receivedDate:null,text:s};
};

// ---------- sınıflandırma ----------
// Hepsi norm() edilmiş (küçük harf, Türkçe harfler sadeleşmiş) metin üzerinde çalışır.
const RE_OTP=/(sifre|parola|dogrulama kod|onay kod|guvenlik kod|tek kullanimlik|\botp\b|3d ?secure|kodunuz|kodu ?:|kodu ?ile)/;
const RE_DECLINE=/(onaylanmad|reddedil|basarisiz|gerceklesmedi|gerceklestirilemedi|gerceklestirilememis|yetersiz|engellen|bloke)/;
const RE_REFUND=/(\biade\b|iade edil|iadesi|geri odeme|chargeback|iptal edil)/;
const RE_NOT_SPEND=/(hesabiniza\b[^.]{0,60}\b(yatirildi|gonderildi|aktarildi|gecti)|gelen (eft|fast|havale)|maas|odemeniz (alin|yapil)\w*\s*,?\s*tesekkur|borcunuza|kart borc|kredi karti borc|ekstreniz|hesap ozeti|asgari|son odeme tarihi|limitiniz (artir|guncellen|tanimlan)|kartiniz (teslim|kargo|hazir|aktif)|puaniniz (yuklen|aktar))/;
const RE_TRANSFER=/\b(eft|fast|havale|virman)\b/;
const RE_CASH=/(\batm\b|nakit cekim|para cekim|nakit avans)/;
const RE_AD=/(kampanya|firsat|katil\b|katilmak|kazanmak icin|son gun|ret yaz|sms ile|mersis|detayli bilgi|bilgi icin|https?:|www\.|\.com\.tr\/|tikla|basvur)/;
// Kesin harcama ifadeleri (geçmiş zaman / onay)
const RE_SPEND_STRONG=/(harcama(niz|n)? (yapil|gerceklestir|onaylan)|alisveris(iniz|in)? (yapil|gerceklestir|onaylan)|tutarinda (harcama|alisveris|islem|odeme)|islem(i|iniz)? (yapil|gerceklestir|onaylan)|odeme(niz)? (yapil|gerceklestir|onaylan)|harcamaniz|alisverisiniz|tahsil edil|cekim yapil|provizyon)/;
const RE_SPEND_WEAK=/(harcama|alisveris|odeme|satin alma|islem)/;

// ---------- tutar ----------
const CUR={tl:'TRY',try:'TRY','₺':'TRY',usd:'USD','$':'USD',eur:'EUR','€':'EUR',gbp:'GBP','£':'GBP'};
const RE_AMT=/(?:(TL|TRY|₺|USD|EUR|GBP|\$|€|£)\s?)?(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])(?:\s?(TL|TRY|₺|USD|EUR|GBP|\$|€|£)(?![A-Za-zÇĞİÖŞÜçğıöşü]))?/gi;
// Tutarın hemen önünde/arkasında bu sözcükler varsa harcama tutarı değildir
const RE_CTX_BEFORE=/(limit|bakiye|kullanilabilir|kalan|puan|parafpara|bonus|maxipuan|chip|worldpuan|kazan|borc|asgari|ekstre|hediye|indirim|iade|komisyon|ucret|faiz)\W*$/;
const RE_CTX_AFTER=/^\W*(?:tl|try)?\W*(puan|parafpara|maxipuan|bonus|chip|worldpuan|kazan|indirim|hediye|limit|bakiye|iade|ucret|komisyon)/;

export const findAmounts=text=>{
  const out=[];
  for(const m of text.matchAll(RE_AMT)){
    const cur=(m[1]||m[3]||'').toLowerCase();
    if(!cur)continue;
    const value=parseAmount(m[2]);
    if(value==null)continue;
    const before=norm(text.slice(Math.max(0,m.index-32),m.index));
    const after=norm(text.slice(m.index+m[0].length,m.index+m[0].length+16));
    out.push({value,currency:CUR[cur]||'TRY',index:m.index,excluded:RE_CTX_BEFORE.test(before)||RE_CTX_AFTER.test(after)});
  }
  return out;
};

// ---------- tarih ----------
const findDate=text=>{
  for(const m of text.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g)){
    const d=+m[1],mo=+m[2];let y=+m[3];if(y<100)y+=2000;
    if(mo<1||mo>12||d<1||d>31||y<2000||y>2100)continue;
    const dt=new Date(y,mo-1,d);if(dt.getMonth()!==mo-1)continue;
    return ymd(dt);
  }
  return null;
};

// ---------- kart ----------
export const findLast4=n=>{
  const m=/(?:[*x•]{2,}|\.{3,})\s?(\d{4})(?!\d)/.exec(n)
    ||/(?<!\d)(\d{4})\s?(?:ile biten|ile sonlanan|nolu|no'lu|numarali|son dort)/.exec(n)
    ||/son (?:4|dort) (?:hane(?:si)?|rakam(?:i)?)\D{0,5}(\d{4})(?!\d)/.exec(n)
    ||/\((?:\*|x)?(\d{4})\)/.exec(n);
  return m?m[1]:null;
};

const wordIn=(hay,w)=>new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`).test(hay);
// "iş" tek başına çok sık geçer ("iş yerinden"); metinde banka eşleşmesi için yalnızca uzun eş adlar kullanılır
const TEXT_ALIAS_SKIP=new Set(['is','ing','deniz','halk','world','bonus','param','seker']);
const groupOfCard=c=>{const n=norm(c.name);return BANK_GROUPS.find(g=>g.some(a=>wordIn(n,a)))||null;};
export const banksInText=n=>BANK_GROUPS.filter(g=>g.some(a=>!TEXT_ALIAS_SKIP.has(a)&&wordIn(n,a)));

const pickCard=(n,l4,ctx)=>{
  const cards=ctx.cards||[];
  const map=ctx.map||{};
  if(l4&&map[l4]&&cards.some(c=>c.id===map[l4]))return{cardId:map[l4],source:'map'};
  const groups=banksInText(n);
  let cand=cards.filter(c=>{const g=groupOfCard(c);return g&&groups.includes(g);});
  if(cand.length>1){
    const wantBank=/(banka kart|bankkart|hesabiniz|vadesiz|debit)/.test(n);
    const byType=cand.filter(c=>(c.type==='Banka')===wantBank);
    if(byType.length)cand=byType;
  }
  if(cand.length>1){
    // Son 90 günde en çok kullanılan kart
    const since=ctx.today?ymd(new Date(ctx.today.getFullYear(),ctx.today.getMonth(),ctx.today.getDate()-90)):'';
    const cnt=id=>(ctx.history||[]).filter(t=>t.cardId===id&&String(t.date)>=since).length;
    cand=[...cand].sort((a,b)=>cnt(b.id)-cnt(a.id));
  }
  if(cand.length)return{cardId:cand[0].id,source:'bank'};
  const fb=ctx.fallbackCardId&&cards.some(c=>c.id===ctx.fallbackCardId)?ctx.fallbackCardId:cards[0]?.id||null;
  return{cardId:fb,source:'fallback'};
};

// ---------- iş yeri ----------
const PREFIX=/^(?:iyzico|iyz|paytr|payu|param|papara|stripe|paypal|sanal ?pos|pos|www\.)\s*[*/.\-:]*\s*/i;
const TAIL=new Set(['as','a.s','a.s.','as.','aş','ltd','ltd.','sti','sti.','san','tic','ve','paz','ith','ihr','tr','tur','turkey','turkiye','sube','subesi','magaza','magazasi','no','istanbul','ankara','izmir','bursa','antalya','denizli','kocaeli','konya','adana','mersin','eskisehir','kayseri','gaziantep','samsun','trabzon','sakarya','tekirdag','mugla','aydin','manisa','balikesir','hatay','malatya','erzurum','diyarbakir','sanliurfa','kadikoy','besiktas','sisli','uskudar','atasehir','bakirkoy','beyoglu','fatih','pamukkale','merkezefendi','cankaya','kecioren','bornova','karsiyaka','nilufer','osmangazi','muratpasa','konyaalti']);
const HEAD=new Set(['tarihinde','tarihli','saat','saatinde','ile','kartinizla','kartinizdan','kartinizdaki','kartla','kredi','banka','karti','kartiniz','hesabinizdan','nolu','biten','sonlanan','toplam','tutarinda','tutarli','adet','islem','harcama','alisveris','sayin','degerli','musterimiz','uye','isyeri','isyerinden','isyerinde','ve','bir','tl','try']);

export const cleanMerchant=raw=>{
  let s=String(raw||'').replace(/[“”"'’`]/g,' ').replace(/\s+/g,' ').trim();
  for(let i=0;i<3&&PREFIX.test(s);i++)s=s.replace(PREFIX,'');
  s=s.replace(/\.(?:com|net|org)(?:\.tr)?(?![a-z])/gi,' ').replace(/[*/\\|_#]+/g,' ').replace(/\s+/g,' ').trim();
  let toks=s.split(' ').filter(Boolean);
  const nt=t=>norm(t).replace(/[^a-z0-9.&]/g,'');
  while(toks.length&&(HEAD.has(nt(toks[0]))||/^[\d.,:-]+$/.test(toks[0])))toks.shift();
  while(toks.length&&(TAIL.has(nt(toks[toks.length-1]).replace(/\.$/,''))||TAIL.has(nt(toks[toks.length-1]))||/^[\d.,:-]+$/.test(toks[toks.length-1])||/^\d/.test(toks[toks.length-1])&&/\d{3,}/.test(toks[toks.length-1])))toks.pop();
  // "MIGROS TICARET A.S." -> "Migros"; ara yerde kalan şirket ekleri de atılır
  toks=toks.filter((t,i)=>i===0||!['ticaret','tic','san','sanayi','ve','gida','pazarlama','paz','ltd','sti','as','a.s','a.s.','aş','a.ş.','anonim','sirketi','limited'].includes(nt(t).replace(/\.$/,'')));
  toks=toks.slice(0,4);
  if(!toks.length)return'';
  const letters=toks.join('').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'');
  if(letters.length<2)return'';
  return toks.map(t=>{
    const up=t===t.toLocaleUpperCase('tr-TR');
    if(up&&(/[&\d]/.test(t)||!/[AEIİOÖUÜaeıioöuü]/.test(t)))return t; // "A101", "H&M", "BP"
    return up?capWord(t):t.charAt(0).toLocaleUpperCase('tr-TR')+t.slice(1);
  }).join(' ');
};

// Bir parçanın son sınırdan sonraki kısmı ("... 14:35 tarihinde MIGROS TICARET" -> "MIGROS TICARET")
const afterBoundary=s=>{
  const re=/(?:tarihinde|tarihli|saatinde|saat\s?\d{1,2}[:.]\d{2}|\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}[./]\d{1,2}[./]\d{2,4}|kart\S*|hesab\S*|\bile\b|\bnolu\b|\bbiten\b|\)|,|;|:|\.\s)/gi;
  let last=0,m;while((m=re.exec(s)))last=m.index+m[0].length;
  return s.slice(last).trim();
};

const isMostlyUpper=s=>{const l=s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'');if(!l)return false;const u=l.replace(/[^A-ZÇĞİÖŞÜ]/g,'').length;return u/l.length>0.6;};
const STOP_RUN=new Set(['tl','try','usd','eur','kk','bkm','pos','atm','sms','otp','iban','no','tutar','qnb','enpara','isbank','is','bankasi','finansbank','hadi','garanti','bbva','akbank','ykb','ziraat','vakifbank','halkbank','denizbank','teb','ing','hsbc','papara','sayin','kredi','karti','bilgi','b001','b002']);

export const findMerchant=text=>{
  const tries=[];
  // a) "İşyeri: MIGROS"
  let m=/(?:üye\s+)?(?:işyeri|isyeri|i̇şyeri)\s*(?:adı|adi)?\s*[:=]\s*([^,;\n]+?)(?=\s*(?:[,;\n]|\.\s|\s\d|\s(?:tutar|tarih)|$))/i.exec(text);
  if(m)tries.push(m[1]);
  // b) "... MIGROS TICARET işyerinden / isyerinde"
  m=/([^\n]{2,80}?)\s+(?:üye\s+)?(?:işyerinden|isyerinden|işyerinde|isyerinde|işyerine|isyerine|i̇şyerinden|i̇şyerinde)/i.exec(text);
  if(m)tries.push(afterBoundary(m[1]));
  // c) "MIGROS'ta 450,00 TL" / "MIGROS'dan ..."
  m=/([A-ZÇĞİÖŞÜa-zçğıöşü0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9&.*/ -]{1,45}?)['’](?:den|dan|ten|tan|de|da|te|ta)\b/.exec(text);
  if(m)tries.push(afterBoundary(m[1]));
  // d) "450,00 TL tutarında MIGROS işlemi / harcaması"
  m=/\d[\d.,]*\s?(?:TL|TRY|₺)\s+(?:tutarında|tutarinda|tutarlı|tutarli|tutarlık|tutarlik)?\s*([^\n.,;]{2,45}?)\s+(?:işlemi|islemi|harcaması|harcamasi|alışverişi|alisverisi|ödemesi|odemesi)\b/i.exec(text);
  if(m)tries.push(m[1]);
  // e) BÜYÜK HARFLİ iş yeri adı (yalnızca metnin tamamı büyük harf değilse)
  if(!isMostlyUpper(text)){
    const runs=[...text.matchAll(/(?:(?<![A-Za-zÇĞİÖŞÜçğıöşü0-9])[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9&.*\/-]+(?:\s+|$)){1,5}/g)].map(x=>x[0].trim())
      .filter(r=>{const ws=r.split(/\s+/).map(w=>norm(w).replace(/[^a-z0-9&]/g,''));return ws.some(w=>w&&!STOP_RUN.has(w)&&/[a-z]{2,}/.test(w));});
    runs.sort((a,b)=>b.replace(/[^A-Za-zÇĞİÖŞÜ]/g,'').length-a.replace(/[^A-Za-zÇĞİÖŞÜ]/g,'').length);
    if(runs[0])tries.push(runs[0]);
  }
  for(const t of tries){const c=cleanMerchant(t);if(c&&!STOP_RUN.has(norm(c)))return c;}
  return'';
};

// Geçmişte aynı iş yeri için kullanılan yazımı tercih et ("Migros Ticaret" -> geçmişteki "Migros")
const canonical=(label,history)=>{
  const key=norm(label);if(!key)return label;
  const freq=new Map();
  for(const t of history||[]){
    const d=String(t.description||'');if(!d||/taksit/i.test(d))continue;
    const k=norm(d);const e=freq.get(k)||{label:d,n:0};e.n++;freq.set(k,e);
  }
  if(freq.has(key))return freq.get(key).label;
  let best=null;
  for(const [k,e] of freq){
    if(k.length<3)continue;
    if(key.startsWith(k+' ')||k.startsWith(key+' ')){if(!best||k.length>best.k.length||(k.length===best.k.length&&e.n>best.e.n))best={k,e};}
  }
  return best?best.e.label:label;
};

const categoryFor=(label,raw,ctx)=>{
  const cats=ctx.categories||[];
  const allowed=new Set(cats.map(c=>c.n||c));
  const key=norm(label);
  const prev=(ctx.history||[]).filter(h=>norm(h.description)===key&&h.category&&(!allowed.size||allowed.has(h.category)))
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
  if(prev)return prev.category;
  return guessCategory(label,cats)||guessCategory(raw,cats)||(allowed.size&&!allowed.has('Diğer')?[...allowed][0]:'Diğer');
};

/**
 * Bir banka SMS'ini işleme çevirir. Hiçbir şey kaydetmez.
 * @param {string} raw  Kestirmeden gelen metin (başında isteğe bağlı ISO tarih satırı)
 * @param {{cards:Array, history?:Array, categories?:Array, map?:Object<string,string>, fallbackCardId?:string, today?:Date}} ctx
 * @returns {{status:'ok', txs:Array, l4:string|null, cardSource:string, merchantFound:boolean, text:string}
 *          |{status:'review', reason:string, text:string, partial:Object}
 *          |{status:'skip', reason:string, text:string}}
 */
export const parseSms=(raw,ctx={})=>{
  const today=ctx.today||new Date();
  const {receivedDate,text}=splitEnvelope(raw);
  const n=norm(text);
  const base={text};
  if(!text)return{...base,status:'skip',reason:'boş'};
  if(text.length>1500)return{...base,status:'skip',reason:'çok uzun'};
  if(RE_OTP.test(n))return{...base,status:'skip',reason:'doğrulama kodu'};
  if(RE_DECLINE.test(n))return{...base,status:'skip',reason:'gerçekleşmeyen işlem'};

  const amounts=findAmounts(text);
  const tl=amounts.filter(a=>a.currency==='TRY'&&!a.excluded);
  const foreign=amounts.filter(a=>a.currency!=='TRY'&&!a.excluded);
  const strong=RE_SPEND_STRONG.test(n);
  const l4=findLast4(n);
  const cardRef=!!l4||/kart/.test(n);

  if(RE_NOT_SPEND.test(n))return{...base,status:'skip',reason:'harcama değil'};
  if(!strong&&RE_AD.test(n))return{...base,status:'skip',reason:'reklam / bilgilendirme'};
  const special=RE_REFUND.test(n)?'iade':RE_CASH.test(n)?'nakit çekim':RE_TRANSFER.test(n)?'para transferi':null;
  if(!strong&&!special&&!(RE_SPEND_WEAK.test(n)&&cardRef))return{...base,status:'skip',reason:'harcama bildirimi değil'};
  if(!amounts.length)return{...base,status:'skip',reason:'tutar yok'};
  if(!tl.length&&!foreign.length&&!special)return{...base,status:'skip',reason:'tutar yok'};

  // Tarih: SMS'teki tarih, yoksa alındığı gün; mantıksızsa alındığı gün
  const recv=receivedDate||ymd(today);
  let date=findDate(text)||recv;
  {const r=new Date(recv+'T00:00'),d=new Date(date+'T00:00');const diff=(d-r)/864e5;if(diff>1||diff<-62)date=recv;}

  const merchant=findMerchant(text);
  const label0=merchant||'Kart harcaması';
  const label=merchant?canonical(merchant,ctx.history):label0;
  const card=pickCard(n,l4,{...ctx,today});
  const anyTl=amounts.find(a=>a.currency==='TRY');
  const partial={date,description:label,cardId:card.cardId,amount:(tl[0]||anyTl)?.value??null,l4};

  // Bunlar harcama olabilir de olmayabilir de: otomatik kaydedilmez, Ayarlar'da tek dokunuşla eklenir
  if(special)return{...base,status:'review',reason:special,partial};
  if(!tl.length)return{...base,status:'review',reason:'yabancı para',partial:{...partial,amount:null}};
  if(!card.cardId)return{...base,status:'review',reason:'kart yok',partial};

  const amount=tl[0].value;
  const category=categoryFor(label,merchant,ctx);
  const id=smsId(text);
  const common={category,cardId:card.cardId,src:'sms',...(l4?{l4}:{})};

  // Taksitli alışveriş: tutar taksitlere bölünür, her taksit bir sonraki aya yazılır (ör. "Migros 1/3. Taksit")
  const tm=/(?<!\d)(\d{1,2})\s*(?:ay\s*)?taksit/.exec(n);
  const nInst=tm&&!/tek cekim|pesin/.test(n)?+tm[1]:1;
  let txs;
  if(nInst>=2&&nInst<=36){
    const totalK=Math.round(amount*100),partK=Math.floor(totalK/nInst);
    txs=Array.from({length:nInst},(_,i)=>({id:`${id}_${i+1}`,date:addMonths(date,i),
      amount:(i===nInst-1?totalK-partK*(nInst-1):partK)/100,description:`${label} ${i+1}/${nInst}. Taksit`,...common}));
  }else{
    txs=[{id,date,amount,description:label,...common}];
  }
  return{...base,status:'ok',txs,l4,cardSource:card.source,merchantFound:!!merchant};
};
