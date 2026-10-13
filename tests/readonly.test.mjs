// yedek.html'in salt okunur kaldığını garanti eder: Firestore'dan yalnızca okuma işlevleri içe aktarılabilir,
// kodda hiçbir yazma/silme işlevi geçemez ve sayfa yalnızca Firebase'in kendi adreslerinden kod yükler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../yedek.html',import.meta.url),'utf8');

test('Firestore\'dan yalnızca okuma işlevleri içe aktarılır',()=>{
  const m=html.match(/import\s*\{([^}]*)\}\s*from\s*'https:\/\/www\.gstatic\.com\/firebasejs\/10\.11\.0\/firebase-firestore\.js'/);
  assert.ok(m,'firestore içe aktarımı bulunamadı');
  const names=m[1].split(',').map(x=>x.trim()).filter(Boolean).sort();
  assert.deepEqual(names,['collection','getDocs','getFirestore']);
});

test('kodda yazma/silme işlevi yok',()=>{
  for(const fn of ['setDoc','addDoc','updateDoc','deleteDoc','writeBatch','runTransaction','deleteField','increment','arrayUnion','arrayRemove'])
    assert.ok(!html.includes(fn),fn+' bulunmamalı');
});

test('dış kod yalnızca Firebase SDK\'sından (canlıyla aynı sürüm) yüklenir',()=>{
  const urls=[...html.matchAll(/(?:from\s*'|src=")(https?:\/\/[^'"]+)/g)].map(m=>m[1]);
  assert.ok(urls.length>0);
  for(const u of urls)assert.match(u,/^https:\/\/www\.gstatic\.com\/firebasejs\/10\.11\.0\/firebase-(app|auth|firestore)\.js$/);
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(html),'sayfa veri göndermemeli');
});

test('arama motorlarına kapalı ve süreli',()=>{
  assert.match(html,/<meta name="robots" content="noindex, nofollow">/);
  assert.match(html,/const EXPIRES='\d{4}-\d{2}-\d{2}'/);
});

test('aynı Firebase projesini kullanır (kurallar/ayarlar değişmeden)',()=>{
  const idx=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const cfg=s=>s.match(/projectId:\s*"([^"]+)"/)[1];
  assert.equal(cfg(html),cfg(idx));
});
