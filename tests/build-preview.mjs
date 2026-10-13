// index.html'den Firebase'siz, sahte verili bir DEMO önizleme üretir (canlı dosyayı değiştirmez).
// Çıktı Firebase yapılandırması içermez; hiçbir gerçek hesaba veya veriye bağlanmaz.
// Kullanım: node tests/build-preview.mjs <çıktı.html>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.argv[2];
if(!out){console.error('Kullanım: node tests/build-preview.mjs <çıktı.html>');process.exit(1);}
let s=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const qp=fs.readFileSync(path.join(ROOT,'quick-parse.js'),'utf8').replace(/^export /gm,'');

const rep=(re,to)=>{const n=s.replace(re,()=>to);if(n===s)throw new Error('Bulunamadı: '+re);s=n;};

// Sayfa iskeleti yayın sırasında eklenir: kendi doctype/html/head/body etiketlerini çıkar
rep(/^[\s\S]*?<title>[^<]*<\/title>/,'<title>Kasa Önizleme</title>');
// styles.css sayfaya gömülür; görüntüleyicinin açık/koyu seçimine de uyar
let css=fs.readFileSync(path.join(ROOT,'styles.css'),'utf8');
const darkM=css.match(/@media \(prefers-color-scheme:dark\)\{\n  :root\{([\s\S]*?)\n  \}\n\}/);
if(!darkM)throw new Error('Koyu tema bloğu bulunamadı');
css=css.replace(darkM[0],`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkM[1]}}}\n:root[data-theme="dark"]{${darkM[1]}}`);
css=css.replace('.app{height:100vh;height:100dvh;','.app{height:100%;');
css+='\n.demo-bar{flex-shrink:0;margin:calc(var(--safe-top) + 8px) 18px 0;padding:6px 12px;border-radius:999px;background:var(--warn-bg);color:var(--warn);font-size:11px;font-weight:600;text-align:center;}\n.demo-bar+.views .pg{padding-top:14px;}\n';
rep(/<link rel="stylesheet" href="styles\.css[^"]*">/,`<style>${css}</style>`);
rep(/<\/head>\s*<body>/,'');
rep(/<\/body>\s*<\/html>\s*$/,'');
rep('Google ile devam et','Demo hesapla gir');
rep(/Veriler yalnızca senin Google hesabına bağlıdır\. Başkası göremez\./,'Bu bir önizlemedir: tüm veriler sahtedir ve yalnızca bu tarayıcı sekmesinde durur. Gerçek Kasa hesabına bağlanmaz.');
rep('<div class="app" id="app" style="display:none">','<div class="app" id="app" style="display:none">\n<div class="demo-bar">ÖNİZLEME · sahte veri · gerçek hesaba bağlı değil</div>');

