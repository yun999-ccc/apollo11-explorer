// SPDX-License-Identifier: GPL-2.0-or-later
import {createPanelControls} from './panel-controls.mjs?v=cockpit-20261108-3';
import {createDescentHelium} from './descent-helium.mjs';
import {createCabinScene, loadCabinModel} from './cabin-scene.mjs?v=cabin-load-1';

export async function createNativeCockpit(container, signal, report) {
  async function image(name) {
    const value = new Image();
    value.src = new URL('nassp/' + name + '.png', import.meta.url);
    try {
      await value.decode();
    } catch (error) {
      throw new Error('仪表图像加载失败（' + name + '）', {cause: error});
    }
    return value;
  }
  const [model, controlData, digits, display, lamps, indicator] = await Promise.all([
    loadCabinModel(signal, report).then(model => {
      report('座舱模型已解码，正在等候控件资料和仪表图像…');
      return model;
    }),
    fetch(new URL('nassp/controls/controls.json', import.meta.url), {signal}).then(response => {
      if (!response.ok) throw new Error('控件资料下载失败');
      return response.json();
    }),
    image('digitaldisp'), image('dsky_disp'), image('dsky_lights'), image('controls/Indicator')
  ]);
  signal.throwIfAborted();
  report('正在初始化三维视角和实体控件…');
  const cabin = createCabinScene(container, model);
  const {canvas} = cabin;
  const context = cabin.atlas.context;
  // IndicatorSwitch::DrawSwitchVC uses 64 frame units per simulation second.
  const descentHelium = createDescentHelium({indicatorRate: 64});
  const status = document.querySelector('#native-note');
  const showZones = document.querySelector('#show-zones');
  let lastIndicatorTime = performance.now();
  let indicatorFrame = null;
  let dskyState = null;
  let atlasKey = '';
  let ready = false;
  let view = 'panel';
  let selectedControl = null;
  let heldControl = null;
  let pinnedControl = null;
  let acknowledgedThrottle = null;
  let gesture = null;
  let lastHover = 0;
  let releaseTimer;
  const keyTimers = new Map();
  let worker, agcTimeout;
  const inspector = id => document.querySelector('#control-' + id);

  const panel = createPanelControls(controlData.controls, {
    onSignal(signal) {
      if (ready) worker.postMessage({type: signal.name, value: signal.value});
    },
    onChange(control) {
      advanceTalkbacks();
      if (control) {
        descentHelium.move(control.id, panel.state[control.id]);
        updatePosition(control);
        describe(control.id);
      } else {
        panel.controls.forEach(updatePosition);
      }
      drawAtlas();
    }
  });
  panel.controls.forEach(updatePosition);

  function updatePosition(control) {
    cabin.positionControl(control.id, panel.state[control.id], control.angles);
  }

  function advanceTalkbacks() {
    const now = performance.now();
    descentHelium.advance((now - lastIndicatorTime) / 1000);
    lastIndicatorTime = now;
  }

  function describe(id, pin = false) {
    if (pin) pinnedControl = id;
    selectedControl = id;
    const c = panel.inspect(id);
    inspector('title').textContent = c.english + '（' + c.chinese + '）';
    inspector('state').textContent = c.blocked ? '已移植实体网格，系统动作尚未接通。'
      : '开关位置：' + c.current + '。' + (c.spring ? ' 松手回中。' : ' 保持当前位置。');
    inspector('purpose').textContent = c.purpose;
    const regulator = descentHelium.inspect(id);
    if (regulator) {
      const valveState = regulator.open ? 'OPEN（打开）' : 'CLOSED（关闭）';
      inspector('coverage').textContent = '调节器阀门：' + valveState
        + '。反馈窗随阀位变化。初始阀位取自 NASSP 下降前存档，两路采用 28 V 标称供电。';
    } else if (c.blocked) {
      inspector('coverage').textContent = '尚未实现系统动作，此按钮可查看说明。';
    } else if (c.systemConnected) {
      const acknowledgment = acknowledgedThrottle === Boolean(c.value) ? '已收到计算机确认' : '等待计算机确认';
      inspector('coverage').textContent = 'AGC 输入已接线，' + acknowledgment + '。发动机与飞行闭环尚未接通。';
    } else {
      inspector('coverage').textContent = '当前实现实体档位操作。对应系统电气、阀门与仪表反馈尚未接通。';
    }
    const line = cabin.controlSourceLine(id);
    inspector('source').href = 'https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lemvc.cpp#L' + line;
    inspector('source').textContent = '原始 3D 控件绑定 · 第' + line + '行 ↗';
    inspector('select').value = id;
    cabin.select(id, showZones.checked);

    const actions = inspector('actions');
    if (actions.dataset.control === id) return;
    actions.dataset.control = id;
    actions.replaceChildren();
    for (const direction of [-1, 1]) {
      const button = document.createElement('button');
      button.textContent = c.kind === 'rotary'
        ? (direction > 0 ? '下一档 →' : '← 上一档')
        : (direction > 0 ? '向上拨动 ↑' : '向下拨动 ↓');
      button.disabled = c.blocked;
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        holdControl(id, direction);
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
        button.addEventListener(event, releaseHeld);
      }
      button.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key) && !event.repeat) {
          event.preventDefault();
          holdControl(id, direction);
        }
      });
      button.addEventListener('keyup', event => {
        if (['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          releaseHeld();
        }
      });
      actions.append(button);
    }
  }

  function holdControl(id, direction) {
    releaseHeld();
    const outcome = panel.move(id, direction);
    if (outcome.accepted) heldControl = id;
    describe(id, true);
    inspector('feedback').textContent = outcome.accepted
      ? (outcome.changed ? '档位已改变。' : '已经在该方向的端位。') : outcome.reason;
  }

  function releaseHeld() {
    clearTimeout(releaseTimer);
    const id = heldControl;
    heldControl = null;
    if (id) {
      panel.release(id);
      describe(id, true);
    }
  }

  for (const control of panel.controls) {
    const option = document.createElement('option');
    option.value = control.id;
    option.textContent = control.english + '（' + control.chinese + '）';
    inspector('select').append(option);
  }
  inspector('select').addEventListener('change', event => {
    if (event.target.value) describe(event.target.value, true);
  });

  function stamp(sprite, sx, sy, sw, sh, x, y) {
    context.drawImage(sprite, sx, sy, sw, sh, x, y, sw, sh);
  }

  function drawLamps() {
    const positions = [
      ['uplink', 0, 0], ['noatt', 0, 25], ['standby', 0, 49], ['keyrel', 0, 73], ['oprerr', 0, 97],
      ['temp', 52, 0], ['gimbal', 52, 25], ['prog', 52, 49], ['restart', 52, 73], ['tracker', 52, 97],
      ['altitude', 52, 121], ['velocity', 52, 144]
    ];
    for (const [name, x, y] of positions) {
      stamp(lamps, x + (dskyState.lamps[name] ? 101 : 0), y, 49, 23, 112 + x, y);
    }
  }

  function drawDsky(flashVisible) {
    if (dskyState.elOff) return;
    if (dskyState.lamps.activity) stamp(display, 0, 0, 35, 31, 6, 4);
    stamp(display, 35, 0, 35, 10, 66, 3);
    stamp(display, 35, 10, 35, 10, 66, 38);
    stamp(display, 35, 20, 35, 10, 6, 38);
    for (const y of [73, 107, 141]) stamp(display, 0, 32, 89, 4, 8, y);
    function number(values, x, y) {
      values.forEach((digit, index) => {
        if (/^[0-9]$/.test(digit)) stamp(digits, Number(digit) * 17, 0, 17, 19, x + index * 17, y);
      });
    }
    number(dskyState.program, 66, 16);
    if (flashVisible) {
      number(dskyState.verb, 7, 51);
      number(dskyState.noun, 66, 51);
    }
    dskyState.registers.forEach((row, index) => {
      const y = 83 + index * 34;
      const sign = dskyState.signs[index];
      if (sign === '+' || sign === '−') stamp(digits, (sign === '+' ? 11 : 10) * 17, 0, 17, 19, 1, y);
      number(row, 17, y);
    });
  }

  function drawAtlas() {
    advanceTalkbacks();
    const frames = ['DESHeReg1Switch', 'DESHeReg2Switch'].map(id => descentHelium.inspect(id).frame);
    const flashVisible = !dskyState?.flash || Math.floor(performance.now() / 500) % 2 === 0;
    const current = JSON.stringify([dskyState, flashVisible, frames]);
    if (current !== atlasKey) {
      atlasKey = current;
      context.clearRect(0, 0, 256, 256);
      if (dskyState) {
        drawLamps();
        drawDsky(flashVisible);
      }
      frames.forEach((frame, i) => stamp(indicator, 23 * frame, 0, 23, 23, 24 * i, 184));
      cabin.atlas.changed();
      cabin.requestDraw();
    }
    if (descentHelium.moving && indicatorFrame === null) {
      indicatorFrame = requestAnimationFrame(() => {
        indicatorFrame = null;
        drawAtlas();
      });
    }
  }

  function send(keys) {
    if (!ready) {
      if (agcTimeout !== null) status.textContent = '原始 AGC 正在启动，请稍后。';
      return;
    }
    worker.postMessage({type: 'keys', keys});
  }

  function activate(hit) {
    if (!hit) return;
    const {data, direction} = hit;
    if (data.kind === 'key') {
      send(data.key === 'PRO' ? ['PRO_DOWN', 'PRO_UP'] : [data.key]);
      if (ready) status.textContent = data.key + '（DSKY 实体按键）已提交给 Luminary099。';
      cabin.pressKey(data.name, true);
      clearTimeout(keyTimers.get(data.name));
      keyTimers.set(data.name, setTimeout(() => {
        cabin.pressKey(data.name, false);
        keyTimers.delete(data.name);
      }, 125));
    } else {
      holdControl(data.name, direction);
      releaseTimer = setTimeout(releaseHeld, 125);
    }
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || gesture) return;
    canvas.focus({preventScroll: true});
    canvas.setPointerCapture(event.pointerId);
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, drag: false};
  });

  canvas.addEventListener('pointermove', event => {
    if (gesture) {
      if (gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (gesture.drag || Math.hypot(dx, dy) >= 5) {
        gesture.drag = true;
        gesture.x = event.clientX;
        gesture.y = event.clientY;
        canvas.style.cursor = 'grabbing';
        cabin.rotate(dx, dy);
      }
      return;
    }
    const now = performance.now();
    if (now - lastHover < 65) return;
    lastHover = now;
    const hit = cabin.pick(event.clientX, event.clientY, true);
    if (hit && hit.data.kind !== 'key' && hit.data.name !== selectedControl) describe(hit.data.name);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  });

  canvas.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    const click = !gesture.drag && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5;
    gesture = null;
    canvas.style.cursor = 'grab';
    if (click) activate(cabin.pick(event.clientX, event.clientY));
  });
  function cancelGesture() {
    gesture = null;
    canvas.style.cursor = 'grab';
    releaseHeld();
  }
  canvas.addEventListener('pointercancel', cancelGesture);
  canvas.addEventListener('lostpointercapture', event => {
    if (gesture?.id === event.pointerId) cancelGesture();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!gesture && pinnedControl && !heldControl) describe(pinnedControl);
  });
  window.addEventListener('blur', cancelGesture);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelGesture();
  });

  canvas.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const arrows = {ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32]};
    if (arrows[event.key]) {
      event.preventDefault();
      cabin.rotate(...arrows[event.key]);
      return;
    }
    if (view !== 'dsky' || event.repeat) return;
    const mapping = {v: 'VERB', n: 'NOUN', c: 'CLR', k: 'KEY REL', r: 'RSET', e: 'ENTR', Enter: 'ENTR', '+': '+', '-': '−'};
    const key = /^[0-9]$/.test(event.key) ? event.key : mapping[event.key] || mapping[event.key.toLowerCase()];
    if (key || event.key.toLowerCase() === 'p') {
      event.preventDefault();
      event.stopPropagation();
      send(key ? [key] : ['PRO_DOWN', 'PRO_UP']);
    }
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 320 : 1;
    cabin.zoom(event.deltaY * multiplier);
  }, {passive: false});

  document.querySelector('#native-fit').onclick = () => cabin.setView(view);
  showZones.onchange = () => cabin.select(selectedControl, showZones.checked);
  document.querySelector('#native-v35').onclick = () => send(['VERB', '3', '5', 'ENTR']);
  const agcStatus = document.querySelector('#native-agc-status');
  const lampTest = document.querySelector('#native-v35');
  function agcFailed(message) {
    clearTimeout(agcTimeout);
    agcTimeout = null;
    worker?.terminate();
    ready = false;
    lampTest.disabled = true;
    agcStatus.textContent = 'AGC 启动或运行失败';
    status.textContent = message + '。三维座舱仍可查看，刷新可重新启动计算机。';
  }
  function handleAgcMessage({data}) {
    if (data.type === 'ready') {
      clearTimeout(agcTimeout);
      ready = true;
      lampTest.disabled = false;
      agcStatus.textContent = 'Luminary099（登月舱原始程序）运行中';
      worker.postMessage({type: 'autoThrottle', value: panel.state.THRContSwitch === 1});
    }
    if (data.type === 'panelSignal') {
      acknowledgedThrottle = data.value;
      if (selectedControl === 'THRContSwitch') describe(selectedControl);
    }
    if (data.type === 'display') {
      dskyState = data.state;
      document.querySelector('#native-dsky-output').textContent =
        'PROG（程序）' + data.state.program.join('') + ' · VERB（动作码）' + data.state.verb.join('')
        + ' · NOUN（数据码）' + data.state.noun.join('') + ' · '
        + data.state.registers.map(row => row.join('')).join(' / ');
      drawAtlas();
    }
    if (data.type === 'error') agcFailed(data.message);
  }
  container.replaceChildren(canvas);
  status.textContent = '左键拖动转头，滚轮调视野，点按操作实体控件。五个视角共用座舱、开关和 AGC 状态。';
  agcStatus.textContent = '原始 AGC 启动中';
  try {
    worker = new Worker(new URL('../console/agc-worker.mjs?v=cockpit-20261108-2', import.meta.url), {type: 'module'});
    worker.onmessage = handleAgcMessage;
    worker.onerror = () => agcFailed('计算机程序未能载入');
    agcTimeout = setTimeout(() => agcFailed('计算机启动超时'), 25_000);
    worker.postMessage({type: 'init', craft: 'lm'});
    window.addEventListener('pagehide', event => {
      if (!event.persisted) worker.terminate();
    });
  } catch (error) {
    agcFailed(error.message);
  }
  drawAtlas();

  return {
    setFlight: cabin.setFlight,
    inspectCamera: cabin.snapshot,
    inspectControls() { return panel.controls.map(c => panel.inspect(c.id)); },
    resetControls() {
      cancelGesture();
      descentHelium.reset();
      panel.reset();
      if (selectedControl) describe(selectedControl);
    },
    setView(name) {
      cancelGesture();
      view = name;
      cabin.setView(name);
    }
  };
}
