import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createAgc,KEYS,ROMS} from '../console/agc-core.mjs';
import {DskyState} from '../console/dsky.mjs';

for(const craft of ['lm','cm']){
 const wasmBytes=await fs.readFile(new URL('../vendor/agc/yaAGC.wasm',import.meta.url));
 const romBytes=await fs.readFile(new URL('../assets/agc/'+ROMS[craft].file,import.meta.url));
 const display=new DskyState();const cpu=await createAgc({wasmBytes,romBytes,craft,onOutput:(c,v)=>display.accept(c,v)});
 const tick=n=>{for(let i=0;i<n;i+=1000)cpu.step(Math.min(1000,n-i))};
 const type=keys=>{for(const key of keys){cpu.key(KEYS[key]);tick(15000)}};
 tick(300000);type(['VERB','3','5','ENTR']);tick(50000);
 assert.equal(display.program.join(''),'88',craft+' V35 PROG');
 assert.equal(display.verb.join(''),'88',craft+' V35 VERB');
 assert.equal(display.noun.join(''),'88',craft+' V35 NOUN');
 assert.ok(display.registers.every(r=>r.join('')==='88888'),craft+' V35 registers');
 tick(500000);type(['VERB','3','7','ENTR','0','0','ENTR']);tick(160000);
 assert.equal(display.program.join(''),'00',craft+' V37 P00');
 for(const [verb,noun] of [['12','34'],['56','78'],['90','12']]){
  type(['VERB',...verb,'NOUN',...noun]);
  assert.equal(display.verb.join(''),verb,craft+' actual PINBALL VERB echo '+verb);
  assert.equal(display.noun.join(''),noun,craft+' actual PINBALL NOUN echo '+noun);
 }
 const cycles=cpu.cycles;assert.ok(cycles>1000000);assert.match(cpu.version,/ddc65e7be$/);
 assert.throws(()=>cpu.key(99),/key/);assert.throws(()=>cpu.step(-1),/steps/);
 const damaged=romBytes.slice();damaged[0]^=1;
 await assert.rejects(()=>createAgc({wasmBytes,romBytes:damaged,craft}),/checksum/);
 console.log(JSON.stringify({craft,program:ROMS[craft].file,version:cpu.version,cycles,lamp_test:'all 21 digits are 8',P00:'00',distinct_digit_echo:'12/34,56/78,90/12',tamper_rejected:true}));
}