// Firebase -> bellek içi sahte sürüm
const today=new Date();
const d=(back)=>{const x=new Date(today.getFullYear(),today.getMonth(),today.getDate()-back);return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const rnd=(()=>{let x=7;return()=>{x=(x*16807)%2147483647;return x/2147483647;};})();
const tpl=[['Migros','Market','c2',[180,900]],['A101','Market','c2',[60,320]],['Kahve','Kafe','c5',[70,140]],['Benzin','Ulaşım','c3',[900,1700]],
  ['Döner','Yemek','c5',[120,260]],['Netflix','Eğlence','c1',[229.99,229.99]],['Eczane','Sağlık','c7',[90,450]],['Elektrik faturası','Fatura','c7',[600,950]],
  ['Zara','Giyim','c1',[600,2200]],['Teknosa','Elektronik','c4',[400,3000]],['Taksi','Ulaşım','c6',[120,340]],['Simit','Kafe','c5',[20,45]]];
const demoTx=[];
for(let back=0;back<170;back++){
  const n=back%3===0?2:1;
  for(let k=0;k<n;k++){const t=tpl[Math.floor(rnd()*tpl.length)];const amt=Math.round((t[3][0]+rnd()*(t[3][1]-t[3][0]))*100)/100;demoTx.push({id:'demo'+demoTx.length,date:d(back),amount:amt,description:t[0],category:t[1],cardId:t[2]});}
}
const demoCards=[
  {id:'c1',name:'İş Genç',type:'Kredi',color:'#ef4444',limit:40000,statementDay:5,dueDay:15},
  {id:'c2',name:'İş',type:'Kredi',color:'#3b82f6',limit:60000,statementDay:20,dueDay:30},
  {id:'c3',name:'QNB',type:'Kredi',color:'#10b981',limit:25000,statementDay:null,dueDay:(today.getDate()%28)+2},
  {id:'c4',name:'QNB Fix',type:'Kredi',color:'#f59e0b',limit:0,statementDay:null,dueDay:null},
  {id:'c5',name:'Enpara',type:'Kredi',color:'#8b5cf6',limit:15000,statementDay:12,dueDay:22},
  {id:'c6',name:'Hadi',type:'Kredi',color:'#06b6d4',limit:0,statementDay:null,dueDay:null},
  {id:'c7',name:'Enpara Banka',type:'Banka',color:'#ec4899',limit:0,statementDay:null,dueDay:null},
];

rep(/const firebaseConfig = \{[\s\S]*?const db = getFirestore\(app\);/,'');
rep(/import \{ initializeApp \}[^\n]*\nimport \{ getAuth[^\n]*\nimport \{ getFirestore[^\n]*\n/,`
// ---- DEMO: Firebase yerine bellek içi sahte sürüm ----
const __S={'users/demo/txs':Object.fromEntries(${JSON.stringify(demoTx)}.map(t=>[t.id,t])),'users/demo/cards':Object.fromEntries(${JSON.stringify(demoCards)}.map(c=>[c.id,c]))};const __L={};
const __snap=p=>({metadata:{fromCache:false,hasPendingWrites:false},docs:Object.values(__S[p]||{}).map(x=>({data:()=>JSON.parse(JSON.stringify(x))}))});
const __emit=p=>(__L[p]||[]).forEach(cb=>cb(__snap(p)));
const collection=(db,p)=>({path:p.replace(/^users\\/[^/]+/,'users/demo')});
const doc=(c,id)=>({path:c.path,id});
const setDoc=async(r,x)=>{(__S[r.path]??={})[r.id]=JSON.parse(JSON.stringify(x));__emit(r.path);};
const deleteDoc=async r=>{delete (__S[r.path]||{})[r.id];__emit(r.path);};
const onSnapshot=(c,cb)=>{(__L[c.path]??=[]).push(cb);setTimeout(()=>cb(__snap(c.path)),0);return()=>{__L[c.path]=__L[c.path].filter(f=>f!==cb);};};
const writeBatch=()=>{const ops=[];return{set:(r,x)=>ops.push(()=>setDoc(r,x)),delete:r=>ops.push(()=>deleteDoc(r)),commit:async()=>{for(const o of ops)await o();}};};
let __authCb=null;
const auth={},db={};
class GoogleAuthProvider{}
const onAuthStateChanged=(a,cb)=>{__authCb=cb;setTimeout(()=>cb(null),0);};
const signInWithPopup=async()=>{__authCb&&__authCb({uid:'demo',displayName:'Demo Kullanıcı',email:'demo@ornek.test',photoURL:''});};
const fbSignOut=async()=>{__authCb&&__authCb(null);};
`);
rep(/let QP=null;\nimport\('\.\/quick-parse\.js[^\n]*\n/,`const QP=(()=>{\n${qp}\nreturn{parseQuick,frequentDescriptions};})();\n`);
if(/gstatic|firebaseConfig|apiKey/.test(s))throw new Error('Firebase izi kaldı');
fs.writeFileSync(out,s);
console.log('Yazıldı:',out,(s.length/1024).toFixed(1)+' KB');
