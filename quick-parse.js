// Kasa — hızlı işlem girişi ayrıştırıcısı.
// Saf (DOM / ağ / Firebase kullanmaz), deterministik; Node ile test edilir.
// Örnek: "Migros 450 İş Bankası" -> {description:'Migros', amount:450, category:'Market', cardId:'c2'}

const TR_MAP={'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','â':'a','î':'i','û':'u'};

// Türkçe küçük harf + aksan temizleme: "İŞ Bankası" -> "is bankasi"
export const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g,ch=>TR_MAP[ch]).replace(/̇/g,'');

// Kelimelere böl; "Migros'tan" -> "migros", noktalama atılır
const tokenize=s=>String(s||'').trim().split(/\s+/).filter(Boolean).map(raw=>({raw,n:norm(raw.split(/['’]/)[0]).replace(/[^a-z0-9&.,₺]/g,'')})).filter(t=>t.n);

// Kategori anahtar kelimeleri (normalize edilmiş). 4+ harfli olanlar ek almış hâlini de yakalar ("benzine").
export const CATEGORY_KEYWORDS={
  'Market':['migros','a101','bim','sok','carrefour','carrefoursa','file','macro','macrocenter','metro market','hakmar','onur market','tarim kredi','market','bakkal','manav','kasap','firin','ekmek','sut','getir','manav','pazar','sarkuteri'],
  'Yemek':['yemek','yemeksepeti','restoran','restaurant','lokanta','doner','kebap','kebab','pizza','burger','hamburger','mcdonalds','burger king','kfc','popeyes','dominos','durum','pide','lahmacun','kofte','tost','balik','ogle','aksam yemegi','kahvalti','sushi','cig kofte','tantuni'],
  'Kafe':['kahve','cafe','kafe','starbucks','espresso','latte','americano','cappuccino','filtre','nescafe','cay','pastane','simit','tatli','dondurma','kahve dunyasi','gloria jeans','caribou','mado','baklava'],
  'Ulaşım':['benzin','akaryakit','yakit','mazot','dizel','motorin','lpg','shell','opet','bp','petrol ofisi','total','aytemiz','taksi','uber','bitaksi','otobus','metro','metrobus','dolmus','minibus','istanbulkart','kentkart','otopark','kopru','otoyol','hgs','ogs','ucak','thy','pegasus','ajet','tren','tcdd','vapur','marti','scooter'],
  'Eğlence':['sinema','netflix','spotify','youtube','disney','exxen','blutv','amazon prime','konser','tiyatro','oyun','steam','playstation','xbox','bar','bira','mac','bilet','biletix','bowling'],
  'Giyim':['zara','lcw','lc waikiki','h&m','hm','koton','defacto','mavi','bershka','pull&bear','mango','boyner','giyim','ayakkabi','tisort','pantolon','mont','gomlek','elbise','kazak','flo','nike','adidas'],
  'Sağlık':['eczane','ilac','hastane','doktor','dis','disci','muayene','vitamin','tahlil','gozluk','klinik','saglik'],
  'Fatura':['fatura','elektrik','su faturasi','dogalgaz','dogal gaz','internet','turkcell','vodafone','turk telekom','telekom','superonline','kira','aidat','igdas','enerjisa','ck enerji','iski','aski'],
  'Elektronik':['teknosa','mediamarkt','media markt','vatan','apple','telefon','kulaklik','sarj','bilgisayar','laptop','tablet','elektronik'],
};

// Banka eş adları: kart adı bunlardan birini içeriyorsa girişteki diğer eş adlarla da eşleşir.
const BANK_GROUPS=[
  ['is','isbank','is bankasi','maximum'],
  ['garanti','garanti bbva','bonus'],
  ['yapi kredi','ykb','world'],
  ['akbank','axess','wings'],
  ['qnb','finansbank','cardfinans'],
  ['ziraat','bankkart'],
  ['halkbank','halk','paraf'],
  ['vakifbank','vakif'],
  ['denizbank','deniz'],
  ['enpara'],['teb'],['ing'],['hsbc'],['kuveyt turk','kuveyt'],['papara'],['hadi'],['albaraka'],['odeabank','odea'],['fibabanka','fiba'],['sekerbank','seker'],['cepteteb'],['param'],['tosla'],['ininal'],
];
const BANK_WORDS=new Set(BANK_GROUPS.flat().filter(w=>!w.includes(' ')));
// Kart adından sonra gelebilen, açıklamaya karışmaması gereken sözcükler
const FILLER=new Set(['bankasi','banka','bank','bankasiyla','kart','karti','kartim','kartiyla','kartla','kredi','ile','la','le','ile.','bankkarti']);

// 4+ harfli anahtar kelimelerde ek toleransı; kısa olanlar tam eşleşme ister ("su", "bp")
// Ünsüz yumuşaması da tolere edilir: "yemek" -> "yemegi", "kitap" -> "kitabi"
const SOFT={k:'g',p:'b',t:'d',c:'c'};
const tokEq=(tok,kw)=>{
  if(tok===kw)return true;
  if(kw.length<4)return false;
  const ok=stem=>tok.startsWith(stem)&&tok.length-stem.length<=5;
  const last=kw.slice(-1);
  return ok(kw)||(SOFT[last]&&tok.length>kw.length&&ok(kw.slice(0,-1)+SOFT[last]));
};

// toks[i..] dizisi phrase'in kelimeleriyle başlıyor mu? Eşleşen kelime sayısını döndürür (0 = yok)
const phraseAt=(toks,i,phrase)=>{
  const pw=phrase.split(' ');
  if(i+pw.length>toks.length)return 0;
  for(let k=0;k<pw.length;k++){
    const last=k===pw.length-1;
    if(last?!tokEq(toks[i+k],pw[k]):toks[i+k]!==pw[k])return 0;
  }
  return pw.length;
};

// Tutar: "450", "1.500", "1500,50", "1.250,75", "₺120", "120tl", "45.5"
export const parseAmount=raw=>{
  let s=norm(raw).replace(/^(₺|tl)/,'').replace(/(₺|tl|try|lira)$/,'');
  if(!/^\d[\d.,]*$/.test(s))return null;
  s=s.replace(/[.,]$/,'');
  const hasDot=s.includes('.'),hasCom=s.includes(',');
  if(hasDot&&hasCom){
    // Hangisi sonda ise o ondalık ayırıcıdır
    if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(hasDot){
    // "1.500" / "12.500.000" binlik; "45.5" / "12.75" ondalık
    if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    else if((s.match(/\./g)||[]).length>1)return null;
  }else if(hasCom){
    if(/^\d{1,3}(,\d{3})+$/.test(s))s=s.replace(/,/g,'');
    else if((s.match(/,/g)||[]).length>1)return null;
    else s=s.replace(',','.');
  }
  const n=Math.round(parseFloat(s)*100)/100;
  return Number.isFinite(n)&&n>0?n:null;
};

const isAmountTok=t=>/^(₺|tl)?\d[\d.,]*(₺|tl|try|lira)?$/.test(t.n)&&parseAmount(t.raw)!==null;

// Kartın eş ad grubu (yoksa null)
const cardGroup=c=>{const n=norm(c.name);return BANK_GROUPS.find(g=>g.some(a=>(' '+n+' ').includes(' '+a+' ')))||null;};

// toks[from..to) aralığında, verilen pozisyonlarda başlayan en uzun kart eşleşmesi
const findCard=(toks,cards,starts,endsAt)=>{
  let best=null;
  const consider=(card,start,len,score)=>{
    if(endsAt!=null&&start+len!==endsAt)return;
    if(!best||score>best.score||(score===best.score&&card.name.length<best.card.name.length))best={card,start,len,score};
  };
  for(const start of starts){
    for(const card of cards){
      // 1) Kart adının kendisi (en güçlü eşleşme, uzun ad öncelikli: "Enpara Banka" > "Enpara")
      const cn=norm(card.name).replace(/[^a-z0-9& ]/g,'').trim();
      if(cn){const len=phraseAt(toks,start,cn);if(len)consider(card,start,len,100+len);}
      // 2) Banka eş adı ("İş Bankası" / "Maximum" -> "İş" kartı)
      const g=cardGroup(card);
      if(g)for(const a of g){const len=phraseAt(toks,start,a);if(len)consider(card,start,len,50+len);}
    }
  }
  return best;
};

const capFirst=s=>s?s.charAt(0).toLocaleUpperCase('tr-TR')+s.slice(1):s;

export const guessCategory=(desc,categories)=>{
  const toks=tokenize(desc).map(t=>t.n);
  const names=new Set((categories||[]).map(c=>c.n||c));
  let best=null;
  for(const [cat,kws] of Object.entries(CATEGORY_KEYWORDS)){
    if(names.size&&!names.has(cat))continue;
    for(const kw of kws)for(let i=0;i<toks.length;i++){
      const len=phraseAt(toks,i,kw);
      // Erken kelime ve çok kelimeli ifade öncelikli
      if(len){const score=len*10-i;if(!best||score>best.score)best={cat,score};}
    }
  }
  return best?best.cat:null;
};

/**
 * Serbest metni işlem alanlarına ayırır. Hiçbir şey kaydetmez.
 * @param {string} text
 * @param {{cards?:Array<{id:string,name:string}>, categories?:Array<{n:string}>, history?:Array<{description:string,category:string,date?:string}>, today?:Date}} ctx
 * @returns {{description:string, amount:number|null, category:string|null, categorySource:'history'|'keyword'|null, cardId:string|null, cardMatched:string|null, unknownBank:string|null, dayOffset:number}}
 */
export const parseQuick=(text,ctx={})=>{
  const cards=ctx.cards||[];
  const toks=tokenize(text);
  const used=new Array(toks.length).fill(false);
  const out={description:'',amount:null,category:null,categorySource:null,cardId:null,cardMatched:null,unknownBank:null,dayOffset:0};

  // Tarih sözcükleri
  toks.forEach((t,i)=>{
    if(t.n==='dun'){out.dayOffset=-1;used[i]=true;}
    else if(t.n==='bugun'){used[i]=true;}
    else if((t.n==='evvelsi'||t.n==='onceki')&&toks[i+1]?.n==='gun'){out.dayOffset=-2;used[i]=used[i+1]=true;}
  });

  // Tutar: para birimi işaretli olan, yoksa son sayı. "120 tl" gibi ayrı yazılan birimi de tüket.
  let amtIdx=-1;
  toks.forEach((t,i)=>{if(!used[i]&&isAmountTok(t)&&(amtIdx<0||/₺|tl/.test(t.n)||!/₺|tl/.test(toks[amtIdx].n)))amtIdx=i;});
  if(amtIdx>=0){
    out.amount=parseAmount(toks[amtIdx].raw);used[amtIdx]=true;
    const cur=t=>t&&['tl','₺','lira','try'].includes(t.n);
    if(cur(toks[amtIdx+1]))used[amtIdx+1]=true;
    if(cur(toks[amtIdx-1]))used[amtIdx-1]=true;
  }

  // Kart: tutardan sonraki kısımda herhangi bir yerde; tutardan önce ise yalnızca açıklamanın sonunda
  // (böylece "İş yemeği 300" İş kartıyla eşleşmez).
  const nt=toks.map(t=>t.n);
  const after=[],before=[];
  for(let i=0;i<toks.length;i++)if(!used[i])(amtIdx>=0&&i>amtIdx?after:before).push(i);
  let m=after.length?findCard(nt,cards,after,null):null;
  if(!m&&before.length>1){
    const end=before[before.length-1]+1;
    m=findCard(nt,cards,before.slice(1),end);
  }
  if(m){
    out.cardId=m.card.id;out.cardMatched=m.card.name;
    for(let k=m.start;k<m.start+m.len;k++)used[k]=true;
  }

  // Tutardan sonra gelip eşleşmeyen banka adı -> uyar, açıklamaya katma
  for(const i of after){
    if(used[i])continue;
    if(BANK_WORDS.has(nt[i])&&!m){out.unknownBank=capFirst(toks[i].raw);used[i]=true;}
  }
  // "Bankası", "kartı", "ile" gibi dolgu kelimeleri kart bölgesinde at
  if(m||out.unknownBank)for(const i of after)if(!used[i]&&FILLER.has(nt[i]))used[i]=true;
  if(m)for(let k=m.start+m.len;k<toks.length&&FILLER.has(nt[k]);k++)used[k]=true;

  out.description=capFirst(toks.filter((_,i)=>!used[i]).map(t=>t.raw).join(' ').trim());

  // Kategori: aynı açıklamayla geçmişte seçilen kategori > anahtar kelime
  if(out.description){
    const key=norm(out.description);
    const prev=(ctx.history||[]).filter(h=>norm(h.description)===key&&h.category).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
    const allowed=new Set((ctx.categories||[]).map(c=>c.n||c));
    if(prev&&(!allowed.size||allowed.has(prev.category))){out.category=prev.category;out.categorySource='history';}
    else{const g=guessCategory(out.description,ctx.categories);if(g){out.category=g;out.categorySource='keyword';}}
  }
  return out;
};

// Yerel saatle YYYY-MM-DD (toISOString UTC kullandığı için Türkiye'de gece 00-03 arası bir önceki günü verir)
export const localDate=(d=new Date(),offsetDays=0)=>{
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()+offsetDays);
  return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};

// Sık kullanılan açıklamalar (hızlı öneri çipleri için)
export const frequentDescriptions=(txs,limit=6)=>{
  const cnt=new Map();
  for(const t of txs||[]){
    if(!t.description)continue;
    const k=norm(t.description);const e=cnt.get(k)||{label:t.description,n:0,last:''};
    e.n++;if(String(t.date)>e.last){e.last=String(t.date);e.label=t.description;}
    cnt.set(k,e);
  }
  return[...cnt.values()].sort((a,b)=>b.n-a.n||b.last.localeCompare(a.last)).slice(0,limit).map(e=>e.label);
};
