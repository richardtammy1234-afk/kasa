// Emülatör testleri için ortak altyapı: GERÇEK Firebase SDK 10.11.0 (canlıyla aynı) yerel Auth ve
// Firestore emülatörlerine bağlanır. Proje kimliği "demo-kasa"ya çevrilir; diğer tüm dış istekler engellenir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const OUT=path.join(ROOT,'test-results');fs.mkdirSync(OUT,{recursive:true});
export const PROJECT='demo-kasa';
const FS='http://127.0.0.1:8080',AUTH='http://127.0.0.1:9099',OWNER={Authorization:'Bearer owner'};
const FB=path.join(ROOT,'node_modules/firebase');
const G='https://www.gstatic.com/firebasejs/10.11.0/';

export const serve=root=>new Promise(r=>{
  const s=http.createServer((req,res)=>{
    const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
    const f=path.join(root,p==='/'?'index.html':p);
    if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
    fs.createReadStream(f).pipe(res);
  });
  s.listen(0,'127.0.0.1',()=>r(s));
});

const mods=sub=>({
  'firebase-app.js':`import * as A from '${G}real/firebase-app.js';export * from '${G}real/firebase-app.js';
    export const initializeApp=cfg=>A.initializeApp({...cfg,projectId:'${PROJECT}',apiKey:'demo-api-key',authDomain:'127.0.0.1'});`,
  'firebase-auth.js':`import * as A from '${G}real/firebase-auth.js';export * from '${G}real/firebase-auth.js';
    export const getAuth=app=>{const a=A.getAuth(app);if(!a.emulatorConfig)A.connectAuthEmulator(a,'${AUTH}',{disableWarnings:true});return a;};
    export const signInWithPopup=auth=>A.signInWithCredential(auth,A.GoogleAuthProvider.credential(JSON.stringify({sub:'${sub}',email:'${sub}@example.com',email_verified:true})));`,
  'firebase-firestore.js':`import * as F from '${G}real/firebase-firestore.js';export * from '${G}real/firebase-firestore.js';
    let done=false;export const getFirestore=app=>{const d=F.getFirestore(app);if(!done){F.connectFirestoreEmulator(d,'127.0.0.1',8080);done=true;}return d;};`,
});
const realBody=name=>fs.readFileSync(path.join(FB,name),'utf8').replaceAll(`${G}firebase-app.js`,`${G}real/firebase-app.js`);

// Bir Google kimliğiyle (sub) ayrı tarayıcı oturumu
export const external=[];
export const newBrowser=async sub=>{
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR',timezoneId:'Europe/Istanbul',acceptDownloads:true});
  const M=mods(sub);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
    const u=route.request().url();
    if(u.startsWith(G+'real/'))return route.fulfill({contentType:'text/javascript',body:realBody(u.slice((G+'real/').length))});
    if(u.startsWith(G)&&M[u.slice(G.length)])return route.fulfill({contentType:'text/javascript',body:M[u.slice(G.length)]});
    if(/^https:\/\/www\.google\.com\/images\/cleardot\.gif/.test(u))return route.fulfill({status:204,body:''});
    if(u.includes('chart'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{destroy(){}};'});
    external.push(u);return route.abort();
  });
  return {browser,ctx};
};

// --- emülatör REST (yönetici erişimi; yalnızca test kurulumu ve doğrulama için) ---
export const j=async(url,opt={})=>{const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...OWNER,...opt.headers}});const t=await r.text();if(!r.ok)throw new Error(`${r.status} ${t}`);return t?JSON.parse(t):{};};
const docsUrl=p=>`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`;
const val=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?v.doubleValue:'nullValue'in v?null:'booleanValue'in v?v.booleanValue:v;
const toFs=o=>({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):v===null?{nullValue:null}:{stringValue:String(v)}]))});
export const resetEmulators=async()=>{
  await j(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,{method:'DELETE'});
  await j(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`,{method:'DELETE'});
};
const seenUids=new Set();
export const newestUid=async()=>{
  const r=await j(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,{method:'POST',body:'{}'});
  const u=r.userInfo.map(x=>x.localId).find(x=>!seenUids.has(x));seenUids.add(u);return u;
};
export const putDoc=(col,o)=>j(docsUrl(col)+`?documentId=${encodeURIComponent(o.id)}`,{method:'POST',body:JSON.stringify(toFs(o))});
export const patchDoc=(col,id,o)=>j(docsUrl(`${col}/${id}`),{method:'PATCH',body:JSON.stringify(toFs(o))});
export const delDoc=(col,id)=>j(docsUrl(`${col}/${id}`),{method:'DELETE'});
// Bir kullanıcının tüm kart ve işlemleri: {cards:{id:{...}}, txs:{id:{...}}}
export const snapshot=async uid=>{
  const out={};
  for(const c of ['cards','txs']){
    out[c]={};let token='';
    do{const r=await j(docsUrl(`users/${uid}/${c}`)+`?pageSize=300${token?`&pageToken=${token}`:''}`);
      for(const d of r.documents||[])out[c][d.name.split('/').pop()]=Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,val(v)]));
      token=r.nextPageToken||'';}while(token);
  }
  return out;
};
export const waitFor=async(fn,ms=15000)=>{const t=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-t>ms)throw new Error('zaman aşımı');await new Promise(r=>setTimeout(r,200));}};

export const runner=()=>{
  const results=[];
  return {
    step:async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message]);}},
    finish:()=>{for(const r of results)console.log(r[0]==='ok'?'✔':'✘',r[1],r[2]?'— '+r[2]:'');const f=results.filter(r=>r[0]!=='ok').length;console.log(`\n${results.length-f}/${results.length} geçti`);return f?1:0;},
  };
};
