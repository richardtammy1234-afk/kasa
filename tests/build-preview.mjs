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
rep(/<\/head>\s*<body>/,'');
rep(/<\/body>\s*<\/html>\s*$/,'');
// Tema: görüntüleyicinin açık/koyu seçimine de uy
rep('@media(prefers-color-scheme:dark){\n  :root{','@media(prefers-color-scheme:dark){\n  :root:not([data-theme="light"]){color-scheme:dark;');
const dark=s.match(/:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/)[1];
rep('/* LOGIN */',`:root[data-theme="dark"]{${dark}}\n/* LOGIN */`);
rep('.app{height:100vh;height:100dvh;','.app{height:100%;');
rep(/<img src="https:\/\/www\.google\.com\/favicon\.ico" alt="Google">/,'');
rep('Google ile Giriş Yap','Demo hesapla gir');
rep(/Veriler sadece senin Google hesabına bağlıdır\. Başkası göremez\./,'Bu bir önizlemedir: tüm veriler sahtedir ve yalnızca bu tarayıcı sekmesinde durur. Gerçek Kasa hesabına bağlanmaz.');
rep('/* APP */','.demo-bar{flex-shrink:0;background:var(--amb);color:#1a1300;font-size:11px;font-weight:600;text-align:center;padding:4px 8px;letter-spacing:.2px;}\n/* APP */');
rep('<div class="app" id="app" style="display:none">','<div class="app" id="app" style="display:none">\n<div class="demo-bar">ÖNİZLEME · sahte veri · gerçek hesaba bağlı değil</div>');

// Firebase -> bellek içi sahte sürüm
const today=new Date();
const d=(back)=>{const x=new Date(today.getFullYear(),today.getMonth(),today.getDate()-back);return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const demoTx=[
  ['Migros',612.4,'Market','c2',1],['Kahve',95,'Kafe','c5',1],['Benzin',1450,'Ulaşım','c3',3],['Kahve',110,'Kafe','c5',4],
  ['A101',238.9,'Market','c2',6],['Netflix',229.99,'Eğlence','c1',8],['Eczane',184.5,'Sağlık','c7',10],['Döner',160,'Yemek','c5',12],
  ['Elektrik faturası',845.3,'Fatura','c7',20],['Migros',1032.15,'Market','c2',33],['Zara',1899,'Giyim','c1',38],['Benzin',1380,'Ulaşım','c3',41],
].map(([description,amount,category,cardId,back],i)=>({id:'demo'+i,date:d(back),amount,description,category,cardId}));

rep(/const firebaseConfig = \{[\s\S]*?const db = getFirestore\(app\);/,'');
rep(/import \{ initializeApp \}[^\n]*\nimport \{ getAuth[^\n]*\nimport \{ getFirestore[^\n]*\n/,`
// ---- DEMO: Firebase yerine bellek içi sahte sürüm ----
const __S={'users/demo/txs':Object.fromEntries(${JSON.stringify(demoTx)}.map(t=>[t.id,t]))};const __L={};
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
