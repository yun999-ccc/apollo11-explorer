// SPDX-License-Identifier: GPL-2.0-or-later
import {createNativeCockpit} from './native-cockpit.mjs?v=cockpit-overview-1';
import {createFlight, FT, PARAMETERS} from './flight.mjs?v=mission-replay-1';
import {groundHeight} from './terrain.mjs';
import {LROC_TERRAIN, SCHEMATIC_TERRAIN, tranquilityHeight} from './lroc-terrain.mjs';
import {createFixedClock} from '../simulation/fixed-clock.mjs';
import {initMission} from './mission-ui.mjs?v=mission-replay-1';

const $ = selector => document.querySelector(selector);
let flight, clock, running = false, nativeCockpit;
let activeTerrain = LROC_TERRAIN, activeGround = tranquilityHeight;
let previousFrame = performance.now(), replayEvents = null, replayIndex = 0, replayEndTick = 0;
let samples = [], resultShown = false;
const fmt = (number, digits = 1) => Number(number).toFixed(digits);
const clearance = s => Math.max(0, s.altitude - activeGround(s.x, s.y));
const mission = initMission({pauseFlight: () => { if (running) toggleRunning(); }});
function elapsed(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
function reset(terrainId = LROC_TERRAIN) {
  activeTerrain = terrainId;
  activeGround = terrainId === LROC_TERRAIN ? tranquilityHeight : groundHeight;
  flight = createFlight(PARAMETERS, activeGround);
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
    if (replayEvents && tick >= replayEndTick) {
      running = false;
      return;
    }
    flight.step(dt);
    if (tick % 60 === 0 || flight.state.touchdown) samples.push({...flight.state, touchdown: flight.state.touchdown && {...flight.state.touchdown}});
  });
  $('#start').textContent = '开始下降';
  $('#cockpit-flight-toggle').textContent = '开始下降';
  $('#flight-status').textContent = '下降前检查 · 已暂停';
  $('#hint').textContent = '下降已暂停，可先检查面板和操作DSKY。点击“开始下降”运行独立工程模型；该模型尚未与面板系统、原始AGC形成闭环。';
  nativeCockpit?.resetControls();
  render();
}
function toggleRunning() {
  if (flight.state.touchdown || (replayEvents && flight.state.tick >= replayEndTick)) return;
  running = !running;
  if (running) mission.pauseReplay();
  previousFrame = performance.now();
  render();
}
function updateRunButtons() {
  const s = flight.state;
  const finished = s.touchdown || (replayEvents && s.tick >= replayEndTick && !running);
  const label = finished ? (s.touchdown ? '实验已结束' : '重放结束')
    : running ? '暂停下降' : s.tick ? '继续下降' : '开始下降';
  for (const id of ['#start', '#cockpit-flight-toggle']) {
    $(id).textContent = label;
    $(id).disabled = Boolean(finished);
  }
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
    terrain: activeTerrain,
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
  updateRunButtons();
  const result = flight.state.touchdown;
  const entries = [
    [fmt(result.verticalSpeed / FT, 2) + ' ft/s', '脚垫接触时向下速度'],
    [fmt(result.horizontalSpeed / FT, 2) + ' ft/s', '接触时水平速度'],
    [fmt(result.fuel) + ' kg', '剩余下降推进剂'],
    [fmt(result.pitch) + '° / ' + fmt(result.roll) + '°', '俯仰／横滚'],
    [fmt(result.time) + ' s', '下降实验时间'],
    [fmt(result.x) + ' / ' + fmt(result.y) + ' m', '落点 · 前向 / 侧向'],
    [sTime(flight.state.probeContactTime), '接触探针触地'],
    [sTime(flight.state.engineShutdownTime), '发动机关机指令']
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
const sTime = value => value === null ? '未记录' : fmt(value, 2) + ' s';
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
  $('#live-height').textContent = fmt(altitudeFeet, 0) + ' ft';
  $('#live-vertical').textContent = fmt(s.vz / FT) + ' ft/s';
  $('#cockpit-flight-reading').textContent = $('#live-height').textContent + ' · ' + $('#live-vertical').textContent;
  $('#live-horizontal').textContent = fmt(s.vx / FT) + ' / ' + fmt(s.vy / FT) + ' ft/s';
  $('#live-fuel').textContent = fmt(s.fuel) + ' kg';
  $('#live-command').textContent = fmt(Math.abs(s.rateCommand) / FT) + ' ft/s ' + (s.rateCommand <= 0 ? '下降' : '上升');
  $('#live-contact').textContent = s.touchdown ? '脚垫接地' : s.contact ? '探针接触' : '尚未接触';
  $('#live-terrain').textContent = activeTerrain === LROC_TERRAIN
    ? '月面高程来自 LROC 静海测绘，表面灰度为示意。' : '本记录使用早期版本的示意地形。';
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
  $('#quick-engine-stop').disabled = $('#engine-stop').disabled;
  for(const button of document.querySelectorAll('#rod-up,#rod-down,#quick-rate-up,#quick-rate-down,#quick-pitch-up,#quick-pitch-down,#assist,[data-control]'))button.disabled=Boolean(s.touchdown)||Boolean(replayEvents);
  $('#flight-status').textContent = s.touchdown ? '脚垫已接触月面' : replayEvents ? '操作重放中' : running ? s.assist ? '工程辅助下降' : '乘员操纵下降' : s.tick===0 ? '下降前检查 · 已暂停' : '已暂停';
  if (replayEvents && s.tick >= replayEndTick && !running && !s.touchdown) $('#flight-status').textContent = '重放结束';
  updateRunButtons();
  nativeCockpit?.setFlight({...s, terrain: activeTerrain});
  window.apolloLanding = {state: {...s}, running, replay: Boolean(replayEvents), tick: clock.tick,
    terrain: activeTerrain, terrainHeight: activeGround(s.x, s.y), triangles: nativeCockpit?.inspectCamera().triangles || 0};
}
function animate(now) {
  const delta = Math.max(0, (now - previousFrame) / 1000);
  previousFrame = now;
  if (running && !flight.state.touchdown) {
    clock.advance(delta);
    render();
  }
  if (flight.state.touchdown && !resultShown) showResult();
  requestAnimationFrame(animate);
}
$('#start').onclick = toggleRunning;
$('#cockpit-flight-toggle').onclick = toggleRunning;
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
$('#quick-engine-stop').onclick = () => control('engine', 0);
$('#restart').onclick = () => reset();
$('#export').onclick = download;
$('#result-export').onclick = download;
$('#result-restart').onclick = () => { $('#result-dialog').close(); reset(); };
function beginReplay(record, endTick, terrainId) {
  reset(terrainId);
  replayEvents = record;
  replayEndTick = endTick;
  running = true;
  mission.pauseReplay();
  previousFrame = performance.now();
  $('#hint').textContent = '正在从相同初始状态重放已记录的操作，当前操纵输入已锁定。';
  render();
}
$('#replay').onclick = () => {
  beginReplay((replayEvents ?? flight.events).map(event => ({...event})), replayEvents ? replayEndTick : flight.state.tick, activeTerrain);
};
$('#import-flight').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('记录超过 2 MB');
    const record = JSON.parse(await file.text());
    const endTick = record.currentState?.tick;
    const terrainId = record.terrain ?? SCHEMATIC_TERRAIN;
    if (record.version !== 1 || record.scenario !== 'LM-5 engineering terminal-descent model' ||
        ![LROC_TERRAIN, SCHEMATIC_TERRAIN].includes(terrainId) ||
        record.timestep !== 1 / 60 || !Number.isInteger(endTick) || endTick < 0 || endTick > 360_000 ||
        Object.entries(PARAMETERS).some(([key, value]) => record.parameters?.[key] !== value) ||
        !Array.isArray(record.events) || record.events.some((entry, index, entries) =>
          !Number.isInteger(entry?.tick) || entry.tick < (entries[index - 1]?.tick ?? 0) || entry.tick > endTick ||
          !['rate', 'pitch', 'roll', 'engine', 'assist'].includes(entry.action) || !Number.isFinite(entry.value))) {
      throw new Error('记录与当前 P66 工程场景不匹配');
    }
    beginReplay(record.events, endTick, terrainId);
  } catch (error) {
    $('#hint').textContent = '无法重放此文件。' + error.message;
  } finally {
    event.target.value = '';
  }
};
for (const button of document.querySelectorAll('[data-control]')) button.onclick = () => control(button.dataset.control, Number(button.dataset.amount));
for (const button of document.querySelectorAll('button[data-view]')) button.onclick = () => {
  $('#cockpit').dataset.view = button.dataset.view;
  for (const other of document.querySelectorAll('button[data-view]')) if (other.tagName === 'BUTTON') other.setAttribute('aria-pressed', String(other === button));
};
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
$('#sources').onclick = () => $('#source-dialog').showModal();
document.addEventListener('keydown', event => {
  if (['INPUT','SELECT','TEXTAREA','BUTTON','VIDEO','SUMMARY'].includes(event.target.tagName) || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); toggleRunning(); return; }
  const actions = {r: ['rate', 1], f: ['rate', -1], w: ['pitch', 1], s: ['pitch', -1], a: ['roll', -1], d: ['roll', 1]};
  const action = actions[event.key.toLowerCase()];
  if (action) { event.preventDefault(); control(...action); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    running = false;
    render();
    $('#hint').textContent = '页面进入后台，下降已暂停。返回后点击“继续下降”。';
  }
});
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

export async function startCockpit(signal, report) {
  const native = await createNativeCockpit($('#native-cockpit'), signal, report);
  nativeCockpit = native;
  window.apolloPanel = {inspect: native.inspectControls, camera: native.inspectCamera};
  const viewButtons = [...document.querySelectorAll('[data-native-view]')];
  for (const button of viewButtons) {
    button.disabled = false;
    button.onclick = () => {
      native.setView(button.dataset.nativeView);
      for (const other of viewButtons) other.setAttribute('aria-pressed', String(other === button));
    };
  }
  $('#native-fit').disabled = false;
  native.setView('panel');
  native.setFlight({...flight.state, terrain: activeTerrain});
}
