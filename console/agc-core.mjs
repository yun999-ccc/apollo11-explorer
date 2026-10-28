// SPDX-License-Identifier: GPL-2.0-or-later
// Browser adapter for the unmodified yaAGC WASM build. No flight-software
// commands or displayed values are implemented here; they come from the ROM.
export const ROMS=Object.freeze({
 cm:{file:'Comanche055.bin',title:'指令舱 Columbia',sha256:'2ba31de9291cd10fb351a64d261bae8514a1cb75b4651bfa6a135dfa821a2d79'},
 lm:{file:'Luminary099.bin',title:'登月舱 Eagle',sha256:'1f5326e038de5b741b2f27b01ec949dbd688cf1906994e997402587c8628f40e'}
});
export const KEYS=Object.freeze({'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'0':16,VERB:17,RSET:18,'KEY REL':25,'+':26,'−':27,ENTR:28,CLR:30,NOUN:31});
const WASM_SHA='a595f3ad3cc6833638b49879e2d41149a7327b1a10577828f50466d6c7747f14';
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')}
export async function createAgc({wasmBytes,romBytes,craft,onOutput=()=>{}}){
 if(!Object.hasOwn(ROMS,craft))throw new Error('Unknown spacecraft');
 if(romBytes.byteLength!==73728||await sha256(romBytes)!==ROMS[craft].sha256)throw new Error('ROM checksum mismatch');
 if(await sha256(wasmBytes)!==WASM_SHA)throw new Error('Emulator checksum mismatch');
 const memory=new WebAssembly.Memory({initial:5});
 const view=()=>new DataView(memory.buffer);
 // This WASM imports only four WASI calls, used for console diagnostics. No
 // filesystem, network, entropy, wall clock or substitute AGC instructions.
 const wasi={
  fd_close:fd=>fd<=2?0:8,
  fd_seek:()=>8,
  fd_fdstat_get:(fd,p)=>{if(fd>2)return 8;new Uint8Array(memory.buffer,p,24).fill(0);view().setUint8(p,2);return 0},
  fd_write:(fd,iovs,n,written)=>{if(fd>2)return 8;let total=0;for(let i=0;i<n;i++)total+=view().getUint32(iovs+i*8+4,true);view().setUint32(written,total,true);return 0}
 };
 const {instance}=await WebAssembly.instantiate(wasmBytes,{env:{memory},wasi_snapshot_preview1:wasi});const e=instance.exports;
 const at=e.version(),a=new Uint8Array(memory.buffer);let end=at;while(a[end])end++;
 const version=new TextDecoder().decode(a.slice(at,end));if(version!=='2020-12-24 ddc65e7be')throw new Error('Unexpected emulator version');
 const pointer=e.malloc(romBytes.byteLength);if(!pointer)throw new Error('ROM allocation failed');
 new Uint8Array(memory.buffer).set(new Uint8Array(romBytes.buffer??romBytes,romBytes.byteOffset??0,romBytes.byteLength),pointer);
 e.set_fixed(pointer);e.free(pointer);e.cpu_reset();
 const write=(channel,value)=>{if(e.packet_write(channel,value)<=0)throw new Error('AGC input queue full')};
 // Packet mask bit is OR'ed with the channel (not AND'ed). PRO is active-low.
 write(0o32|0x100,1<<13);write(0o32,1<<13);write(0o15|0x100,0o37);
 let cycles=0,packets=0;const channels={};
 return {
  version,craft,get cycles(){return cycles},get packets(){return packets},channels,
  key(code){if(!Object.values(KEYS).includes(code))throw new Error('Invalid DSKY key');write(0o15,code)},
  proceed(down){write(0o32,down?0:1<<13)},
  step(steps){if(!Number.isSafeInteger(steps)||steps<0||steps>7000)throw new Error('Invalid CPU steps');e.cpu_step(steps);cycles+=steps;let value,count=0;while((value=e.packet_read())!==0){if(++count>10000)throw new Error('AGC output queue did not drain');const channel=value>>>16,data=value&0x7fff;channels[channel]=data;packets++;onOutput(channel,data)}},
  // Read-only diagnostics. Registers are never written to produce UI results.
  inspect(){const ptr=e.get_erasable_ptr();return Array.from(new Uint16Array(memory.buffer,ptr,32))}
 };
}
