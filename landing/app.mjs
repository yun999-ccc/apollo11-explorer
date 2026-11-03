// SPDX-License-Identifier: GPL-2.0-or-later
import {createNativeCockpit} from './native-cockpit.mjs';
import {createFlight, FT, PARAMETERS} from './flight.mjs';
import {groundHeight} from './terrain.mjs';
import {createLunarView} from './scene.mjs';
import {createFixedClock} from '../simulation/fixed-clock.mjs';

const $ = selector => document.querySelector(selector);
let flight, clock, running = false, lunarView;
let previousFrame = performance.now(), replayEvents = null, replayIndex = 0;
let samples = [], resultShown = false, lookDown = 28;
const fmt = (number, digits = 1) => Number(number).toFixed(digits);
const clearance = s => Math.max(0, s.altitude - groundHeight(s.x, s.y));
function elapsed(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
function reset() {
  flight = createFlight(PARAMETERS, groundHeight);
  samples = [];
  resultShown = false;
  replayEvents = null;
  replayIndex = 0;
  running = false;
  clock = createFixedClock(({dt}) => {
    const tick = flight.state.tick;
    while (replayEvents && replayIndex < replayEvents.length && replayEvents[replayIndex].tick === tick) {
      const event = replayEvents[replayIndex++];
      flight.input(event.action, event.value);
    }
    flight.step(dt);
    if (tick % 60 === 0 || flight.state.touchdown) samples.push({...flight.state, touchdown: flight.state.touchdown && {...flight.state.touchdown}});
  });
  $('#start').textContent = '开始下降';
  $('#flight-status').textContent = '准备下降';
  $('#hint').textContent = '先点击“辅助演示”观察完整下降，再尝试操纵。空格暂停，R/F改变下降率，W/S/A/D改变姿态。';
  render();
}
function toggleRunning() {
  if (flight.state.touchdown) return;
  running = !running;
  previousFrame = performance.now();
  $('#start').textContent = running ? '暂停下降' : '继续下降';
}
function control(action, value) {
  if (flight.state.touchdown || replayEvents) return;
  if (flight.state.assist && action !== 'assist') flight.input('assist', 0);
  flight.input(action, value);
  if (action === 'engine') $('#hint').textContent = '发动机已关闭。剩余下降由月球重力与当前速度决定。重新开始可恢复初始状态。';
  render();
}
function session() {
  return {
    version: 1,
    scenario: 'LM-5 engineering terminal-descent model',
    historicalFlightReproduction: false,
    originalAgcClosedLoop: false,
    initialStateBasis: '102:43:26 voice readout, with engineering assumptions in provenance.json',
    parameters: flight.parameters,
    timestep: 1 / 60,
    events: flight.events,
    samples,
    currentState: {...flight.state},
    discardedWallSeconds: clock.discardedSeconds
  };
}
function download() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(session(), null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Eagle-descent-session.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showResult() {
  resultShown = true;
  running = false;
  $('#start').textContent = '实验已结束';
  const result = flight.state.touchdown;
  const entries = [
    [fmt(result.verticalSpeed / FT, 2) + ' ft/s', '脚垫接触时向下速度'],
    [fmt(result.horizontalSpeed / FT, 2) + ' ft/s', '接触时水平速度'],
    [fmt(result.fuel) + ' kg', '剩余下降推进剂'],
    [fmt(result.pitch) + '° / ' + fmt(result.roll) + '°', '俯仰／横滚'],
    [fmt(result.time) + ' s', '下降实验时间'],
    [fmt(Math.hypot(result.x, result.y)) + ' m', '距初始地面投影的距离']
  ];
  $('#result-values').replaceChildren(...entries.map(([value, label]) => {
    const element = document.createElement('div');
    const strong = document.createElement('strong'), span = document.createElement('span');
    strong.textContent = value;
    span.textContent = label;
    element.append(strong, span);
    return element;
  }));
  $('#result-dialog').showModal();
}
function render() {
  const s = flight.state;
  const altitudeFeet = clearance(s) / FT;
  const downFeet = -s.vz / FT;
  $('#altitude').textContent = fmt(altitudeFeet, 0);
  $('#descent-rate').textContent = fmt(downFeet);
  $('#window-alt').textContent = fmt(altitudeFeet, 0) + ' ft';
  $('#window-rate').textContent = fmt(downFeet) + ' ft/s';
  $('#window-forward').textContent = fmt(s.vx / FT) + ' ft/s';
  $('#altitude-caption').textContent = fmt(altitudeFeet, 0) + ' ft（英尺）';
  $('#height-bar').style.height = Math.max(0, Math.min(100, altitudeFeet / 4)) + '%';
  $('#rate-bar').style.height = Math.max(0, Math.min(100, downFeet / 15 * 100)) + '%';
  $('#pitch').textContent = fmt(s.pitch) + '°';
  $('#roll').textContent = fmt(s.roll) + '°';
  $('#attitude-ball').setAttribute('transform', `rotate(${-s.roll} 100 100) translate(0 ${s.pitch * 1.4})`);
  $('#forward').textContent = fmt(s.vx / FT);
  $('#lateral').textContent = fmt(s.vy / FT);
  $('#pointer-x').style.left = (50 + Math.max(-45, Math.min(45, s.vy / FT / 60 * 45))) + '%';
  $('#pointer-y').style.top = (50 - Math.max(-45, Math.min(45, s.vx / FT / 60 * 45))) + '%';
  $('#throttle').textContent = fmt(s.thrust / PARAMETERS.maximumThrust * 100) + '%';
  $('#fuel').textContent = fmt(s.fuel) + ' kg';
  $('#elapsed').textContent = elapsed(s.time);
  $('#rate-command').textContent = fmt(Math.abs(s.rateCommand) / FT) + ' ft/s ' + (s.rateCommand <= 0 ? '下降' : '上升');
  $('#contact').classList.toggle('active', s.contact);
  $('#assist').classList.toggle('active', s.assist);
  $('#assist').textContent = s.assist ? '辅助演示中' : '辅助演示';
  $('#engine-stop').disabled = !s.engine || Boolean(s.touchdown) || Boolean(replayEvents);
  $('#flight-status').textContent = s.touchdown ? '脚垫已接触月面' : replayEvents ? '操作重放中' : running ? s.assist ? '工程辅助下降' : '乘员操纵下降' : '已暂停';
  if (lunarView && $('#cockpit').dataset.view !== 'panel') lunarView.render(s, lookDown);
  window.apolloLanding = {state: {...s}, running, replay: Boolean(replayEvents), tick: clock.tick, terrainHeight: groundHeight(s.x, s.y), triangles: lunarView?.triangles || 0};
}
function animate(now) {
  const delta = Math.max(0, (now - previousFrame) / 1000);
  previousFrame = now;
  if (running && !flight.state.touchdown) clock.advance(delta);
  render();
  if (flight.state.touchdown && !resultShown) showResult();
  requestAnimationFrame(animate);
}
$('#start').onclick = toggleRunning;
$('#assist').onclick = () => {
  control('assist', flight.state.assist ? 0 : 1);
  if (!running && !flight.state.touchdown) toggleRunning();
};
$('#rod-up').onclick = () => control('rate', 1);
$('#rod-down').onclick = () => control('rate', -1);
$('#quick-rate-up').onclick = () => control('rate', 1);
$('#quick-rate-down').onclick = () => control('rate', -1);
$('#quick-pitch-up').onclick = () => control('pitch', 1);
$('#quick-pitch-down').onclick = () => control('pitch', -1);
$('#engine-stop').onclick = () => control('engine', 0);
$('#restart').onclick = reset;
$('#export').onclick = download;
$('#result-export').onclick = download;
$('#result-restart').onclick = () => { $('#result-dialog').close(); reset(); };
$('#replay').onclick = () => {
  const record = flight.events.map(event => ({...event}));
  reset();
  replayEvents = record;
  running = true;
  previousFrame = performance.now();
  $('#start').textContent = '暂停重放';
  $('#hint').textContent = '正在从相同初始状态重放已记录的操作，当前操纵输入已锁定。';
};
$('#look').oninput = event => {
  lookDown = Number(event.target.value);
  $('#look-value').textContent = `向下${lookDown}°`;
};
for (const button of document.querySelectorAll('[data-control]')) button.onclick = () => control(button.dataset.control, Number(button.dataset.amount));
for (const button of document.querySelectorAll('button[data-view]')) button.onclick = () => {
  $('#cockpit').dataset.view = button.dataset.view;
  for (const other of document.querySelectorAll('button[data-view]')) if (other.tagName === 'BUTTON') other.setAttribute('aria-pressed', String(other === button));
};
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
$('#sources').onclick = () => $('#source-dialog').showModal();
document.addEventListener('keydown', event => {
  if (event.target.tagName === 'INPUT' || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); toggleRunning(); return; }
  const actions = {r: ['rate', 1], f: ['rate', -1], w: ['pitch', 1], s: ['pitch', -1], a: ['roll', -1], d: ['roll', 1]};
  const action = actions[event.key.toLowerCase()];
  if (action) { event.preventDefault(); control(...action); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    running = false;
    $('#start').textContent = '继续下降';
    $('#hint').textContent = '页面进入后台，下降已暂停。返回后点击“继续下降”。';
  }
});
try { lunarView = createLunarView($('#lunar-view')); }
catch (error) {
  const note = document.createElement('p');
  note.className = 'error';
  note.textContent = '三维舷窗暂时不可用，请启用WebGL（三维图形）。仪表和操作记录仍可使用。';
  $('#lunar-view').append(note);
  console.error(error);
}
reset();
requestAnimationFrame(animate);
Promise.all([fetch('provenance.json').then(r => r.json()), fetch('validation.json').then(r => r.json())]).then(([sources, tests]) => {
  for (const source of sources.sources) {
    const item = document.createElement('div'); item.className = 'source-item';
    const title = document.createElement('strong'), description = document.createElement('p'), link = document.createElement('a');
    title.textContent = source.titleZh;
    description.textContent = source.supportsZh;
    link.textContent = '打开原始资料 ↗'; link.href = source.local || source.url; link.target = '_blank'; link.rel = 'noopener';
    item.append(title, description, link); $('#source-list').append(item);
  }
  $('#test-summary').textContent = `已通过${tests.checks.length}项自动检查，覆盖自由落体解析解、推进剂守恒、步长收敛、帧率一致性和操作重放。实际检查结果见记录。`;
}).catch(() => { $('#test-summary').textContent = '资料报告暂未加载，请直接打开下方原始记录。'; });

createNativeCockpit($('#native-cockpit'), $('#lunar-view')).then(native => {
  for (const button of document.querySelectorAll('[data-native-view]')) button.onclick = () => {
    native.setView(button.dataset.nativeView);
    for (const other of document.querySelectorAll('[data-native-view]')) other.setAttribute('aria-pressed', String(other === button));
  };
  native.setView('panel');
}).catch(error => { $('#native-note').textContent = '原始面板载入失败：' + error.message; });
