// SPDX-License-Identifier: GPL-2.0-or-later
import {createAgc,KEYS,ROMS} from './agc-core.mjs';
import {DskyState} from './dsky.mjs';
let cpu,display,running=false,last=0,credit=0,queue=[],nextKey=0,heartbeat=0;
const send=(type,data={})=>postMessage({type,...data});
const fail=error=>{running=false;send('error',{message:String(error.message??error)})};
async function bytes(url){const response=await fetch(url);if(!response.ok)throw new Error('文件加载失败：'+response.status);return new Uint8Array(await response.arrayBuffer())}
onmessage=async({data})=>{try{
 if(data.type==='init'){
  if(cpu)throw new Error('Emulator already initialized');
  const craft=Object.hasOwn(ROMS,data.craft)?data.craft:'lm';
  const [wasmBytes,romBytes]=await Promise.all([bytes(new URL('../vendor/agc/yaAGC.wasm',import.meta.url)),bytes(new URL('../assets/agc/'+ROMS[craft].file,import.meta.url))]);
  display=new DskyState();cpu=await createAgc({wasmBytes,romBytes,craft,onOutput:(c,v)=>display.accept(c,v)});running=true;last=performance.now();
  send('ready',{craft,program:ROMS[craft].file,version:cpu.version});send('display',{state:display});
 }else if(data.type==='pause'){running=false;queue=[];if(cpu)cpu.proceed(false);send('paused')}
 else if(data.type==='resume'&&cpu){running=true;last=performance.now();credit=0;send('running')}
 else if(data.type==='keys'){
  if(!cpu||!running){send('notice',{message:'先恢复模拟器运行，再输入按键。'});return}
  if(!Array.isArray(data.keys)||data.keys.some(k=>!Object.hasOwn(KEYS,k)&&!['PRO_DOWN','PRO_UP'].includes(k)))throw new Error('未知按键');
  if(queue.length+data.keys.length>48){send('notice',{message:'按键尚在处理，请稍后继续。'});return}
  queue.push(...data.keys);
 }
 }catch(error){fail(error)}};
setInterval(()=>{if(!running||!cpu)return;try{
 const now=performance.now();credit+=Math.min(now-last,80)/.01172;last=now;
 let steps=Math.min(Math.floor(credit),6800);credit-=steps;
 while(steps>0){
  if(queue.length&&cpu.cycles>=nextKey){const key=queue.shift();if(key==='PRO_DOWN')cpu.proceed(true);else if(key==='PRO_UP')cpu.proceed(false);else cpu.key(KEYS[key]);nextKey=cpu.cycles+12000;send('key',{key,pending:queue.length,cycle:cpu.cycles})}
  const n=Math.min(1000,steps);cpu.step(n);steps-=n;
 }
 send('display',{state:display});
 if(now-heartbeat>500){heartbeat=now;send('telemetry',{cycles:cpu.cycles,packets:cpu.packets,pending:queue.length,channels:cpu.channels})}
 }catch(error){fail(error)}},20);
