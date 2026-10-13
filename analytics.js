// Kasa — merkezi harcama hesaplama katmanı (saf fonksiyonlar; DOM ve Firebase bilmez).
// Tüm ekranlar (ana sayfa, kartlar, analiz, işlemler) toplamları yalnızca buradan alır.
//
// Sınıflandırma (kullanıcının yerel takvim gününe göre; UTC değil):
//   GERÇEKLEŞEN (actual)  : işlem tarihi <= bugün
//   PLANLANAN  (planned)  : işlem tarihi  > bugün
//   TOPLAM KAYITLI (total): gerçekleşen + planlanan
// "Gerçekleşen" yalnızca tarihe dayalı bir sınıflandırmadır; bankada kesinleştiğinin kanıtı değildir.
// Veritabanında durum alanı yoktur: tarih geldiğinde işlem kendiliğinden gerçekleşene geçer.
//
// Para: tüm toplamlar tam sayı kuruşla (K) yapılır; kayan nokta hatası birikmez (0,1 + 0,2 = 0,30).
// Negatif tutarlar (iade) toplamdan düşülür; uygulama bugün yalnızca pozitif tutar kaydeder.

/** Tutarı tam sayı kuruşa çevirir (₺12,345 → 1235). Geçersiz değer 0 sayılır. */
// toPrecision(12): 1.005*100 = 100.49999… gibi ikili gösterim hatalarını yuvarlamadan önce düzeltir
export const toK=a=>{const n=Number(a);return Number.isFinite(n)?Math.round(Number((n*100).toPrecision(12))):0;};
/** Kuruşu liraya çevirir (gösterim için). */
export const fromK=k=>k/100;
export const sumK=list=>list.reduce((s,t)=>s+toK(t.amount),0);

const pad=n=>String(n).padStart(2,'0');
/** Verilen anın yerel takvim günü (YYYY-AA-GG). timeZone verilmezse cihazın saat dilimi. */
export const localDateKey=(d=new Date(),timeZone)=>{
  if(!timeZone)return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
  return`${p.year}-${p.month}-${p.day}`;
};
/** İşlemin ay anahtarı (YYYY-AA) — tarih metninden; saat dilimi dönüşümü yapılmaz. */
export const monthKeyOf=date=>String(date).slice(0,7);
export const dayOfDate=date=>+String(date).slice(8,10);
const ym=key=>{const [y,m]=key.split('-').map(Number);return{y,m};};
/** Ayın gün sayısı (artık yıl dahil): daysInMonth('2028-02') = 29 */
export const daysInMonth=key=>{const {y,m}=ym(key);return new Date(Date.UTC(y,m,0)).getUTCDate();};
/** Ay anahtarına n ay ekler (yıl geçişi dahil): addMonths('2026-01',-1) = '2025-12' */
export const addMonths=(key,n)=>{const {y,m}=ym(key);const t=y*12+(m-1)+n;return`${Math.floor(t/12)}-${pad(t%12+1)}`;};

export const isPlanned=(t,today)=>String(t.date)>today;
export const classify=(t,today)=>isPlanned(t,today)?'planned':'actual';
/** Ayın bugüne göre durumu: geçmiş / içinde bulunulan / gelecek */
export const monthState=(key,today)=>{const tk=monthKeyOf(today);return key<tk?'past':key>tk?'future':'current';};
/** Ayda geçen gün sayısı: içinde bulunulan ayda bugünün günü, geçmiş ayda ayın tamamı, gelecek ayda 0 */
export const elapsedDays=(key,today)=>{const s=monthState(key,today);return s==='past'?daysInMonth(key):s==='current'?dayOfDate(today):0;};

const blank=()=>({actualK:0,plannedK:0,totalK:0,actualN:0,plannedN:0,totalN:0});
const add=(o,t,today)=>{const k=toK(t.amount);if(isPlanned(t,today)){o.plannedK+=k;o.plannedN++;}else{o.actualK+=k;o.actualN++;}o.totalK+=k;o.totalN++;};
/** Herhangi bir işlem listesinin gerçekleşen / planlanan / toplam özeti */
export const split=(list,today)=>{const o=blank();for(const t of list)add(o,t,today);return o;};
/** Bir alana göre (kategori, kart) gruplanmış özetler; gerçekleşene göre büyükten küçüğe */
export const groupBy=(list,keyFn,today)=>{
  const m=new Map();for(const t of list){const k=keyFn(t);if(!m.has(k))m.set(k,{key:k,...blank()});add(m.get(k),t,today);}
  return[...m.values()].sort((a,b)=>b.actualK-a.actualK||b.plannedK-a.plannedK||String(a.key).localeCompare(String(b.key)));
};

