// Read the real WASM input words while exercising the production adapter.
// Test-only memory inspection; no mock CPU or simulated expected output.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAgc} from '../console/agc-core.mjs';
const wasmBytes=await readFile(new URL('../vendor/agc/yaAGC.wasm',import.meta.url));
const romBytes=await readFile(new URL('../assets/agc/Luminary099.bin',import.meta.url));
const instantiate=WebAssembly.instantiate;
let memory,exports;
WebAssembly.instantiate=async (...args)=>{
  const result=await instantiate(...args);
  memory=args[1].env.memory;exports=result.instance.exports;
  return result;
};
let agc;
try { agc=await createAgc({wasmBytes,romBytes,craft:'lm'}); }
finally { WebAssembly.instantiate=instantiate; }
// agc_engine.h: Erasable[8][0400], Fixed[40][02000], uint32 Parities[1280], InputChannel[512].
const inputPointer=exports.get_erasable_ptr()+2*(8*256+40*1024)+4*1280;
const inputs=new Uint16Array(memory.buffer,inputPointer,512);
agc.step(4000);
exports.packet_write(0x100|0o30,0o77777);
exports.packet_write(0o30,0o52525);
agc.step(4000);
assert.equal(inputs[0o30],0o52525);
const beforeProceed=inputs[0o32];
for(const enabled of [false,true,false,true]){
  agc.setAutoThrottle(enabled);agc.step(4000);
  assert.equal(inputs[0o30],(0o52525&~16)|(enabled?16:0));
  assert.equal(inputs[0o32],beforeProceed,'Throttle selector must preserve PRO and gimbal inputs');
}
assert.throws(()=>agc.setAutoThrottle(1));
console.log('Real WASM: AUTO/MAN changes channel 030 bit 5; all other input bits preserved. Flight closed loop not tested.');
