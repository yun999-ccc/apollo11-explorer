// SPDX-License-Identifier: GPL-2.0-or-later
import {ROMS} from './agc-core.mjs';
import {SEGMENTS,DskyState} from './dsky.mjs';
import paths from './glyphs.mjs';
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const craft=new URLSearchParams(location.search).get('craft')==='cm'?'cm':'lm';
const details={lm:{context:'Apollo 11（阿波罗11号） · LM-5（登月舱5号） · LGC（登月舱制导计算机）',assembly:'6014999-091',dsky:'2003994-091',alarm:'1005025-001',scan:'1005025-original.pdf'},cm:{context:'Apollo 11（阿波罗11号） · CM-107（指令舱107号） · CMC（指令舱计算机）',assembly:'2014999-101',dsky:'2003994-121',alarm:'1006387-002／-003',scan:'1006387D-original.pdf'}}[craft];
$('#craft-name').textContent=ROMS[craft].title+(craft==='lm'?'（鹰号）':'（哥伦比亚号）');$('#rom-name').textContent=ROMS[craft].file.replace('.bin','')+(craft==='lm'?'（登月舱程序）':'（指令舱程序）');$('#rom-context').textContent=details.context;$('#back-exterior').href='../?focus='+craft;
$$('[data-craft]').forEach(a=>{if(a.dataset.craft===craft)a.setAttribute('aria-current','page')});
$('#panel-drawing').src='../assets/agc/'+craft+'-alarm.webp';$('#panel-drawing').alt=details.alarm+'原始指示灯面板图';$('#panel-drawing-caption').textContent=details.alarm+' · 第3张图。空白区域按原图保留。';$('#alarm-drawing-link').href='../assets/agc/'+details.scan;
$('#configuration-source').innerHTML='任务装配关系：<a target="_blank" rel="noopener" href="https://www.ibiblio.org/apollo/'+details.assembly+'.html">'+details.assembly+'</a> → DSKY（键盘显示器） '+details.dsky+' → 指示器 '+details.alarm+'。';
// Chinese annotations explain the original labels; hardware names and key IDs stay unchanged.
const keyMeanings={VERB:'操作码',NOUN:'数据码',CLR:'清除',PRO:'继续','KEY REL':'释放键盘',ENTR:'确认输入',RSET:'警示复位','+':'正号','−':'负号'};
const displayMeanings={program:'PROG（程序号）',verb:'VERB（操作码）',noun:'NOUN（数据码）'};
function bilingualLabel(el,english,chinese){const en=document.createElement('span');en.className='label-en';en.textContent=english;el.append(en);if(chinese){const zh=document.createElement('small');zh.className='label-zh';zh.textContent='（'+chinese+'）';el.append(zh)}}
const names=[['uplink','UPLINK ACTY','上行通信活动'],['temp','TEMP','温度'],['noatt','NO ATT','无姿态参考'],['gimbal','GIMBAL LOCK','万向架锁定'],['standby','STBY','待机'],['prog','PROG','程序警报'],['keyrel','KEY REL','请求释放键盘'],['restart','RESTART','重启提示'],['oprerr','OPR ERR','操作错误'],['tracker','TRACKER','跟踪器'],['','',''],[craft==='lm'?'altitude':'',craft==='lm'?'ALT':'',craft==='lm'?'高度':''],['','',''],[craft==='lm'?'velocity':'',craft==='lm'?'VEL':'',craft==='lm'?'速度':'']];
const lamps={};names.forEach(([name,label,meaning],i)=>{const el=document.createElement('div');el.className='lamp'+(i%2?' caution':'')+(name?'':' blank');if(name){bilingualLabel(el,label,meaning);el.dataset.lamp=name;el.dataset.label=label+'（'+meaning+'）';el.setAttribute('role','img');el.setAttribute('aria-label',el.dataset.label+' 未亮');lamps[name]=el}else el.setAttribute('aria-hidden','true');$('#annunciators').append(el)});
const glyphs={};function glyph(type){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 12 14');svg.setAttribute('class','digit'+(type==='sign'?' sign':''));svg.setAttribute('aria-hidden','true');for(const [letter,d] of Object.entries(paths[type])){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);p.dataset.segment=letter;svg.append(p)}return svg}
for(const name of ['program','verb','noun']){glyphs[name]=Array.from({length:2},()=>glyph('digit'));glyphs[name].forEach(g=>$('#'+name).append(g))}
for(let i=0;i<3;i++){const name='register'+(i+1);glyphs[name]=[glyph('sign'),...Array.from({length:5},()=>glyph('digit'))];glyphs[name].forEach(g=>$('#'+name).append(g))}
function paint(g,segments){if(g.dataset.segments===segments)return;g.dataset.segments=segments;for(const p of g.children)p.classList.toggle('on',segments.includes(p.dataset.segment))}
function render(s){
 for(const name of ['program','verb','noun']){s.codes[name].forEach((code,i)=>paint(glyphs[name][i],SEGMENTS[code]));const value=s[name].join('');$('#'+name).dataset.value=value;$('#'+name).setAttribute('aria-label',displayMeanings[name]+' '+(value.trim()||'空白'))}
 for(let r=0;r<3;r++){const name='register'+(r+1),sign=s.signs[r];paint(glyphs[name][0],sign==='+'?'abc':sign==='−'?'b':'');s.codes.registers[r].forEach((code,i)=>paint(glyphs[name][i+1],SEGMENTS[code]));const value=sign+s.registers[r].join('');$('#'+name).dataset.value=value;$('#'+name).setAttribute('aria-label','寄存器'+(r+1)+' '+(value.trim()||'空白'))}
 for(const [name,el] of Object.entries(lamps)){const on=!!s.lamps[name];el.classList.toggle('on',on);el.setAttribute('aria-label',el.dataset.label+' '+(on?'亮':'未亮'))}
 $('#activity').classList.toggle('on',!!s.lamps.activity);$('.vn-row').classList.toggle('flash',s.flash);$('.digital-glass').classList.toggle('blank-el',s.elOff);
}
// ND-1021042 figure 4-223: the two side columns sit halfway between the
// three central rows. Keep all 19 keys, including the independent PRO contact.
const keyPositions=[['VERB',1,2],['NOUN',1,4],['+',2,1],['7',3,1],['8',4,1],['9',5,1],['CLR',6,1],['−',2,3],['4',3,3],['5',4,3],['6',5,3],['PRO',6,3],['0',2,5],['1',3,5],['2',4,5],['3',5,5],['KEY REL',6,5],['ENTR',7,2],['RSET',7,4]];
let worker,ready=false,running=false,proDown=false,pending=0,epoch=0;
const record={craft,rom:ROMS[craft].file,rom_sha256:ROMS[craft].sha256,started_at:new Date().toISOString(),keys:[],channels:{},cycles:0,version:null};
function status(text,kind=''){ $('#runtime-status').textContent=text;$('#runtime-dot').className=kind;$('#pause').disabled=!ready;$('#pause').textContent=running?'暂停':'继续运行';$$('.dsky-key').forEach(b=>b.disabled=!ready||!running);$$('#demo-lamps,#demo-p00').forEach(b=>b.disabled=!ready||!running||pending>0)}
function notice(text){$('#input-notice').textContent=text;$('#announcement').textContent=text}
function send(keys){if(!ready||!running){notice('先启动或恢复模拟器，再输入按键。');return}pending+=keys.length;worker.postMessage({type:'keys',keys});status('运行中','running')}
function releasePro(){if(proDown){proDown=false;send(['PRO_UP']);$$('[data-key="PRO"]').forEach(b=>b.classList.remove('pressed'))}}
for(const [key,col,row] of keyPositions){const button=document.createElement('button');button.type='button';button.className='dsky-key';button.dataset.key=key;button.disabled=true;button.setAttribute('aria-label',key+(keyMeanings[key]?'（'+keyMeanings[key]+'）':''));button.style.gridColumn=col;button.style.gridRow=row+' / span 2';bilingualLabel(button,key,keyMeanings[key]);$('#keypad').append(button);
 if(key==='PRO'){
  button.addEventListener('pointerdown',e=>{if(!ready||!running)return;e.preventDefault();button.focus();button.setPointerCapture(e.pointerId);proDown=true;button.classList.add('pressed');send(['PRO_DOWN'])});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,releasePro);
  button.addEventListener('click',e=>{if(e.detail===0)send(['PRO_DOWN','PRO_UP'])});
 }else button.addEventListener('click',()=>send([key]));
}
$('#dsky').addEventListener('keydown',e=>{
 if(e.ctrlKey||e.altKey||e.metaKey||e.repeat)return;
 if((e.key==='Enter'||e.key===' ')&&e.target instanceof HTMLButtonElement)return;
 const key=e.key.toLowerCase(),map={v:'VERB',n:'NOUN',c:'CLR',k:'KEY REL',r:'RSET',e:'ENTR',enter:'ENTR','+':'+','-':'−'};
 if(key==='p'){e.preventDefault();if(!proDown){proDown=true;send(['PRO_DOWN'])}return}
 const value=/^[0-9]$/.test(key)?key:map[key];if(value){e.preventDefault();send([value])}
});
$('#dsky').addEventListener('keyup',e=>{if(e.key.toLowerCase()==='p')releasePro()});window.addEventListener('blur',releasePro);
function logKey(key,cycle){const shown=key==='PRO_DOWN'?'PRO ↓':key==='PRO_UP'?'PRO ↑':key;record.keys.push({key,cycle});if(record.keys.length>2000){record.keys.shift();record.keys_truncated=true}const ol=$('#key-history');ol.querySelector('.empty')?.remove();const item=document.createElement('li');item.textContent=shown+(keyMeanings[key]?'（'+keyMeanings[key]+'）':key.startsWith('PRO_')?'（'+(key==='PRO_DOWN'?'按下继续键':'松开继续键')+'）':'');ol.append(item);while(ol.children.length>12)ol.firstElementChild.remove();const el=$$('[data-key]').find(b=>b.dataset.key===(key.startsWith('PRO_')?'PRO':key));if(el){el.classList.add('pressed');clearTimeout(el.releaseTimer);el.releaseTimer=setTimeout(()=>{if(el.dataset.key!=='PRO'||!proDown)el.classList.remove('pressed')},150)}}
function start(){
 const current=++epoch;worker?.terminate();ready=false;running=false;proDown=false;pending=0;record.keys=[];record.channels={};record.cycles=0;record.keys_truncated=false;record.started_at=new Date().toISOString();$('#key-history').innerHTML='<li class="empty">尚未输入按键</li>';$('#runtime-error').hidden=true;$('#input-notice').textContent='';$('#cycle-count').textContent='0';$('#packet-count').textContent='0';$('#sim-time').textContent='0.000 s（秒）';$('#emulator-version').textContent='正在核对';$('#dsky').setAttribute('aria-busy','true');render(new DskyState());status('加载并校验历史程序…');
 worker=new Worker(new URL('./agc-worker.mjs?v=agc-20261028-2',import.meta.url),{type:'module'});
 const failure=message=>{ready=false;running=false;pending=0;status('无法运行','failed');$('#dsky').setAttribute('aria-busy','false');$('#runtime-error').textContent='模拟器未能启动或继续运行：'+message+'。请点击重新启动；不会用预设动画替代程序。';$('#runtime-error').hidden=false;worker.terminate()};
 worker.onerror=e=>{if(current===epoch)failure(e.message||'工作线程载入失败')};
 worker.onmessage=({data})=>{if(current!==epoch)return;switch(data.type){
  case 'ready':ready=running=true;record.version=data.version;$('#emulator-version').textContent=data.version;$('#dsky').setAttribute('aria-busy','false');status('运行中','running');break;
  case 'display':render(data.state);break;
  case 'key':pending=data.pending;logKey(data.key,data.cycle);status('运行中','running');break;
  case 'telemetry':record.cycles=data.cycles;record.channels=data.channels;record.packets=data.packets;$('#sim-time').textContent=(data.cycles*.00001172).toFixed(3)+' s（秒）';$('#cycle-count').textContent=data.cycles.toLocaleString();$('#packet-count').textContent=data.packets.toLocaleString();break;
  case 'paused':running=false;pending=0;status('已暂停');notice('已暂停，当前显示保留。');break;
  case 'running':running=true;status('运行中','running');notice('已恢复运行。');break;
  case 'notice':notice(data.message);pending=0;status(running?'运行中':'已暂停',running?'running':'');break;
  case 'error':failure(data.message);break;
 }};
 worker.postMessage({type:'init',craft});
}
$('#pause').onclick=()=>{releasePro();worker?.postMessage({type:running?'pause':'resume'})};$('#restart').onclick=start;
function demonstrate(keys,message){send(keys);notice(message);if(innerWidth<761)$('.instrument-area').scrollIntoView({block:'start',behavior:'auto'})}
$('#demo-lamps').onclick=()=>demonstrate(['VERB','3','5','ENTR'],'按键已排队，正逐键写入AGC（阿波罗制导计算机）；请观察原程序的显示响应。');
$('#demo-p00').onclick=()=>demonstrate(['VERB','3','7','ENTR','0','0','ENTR'],'正在逐键请求切换到P00（空闲程序）。');
const showSource=()=>$('#source-dialog').showModal();$('#sources-open').onclick=showSource;$('#panel-source').onclick=showSource;$('#program-source').onclick=e=>{e.preventDefault();showSource()};$('#source-close').onclick=()=>$('#source-dialog').close();
$('#source-dialog').addEventListener('click',e=>{if(e.target===$('#source-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('#download-session').onclick=()=>{const blob=new Blob([JSON.stringify({...record,exported_at:new Date().toISOString(),note:'按键记录最多保留最近2000条；通道为最近状态，不是完整飞行遥测。'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.download='Apollo11-'+craft+'-session.json';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('pagehide',()=>{releasePro();worker?.terminate()});
window.addEventListener('pageshow',event=>{if(event.persisted)start()});
start();