/**
 * Ay karşılaştırması (yalnızca gerçekleşen harcama):
 * - İçinde bulunulan ay "ay başından bugüne": bu ayın 1..G günü ile önceki ayın 1..min(G, önceki ayın gün sayısı) günü.
 *   Önceki ay daha kısaysa (ör. 31 Mart'ta Şubat) önceki ayın tamamı alınır ve bu durum `prevClamped` ile bildirilir.
 * - Geçmiş ay "tam ay": iki ayın tamamı.
 * - Gelecek ay: karşılaştırma yok (null).
 * Taban 0 ise yüzde verilmez (pct = null); fark yine verilir.
 */
export const compareMonth=(txs,key,today)=>{
  const state=monthState(key,today);if(state==='future')return null;
  const prevKey=addMonths(key,-1);const prevDim=daysInMonth(prevKey);
  const curTo=state==='current'?dayOfDate(today):daysInMonth(key);
  const prevTo=state==='current'?Math.min(curTo,prevDim):prevDim;
  let curK=0,prevK=0;
  for(const t of txs){
    if(isPlanned(t,today))continue;
    const mk=monthKeyOf(t.date),d=dayOfDate(t.date);
    if(mk===key&&d<=curTo)curK+=toK(t.amount);
    else if(mk===prevKey&&d<=prevTo)prevK+=toK(t.amount);
  }
  const diffK=curK-prevK;
  return{mode:state==='current'?'mtd':'full',key,prevKey,curTo,prevTo,prevDim,prevClamped:state==='current'&&curTo>prevDim,
    curK,prevK,diffK,pct:prevK>0?diffK/prevK*100:null};
};

/** Bir ayın tüm ölçüleri. Grafikler ve özetler aynı nesneden beslenir; toplamlar birebir tutar. */
export const monthReport=(txs,key,today)=>{
  const state=monthState(key,today),dim=daysInMonth(key),elapsed=elapsedDays(key,today);
  const mt=txs.filter(t=>monthKeyOf(t.date)===key);
  const s=split(mt,today);
  const dailyActualK=new Array(dim).fill(0),dailyPlannedK=new Array(dim).fill(0);
  for(const t of mt){const d=dayOfDate(t.date);if(d<1||d>dim)continue;(isPlanned(t,today)?dailyPlannedK:dailyActualK)[d-1]+=toK(t.amount);}
  // Günlük ortalama: gerçekleşen / geçen gün (içinde bulunulan ay), gerçekleşen / ayın gün sayısı (geçmiş ay), gelecek ayda yok
  const dailyAvgK=elapsed>0?Math.round(s.actualK/elapsed):null;
  return{key,state,dim,elapsed,today,...s,dailyAvgK,dailyActualK,dailyPlannedK,
    cats:groupBy(mt,t=>t.category,today),cards:groupBy(mt,t=>t.cardId,today),
    cmp:compareMonth(txs,key,today),txs:mt};
};

/** Son n ayın gerçekleşen / planlanan toplamları (endKey dahil, eskiden yeniye) */
export const monthSeries=(txs,endKey,n,today)=>{
  const keys=Array.from({length:n},(_,i)=>addMonths(endKey,i-n+1));
  const by=new Map(keys.map(k=>[k,blank()]));
  for(const t of txs){const o=by.get(monthKeyOf(t.date));if(o)add(o,t,today);}
  return keys.map(k=>({key:k,state:monthState(k,today),...by.get(k)}));
};

/** Tamamlanmış (geçmiş) ayların gerçekleşen ortalaması; harcaması olmayan aylar hariç */
export const completedMonthsAvgK=(series)=>{
  const v=series.filter(x=>x.state==='past'&&x.actualK>0).map(x=>x.actualK);
  return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;
};
