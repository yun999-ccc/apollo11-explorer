// SPDX-License-Identifier: GPL-2.0-or-later
// NASSP assets and pixel coordinates retained. Upstream sources ship in nassp/.
import {createPanelControls} from './panel-controls.mjs?v=cockpit-20261108-3';
import {createDescentHelium} from './descent-helium.mjs';
export async function createNativeCockpit(container, moonElement) {
  const coordinates = await fetch('nassp/coordinates.json').then(response => response.json());
  const names = {MAIN: 'lem_main_panel', LEFTWINDOW: 'lem_left_window', LPDWINDOW: 'lem_lpd_window'};
  const images = {};
  async function image(name) {
    const value = new Image(); value.src = 'nassp/' + name + '.png';
    await value.decode(); return value;
  }
  for (const [view, name] of Object.entries(names)) images[view] = await image(name);
  const digits = await image('digitaldisp'), display = await image('dsky_disp'), lamps = await image('dsky_lights');
  const controlData = await fetch('nassp/controls/controls.json').then(r => r.json());
  const sprites = {};
  for (const name of new Set(controlData.controls.map(c => c.sprite))) sprites[name] = await image('controls/' + name);
  const indicator = await image('controls/Indicator');
  const descentHelium = createDescentHelium();
  let lastIndicatorTime = performance.now();
  let indicatorFrame = null;
  const canvas = document.createElement('canvas');
  canvas.id = 'native-panel'; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'NASSP原始面板，拖动平移，滚轮缩放，点击原始DSKY按键操作');
  container.append(moonElement, canvas);
  const context = canvas.getContext('2d');
  let view = 'MAIN', rect = [600, 100, 1490, 1180], scale = 1, ox = 0, oy = 0;
  let width = 1, height = 1, dskyState = null, hover = null, moved = false, previous = null;
  let ready = false, worker;
  let selectedControl = null, heldControl = null, pinnedControl = null, acknowledgedThrottle = null;
  const inspector = id => document.querySelector('#control-' + id);
  const panel = createPanelControls(controlData.controls, {
    onSignal(signal) { if (ready) worker.postMessage({type: signal.name, value: signal.value}); },
    onChange(c) {
      advanceTalkbacks();
      if (c) {
        descentHelium.move(c.id, panel.state[c.id]);
        describe(c.id);
      }
      draw();
    }
  });
  function advanceTalkbacks() {
    const now = performance.now();
    descentHelium.advance((now - lastIndicatorTime) / 1000);
    lastIndicatorTime = now;
  }
  function describe(id, pin = false) {
    if (pin) pinnedControl = id;
    selectedControl = id;
    const c = panel.inspect(id);
    inspector('title').textContent = `${c.english}（${c.chinese}）`;
    inspector('state').textContent = c.blocked ? '当前仅显示原图，真实按钮状态尚未建模。' : `开关位置：${c.current}。` + (c.spring ? ' 松手回中。' : ' 保持当前位置。');
    inspector('purpose').textContent = c.purpose;
    const regulator = descentHelium.inspect(id);
    if (regulator) {
      inspector('coverage').textContent = `调节器阀门：${regulator.open ? 'OPEN（打开）' : 'CLOSED（关闭）'}。反馈窗随阀位变化。初始阀位取自 NASSP 下降前存档，指令和指示回路采用 28 V 标称供电。此阀门模型独立于下降工程模型。`;
    } else {
      inspector('coverage').textContent = c.blocked ? '尚未实现系统动作，本按钮暂不执行指令。' : c.systemConnected ? `AGC输入已接线${acknowledgedThrottle===Boolean(c.value)?'，已收到计算机确认':'，等待计算机确认'}；发动机与飞行闭环未接通。` : '当前实现档位操作；系统电气、阀门与仪表反馈尚未接通。';
    }
    inspector('source').href = `https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lempanel.cpp#L${c.line}`;
    inspector('source').textContent = `原始控件定义 · 第${c.line}行 ↗`;
    inspector('select').value = id;
    const actions = inspector('actions');
    // Keep focused/held buttons alive while state changes.
    if(actions.dataset.control!==id) {
      actions.dataset.control=id; actions.replaceChildren();
      for(const direction of [-1,1]) {
        const button=document.createElement('button');
        button.textContent=c.kind==='rotary'?(direction>0?'下一档 →':'← 上一档'):(direction>0?'向上拨动 ↑':'向下拨动 ↓');
        button.disabled=c.blocked;
        button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);operate(id,direction);heldControl=id;});
        for(const eventName of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(eventName,releaseHeld);
        button.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&!event.repeat){event.preventDefault();operate(id,direction);heldControl=id;}});
        button.addEventListener('keyup',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();releaseHeld();}});
        button.addEventListener('blur',releaseHeld);
        actions.append(button);
      }
    }
  }
  function operate(id,direction) {
    const outcome=panel.move(id,direction);
    describe(id,true);
    inspector('feedback').textContent=outcome.accepted ? (outcome.changed ? '档位已改变。' : '已经在该方向的端位。') : outcome.reason;
    draw();
  }
  function releaseHeld() {
    const id=heldControl;heldControl=null;
    if(id){panel.release(id);describe(id,true);draw();}
  }
  for(const c of panel.controls){const option=document.createElement('option');option.value=c.id;option.textContent=`${c.english}（${c.chinese}）`;inspector('select').append(option);}
  inspector('select').addEventListener('change',event=>{if(event.target.value)describe(event.target.value,true);});
  function controlAt(x,y) {
    return panel.controls.find(c=>{
      const r=controlRect(c);return r&&x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3];
    });
  }
  function controlRect(c) {
    const current=zone(c.area),original=coordinates.views.MAIN.find(z=>z.id===c.area)?.rect;
    if(!current||!original)return null;
    return [c.rect[0]+current[0]-original[0],c.rect[1]+current[1]-original[1],c.rect[2]+current[0]-original[0],c.rect[3]+current[1]-original[1]];
  }
  function drawControls() {
    const angles=[0,30,60,90,120,150,180,210,240,270,300,330,20,45,70,110,135,160,200,225,250,290,315,340];
    for(const c of panel.controls){
      const r=controlRect(c);if(!r||['abort','alarm'].includes(c.kind))continue;
      const w=r[2]-r[0],h=r[3]-r[1],v=panel.state[c.id];
      let sx=(c.kind==='two'?1-v:v)*w,sy=0;
      if(c.kind==='rotary'){
        const difference=a=>Math.abs(((a-c.angles[v]+540)%360)-180);
        const index=angles.reduce((best,a,i)=>difference(a)<difference(angles[best])?i:best,0);
        sx=(index%12)*w;sy=Math.floor(index/12)*h;
      }
      context.drawImage(sprites[c.sprite],sx,sy,w,h,r[0],r[1],w,h);
      if(heldControl===c.id){context.strokeStyle='#d0bb71';context.lineWidth=1/scale;context.strokeRect(r[0],r[1],w,h);}
    }
  }
  function drawTalkbacks() {
    for (const c of panel.controls) {
      const regulator = descentHelium.inspect(c.id);
      if (!regulator) continue;
      const area = zone(c.area);
      if (area) stamp(indicator, 23 * regulator.frame, 0, 23, 23, area[0] + 7, area[1] + 134);
    }
  }
  const pointers = new Map();
  let pinchDistance = 0;
  const status = document.querySelector('#native-note');
  const meanings = {
    MFDLEFT:'左多功能显示区域', MFDRIGHT:'右多功能显示区域', LM_RCSIND:'反作用控制系统仪表',
    LM_ECSIND_UPPER:'环境控制系统上部仪表', LM_ECSIND_LOWER:'环境控制系统下部仪表',
    MAIN_PROP_AND_ENGINE_IND:'主推进与发动机仪表', THRUST_WEIGHT_INDICATOR:'推重比指示器',
    LM_CWS_LEFT:'左警告指示灯组', LM_CWS_RIGHT:'右警告指示灯组', ABORT:'中止与中止分级',
    ENG_ARM:'发动机预备', DESCENT_ENGINE_SWITCH:'下降发动机指令超控', MODECONTROL:'模式控制',
    DSKY_DISPLAY:'显示与键盘组件数字显示', DSKY_LIGHTS:'显示与键盘组件告警灯', DSKY_KEY:'显示与键盘组件按键',
    MISSION_CLOCK:'任务时钟', EVENT_TIMER:'事件计时器', MPS_OXID_QUANTITY_INDICATOR:'主推进氧化剂数量',
    MPS_FUEL_QUANTITY_INDICATOR:'主推进燃料数量', MPS_HELIUM_PRESS_INDICATOR:'主推进氦气压力',
    CONTACTLIGHT1:'月面接触指示灯1', CONTACTLIGHT2:'月面接触指示灯2', LEFTXPOINTERSWITCH:'左交叉指针量程',
    GUIDCONTSWITCHROW:'制导控制开关组', LEM_MA_LEFT:'左主警报', LEM_MA_RIGHT:'右主警报',
    LEFTMONITORSWITCHES:'左侧仪表监视选择', RIGHTMONITORSWITCHES:'右侧仪表监视选择',
    FDAILOWERSWITCHROW:'姿态指示器下部开关', MPS_REG_CONTROLS_LEFT:'主推进左调节器控制',
    MPS_REG_CONTROLS_RIGHT:'主推进右调节器控制', ENGINETHRUSTCONTSWITCHES:'发动机推力控制开关',
    PROPELLANTSWITCHES:'推进剂开关', HELIUMMONROTARY:'氦气监视旋钮', TEMPPRESSMONROTARY:'温度压力监视旋钮',
    ACAPROPSWITCH:'姿态控制器比例选择', RANGE_TAPE:'距离／高度带尺', RATE_TAPE:'距离率／高度变化率带尺',
    XPOINTERCDR:'指令长交叉指针', XPOINTERLMP:'登月舱驾驶员交叉指针',
    RCS_ASC_FEED_SWITCHES:'反作用控制系统上升推进剂供给开关', RCS_ASC_FEED_TALKBACKS:'上升推进剂供给状态',
    RCS_XFEED_SWITCH:'反作用控制交叉供给开关', RCS_XFEED_TALKBACK:'交叉供给状态',
    MAIN_SOV_SWITCHES:'主关断阀开关', MAIN_SOV_TALKBACKS:'主关断阀状态',
    ENGGIMBALENABLESWITCH:'发动机万向架使能', RADARANTTESTSWITCHES:'雷达天线测试开关',
    ATTITUDECONTROLSWITCHES:'姿态控制开关', SATBCONTSWITCHES:'稳定控制开关',
    TEMPMONITORROTARY:'温度监视旋钮', TEMPMONITORIND:'温度监视指示器',
    LIGHTINGSWITCHES:'照明开关', FLOODROTARY:'泛光照明旋钮', LAMPTONETESTROTARY:'灯与音调测试旋钮',
    PANEL4LEFTSWITCHROW:'4号面板左开关组', PANEL4RIGHTSWITCHROW:'4号面板右开关组',
    RIGHTXPOINTERSWITCH:'右交叉指针量程', EXTERIORLTGSWITCH:'外部照明开关'
  };
  function fit() {
    scale = Math.min(width / rect[2], height / rect[3]);
    ox = (width - rect[2] * scale) / 2 - rect[0] * scale;
    oy = (height - rect[3] * scale) / 2 - rect[1] * scale;
  }
  function resize() {
    width = container.clientWidth; height = container.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    fit(); draw();
  }
  function zone(id) { return coordinates.views[view].find(item => item.id === id)?.rect; }
  function stamp(sprite, sx, sy, sw, sh, x, y) { context.drawImage(sprite, sx, sy, sw, sh, x, y, sw, sh); }
  function drawLamps() {
    const box = zone('AID_DSKY_LIGHTS');
    if (!box || !dskyState) return;
    const positions = [['uplink',0,0],['noatt',0,25],['standby',0,49],['keyrel',0,73],['oprerr',0,97],['temp',52,0],['gimbal',52,25],['prog',52,49],['restart',52,73],['tracker',52,97],['altitude',52,121],['velocity',52,144]];
    for (const [name,x,y] of positions) stamp(lamps,x+(dskyState.lamps[name]?101:0),y,49,23,box[0]+x,box[1]+y);
  }
  function drawDsky() {
    const box = zone('AID_DSKY_DISPLAY');
    if (!box || !dskyState || dskyState.elOff) return;
    const [x, y] = box;
    if (dskyState.lamps.activity) stamp(display,0,0,35,31,x+6,y+4);
    stamp(display, 35, 0, 35, 10, x + 66, y + 3);
    stamp(display, 35, 10, 35, 10, x + 66, y + 38);
    stamp(display, 35, 20, 35, 10, x + 6, y + 38);
    for (const yy of [73,107,141]) stamp(display, 0, 32, 89, 4, x + 8, y + yy);
    const pair = (text, dx, dy) => {
      [...text].forEach((digit, index) => { if (/^[0-9]$/.test(digit)) stamp(digits, Number(digit) * 17, 0, 17, 19, x + dx + index * 17, y + dy); });
    };
    pair(dskyState.program.join(''), 66, 16);
    if (!dskyState.flash || Math.floor(performance.now() / 500) % 2 === 0) {
      pair(dskyState.verb.join(''), 7, 51); pair(dskyState.noun.join(''), 66, 51);
    }
    dskyState.registers.forEach((row, index) => {
      const yy = 83 + index * 34;
      const sign = dskyState.signs[index];
      if (sign === '+' || sign === '−') stamp(digits, (sign === '+' ? 11 : 10) * 17, 0, 17, 19, x + 1, y + yy);
      pair(row.join(''), 17, yy);
    });
  }
  function draw() {
    advanceTalkbacks();
    const ratio = canvas.width / width;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const imageWidth = images[view].naturalWidth * scale;
    const imageHeight = images[view].naturalHeight * scale;
    moonElement.style.clipPath = `inset(${Math.max(0,oy)}px ${Math.max(0,width-ox-imageWidth)}px ${Math.max(0,height-oy-imageHeight)}px ${Math.max(0,ox)}px)`;
    context.translate(ox, oy); context.scale(scale, scale);
    context.drawImage(images[view], 0, 0);
    drawControls();
    drawTalkbacks();
    drawLamps();
    drawDsky();
    if (hover && document.querySelector('#show-zones').checked) {
      context.strokeStyle = '#d0bb71'; context.lineWidth = 1.5 / scale;
      const [x1,y1,x2,y2] = hover.rect; context.strokeRect(x1,y1,x2-x1,y2-y1);
    }
    if (descentHelium.moving && indicatorFrame === null) {
      indicatorFrame = requestAnimationFrame(() => {
        indicatorFrame = null;
        draw();
      });
    }
  }
  function local(event) {
    const bounds = canvas.getBoundingClientRect();
    return [(event.clientX - bounds.left - ox) / scale, (event.clientY - bounds.top - oy) / scale];
  }
  function send(keys) {
    if (!ready) { status.textContent = '原始AGC正在启动或已暂停，请稍后。'; return; }
    worker.postMessage({type:'keys', keys});
  }
  function clicked(event) {
    const [x, y] = local(event);
    const hit = coordinates.views[view].find(item => x >= item.rect[0] && x <= item.rect[2] && y >= item.rect[1] && y <= item.rect[3]);
    const keyboard = zone('AID_DSKY_KEY');
    if (keyboard) {
      const key = coordinates.dskyKeys.find(key => { const r=key.relativeRect; return x >= keyboard[0]+r[0] && x <= keyboard[0]+r[2] && y >= keyboard[1]+r[1] && y <= keyboard[1]+r[3]; });
      if (key) { send(key.key === 'PRO' ? ['PRO_DOWN','PRO_UP'] : [key.key]); status.textContent = key.key + '（原始DSKY按键）已写入Luminary099。'; return; }
    }
    if (hit) {
      const english = hit.id.replace('AID_','');
      const chinese = meanings[english] || '原源码功能区域，详细译名待核';
      status.textContent = `${english}（${chinese}） · 原图坐标 ${hit.rect.join(', ')} · ${english.startsWith('DSKY') ? '原始AGC显示与按键已接入' : '当前保留NASSP原图状态，该系统逻辑尚未移植'}`;
    }
  }
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,[event.clientX,event.clientY]);
    previous=[event.clientX,event.clientY]; moved=false; canvas.focus();
    const [x,y]=local(event),c=controlAt(x,y);
    if(c&&pointers.size===1){
      const r=controlRect(c);
      operate(c.id,c.kind==='rotary'?(x>(r[0]+r[2])/2?1:-1):(y<(r[1]+r[3])/2?1:-1));
      heldControl=c.id;previous=null;moved=true;draw();
    }
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);moved=true;}
  });
  canvas.addEventListener('pointermove', event => {
    if(pointers.has(event.pointerId)) pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pointers.size===2){
      const [a,b]=[...pointers.values()];const distance=Math.hypot(a[0]-b[0],a[1]-b[1]);
      if(pinchDistance>0){const next=Math.max(0.15,Math.min(4,scale*distance/pinchDistance));const bounds=canvas.getBoundingClientRect();const mx=(a[0]+b[0])/2-bounds.left,my=(a[1]+b[1])/2-bounds.top;ox=mx-(mx-ox)*next/scale;oy=my-(my-oy)*next/scale;scale=next;}
      pinchDistance=distance;moved=true;
    }else if(previous&&pointers.size===1){const dx=event.clientX-previous[0],dy=event.clientY-previous[1];if(Math.abs(dx)+Math.abs(dy)>1)moved=true;ox+=dx;oy+=dy;previous=[event.clientX,event.clientY];}
    const [x,y]=local(event);hover=coordinates.views[view].find(item=>x>=item.rect[0]&&x<=item.rect[2]&&y>=item.rect[1]&&y<=item.rect[3]);
    const c=controlAt(x,y);
    if(!pointers.size&&c&&selectedControl!==c.id)describe(c.id);
    canvas.style.cursor=c?'pointer':'grab';draw();
  });
  canvas.addEventListener('pointerup', event => {if(!moved&&pointers.size===1)clicked(event);releaseHeld();pointers.delete(event.pointerId);previous=null;pinchDistance=0;});
  canvas.addEventListener('pointercancel',event=>{releaseHeld();pointers.delete(event.pointerId);previous=null;pinchDistance=0;});
  canvas.addEventListener('pointerleave',()=>{if(pinnedControl&&!heldControl)describe(pinnedControl);});
  window.addEventListener('blur',releaseHeld);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseHeld();});
  canvas.addEventListener('keydown',event=>{
    if(!zone('AID_DSKY_KEY'))return;
    const mapping={v:'VERB',n:'NOUN',c:'CLR',k:'KEY REL',r:'RSET',e:'ENTR',Enter:'ENTR','+':'+','-':'−'};
    const key=/^[0-9]$/.test(event.key)?event.key:mapping[event.key]||mapping[event.key.toLowerCase()];
    if(key){event.preventDefault();event.stopPropagation();send([key]);}
    if(event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();send(['PRO_DOWN','PRO_UP']);}
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();const [x,y]=local(event);const factor=Math.exp(-Math.sign(event.deltaY)*0.12);const next=Math.max(0.15,Math.min(4,scale*factor));ox+=x*(scale-next);oy+=y*(scale-next);scale=next;draw();
  },{passive:false});
  document.querySelector('#native-fit').onclick=()=>{fit();draw();};
  document.querySelector('#native-pixels').onclick=()=>{ox=width/2-(rect[0]+rect[2]/2);oy=height/2-(rect[1]+rect[3]/2);scale=1;draw();};
  document.querySelector('#native-v35').onclick=()=>send(['VERB','3','5','ENTR']);
  worker = new Worker(new URL('../console/agc-worker.mjs?v=cockpit-20261108-2',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){ready=true;document.querySelector('#native-v35').disabled=false;document.querySelector('#native-agc-status').textContent='Luminary099（登月舱原始程序）运行中';worker.postMessage({type:'autoThrottle',value:panel.state.THRContSwitch===1});}
    if(data.type==='panelSignal'){acknowledgedThrottle=data.value;if(selectedControl==='THRContSwitch')describe(selectedControl);}
    if(data.type==='display'){dskyState=data.state;document.querySelector('#native-dsky-output').textContent=`PROG（程序）${data.state.program.join('')} · VERB（动作码）${data.state.verb.join('')} · NOUN（数据码）${data.state.noun.join('')} · ${data.state.registers.map(row=>row.join('')).join(' / ')}`;draw();}
    if(data.type==='error'){status.textContent=data.message;ready=false;}
  };
  worker.postMessage({type:'init',craft:'lm'});
  window.addEventListener('pagehide',()=>worker.terminate());
  new ResizeObserver(resize).observe(container);resize();
  return {
    draw,
    inspectControls(){return panel.controls.map(c=>panel.inspect(c.id));},
    resetControls(){releaseHeld();descentHelium.reset();panel.reset();if(selectedControl)describe(selectedControl);},
    setView(key) {
      if(key==='dsky'){view='MAIN';rect=[1185,1520,330,380];}
      else if(key==='window'){view='LEFTWINDOW';rect=[0,0,1920,1080];}
      else if(key==='lpd'){view='LPDWINDOW';rect=[0,0,1920,1080];}
      else if(key==='all'){view='MAIN';rect=[0,0,2700,1920];}
      else {view='MAIN';rect=[620,210,1450,920];}
      fit();draw();
    }
  };
}
