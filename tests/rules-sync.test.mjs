// Emülatör testleri canlıya dağıtılan kurallarla çalışsın: iki dosyanın kural gövdesi aynı olmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const body=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,'').replace(/\s+/g,' ').trim();
test('emülatör kuralları canlı kurallarla aynı',()=>{
  assert.equal(body('./emulator/firestore.rules'),body('../firestore.rules'));
});
