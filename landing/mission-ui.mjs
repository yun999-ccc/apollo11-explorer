// SPDX-License-Identifier: GPL-2.0-or-later
import {descentEvents, DESCENT_DURATION, getReplaySample, milestones, missionTime, PDI, RECONSTRUCTION, REPORT, FILM} from './mission-data.mjs';

const labels = {
  csm: '哥伦比亚号', lm: '鹰号', payload: '鹰号 · 适配器内', s1: 'S-IC · 一级',
  s2: 'S-II · 二级', s3: 'S-IVB · 三级', moon: '月面',
};
// Each row is a connected assembly. Separate rows represent free vehicles.
const configurations = {
  stack: [['csm', 'payload', 's3', 's2', 's1']],
  stage1: [['csm', 'payload', 's3', 's2'], ['s1']],
  stage2: [['csm', 'payload', 's3'], ['s2']],
  transfer: [['csm', 'payload', 's3']],
  turn: [['csm'], ['payload', 's3']],
  dock: [['csm', 'lm', 's3']],
  extract: [['csm', 'lm'], ['s3']],
  orbit: [['csm', 'lm']],
  undock: [['csm'], ['lm']],
  separate: [['csm'], ['lm']],
  doi: [['lm'], ['csm']],
  descent: [['lm'], ['moon']],
  touchdown: [['lm', 'moon']],
};

export function initMission({pauseFlight}) {
  const $ = id => document.getElementById(id);
  const replay = $('descent-replay'), film = $('historical-film'), seek = $('historical-seek');
  let reconstruction, loadData, loadFilm, requestedTime = 0;
  const mediaUrl = new URL('assets/apollo11-right-window.mp4', import.meta.url);
  seek.max = DESCENT_DURATION.toFixed(1);

  function showSample(offset) {
    const time = Math.max(0, Math.min(DESCENT_DURATION, offset));
    seek.value = String(time);
    const event = descentEvents.findLast(item => time >= item.offset);
    $('historical-time').textContent = time >= DESCENT_DURATION - 0.05 ? '102:45:39.9' : missionTime(PDI + time);
    $('historical-phase').textContent = time >= DESCENT_DURATION - 0.05 ? '静海 · 已着陆'
      : time >= descentEvents[8].offset ? 'P66 · 末段着陆'
        : time >= descentEvents[5].offset ? 'P64 · 进近' : 'P63 · 制动';
    $('historical-event').textContent = event.time + ' · ' + event.title;
    if (!reconstruction) return;
    const {values: [altitude, rate, , forward, pitch], basis} = getReplaySample(time, reconstruction);
    const display = (value, decimals, unit) => value === null ? '—' : value.toFixed(decimals) + ' ' + unit;
    $('historical-altitude').textContent = display(altitude, altitude >= 1000 ? 0 : 1, 'ft');
    $('historical-rate').textContent = display(rate, 1, 'ft/s');
    $('historical-forward').textContent = display(forward === null ? null : -forward, 1, 'ft/s');
    $('historical-pitch').textContent = display(pitch, 1, '°');
    $('historical-basis').textContent = basis;
  }

  function prepareReplay() {
    if (!film.src && !loadFilm) {
      $('historical-film-status').textContent = '正在下载右窗原片…';
      // A local static server may not support byte ranges. A local blob can
      // still seek to P64, P66 and touchdown in either hosting environment.
      loadFilm = fetch(mediaUrl).then(response => {
        if (!response.ok) throw new Error('影片下载失败');
        return response.blob();
      }).then(blob => {
        film.src = URL.createObjectURL(blob);
        $('historical-film-status').textContent = '';
      }).catch(() => {
        loadFilm = undefined;
        $('historical-film-status').textContent = '原片未加载，重新打开回放可重试。';
      });
    }
    loadData ??= fetch(new URL('nasa-final-descent.json?v=1', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('下降数据下载失败');
      return response.json();
    }).then(data => {
      reconstruction = data;
      $('historical-export').disabled = false;
      showSample(Number(seek.value));
    }).catch(() => {
      loadData = undefined;
      $('historical-basis').textContent = '数值文件未加载，重新打开回放可重试。';
    });
  }

  function seekReplay(time) {
    requestedTime = time;
    showSample(time);
    if (film.readyState >= 1) film.currentTime = time;
  }

  const stops = milestones.map(milestone => {
    const button = document.createElement('button');
    button.type = 'button';
    const time = document.createElement('time');
    time.textContent = milestone.time;
    button.append(time, document.createTextNode(milestone.title));
    button.onclick = () => {
      showMilestone(milestone);
      if (['descent', 'touchdown'].includes(milestone.configuration)) {
        replay.open = true;
        prepareReplay();
        seekReplay(milestone.configuration === 'touchdown' ? DESCENT_DURATION : 0);
      }
    };
    return button;
  });

  function showMilestone(milestone) {
    stops.forEach((button, index) => button.setAttribute('aria-pressed', String(milestones[index] === milestone)));
    $('mission-event-time').textContent = '任务时间 ' + milestone.time;
    $('mission-event-title').textContent = milestone.title;
    $('mission-event-description').textContent = milestone.description;
    $('mission-assembly').replaceChildren(...configurations[milestone.configuration].map(parts => {
      const assembly = document.createElement('div');
      assembly.className = 'mission-vehicle';
      for (const part of parts) {
        const segment = document.createElement('span');
        segment.dataset.part = part;
        segment.textContent = labels[part];
        assembly.append(segment);
      }
      return assembly;
    }));
  }

  $('mission-stops').append(...stops);
  showMilestone(milestones[0]);
  $('historical-jumps').append(...[0, 2, 5, 8, 10].map(index => {
    const event = descentEvents[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = event.title.split(' · ')[0];
    button.onclick = () => seekReplay(event.offset);
    return button;
  }));

  replay.addEventListener('toggle', () => {
    if (replay.open) prepareReplay();
    else film.pause();
  });
  seek.addEventListener('input', () => seekReplay(Number(seek.value)));
  $('historical-speed').onchange = event => { film.playbackRate = Number(event.target.value); };
  film.addEventListener('loadedmetadata', () => { film.currentTime = requestedTime; });
  film.addEventListener('timeupdate', () => showSample(film.currentTime));
  film.addEventListener('error', () => { $('historical-film-status').textContent = '浏览器未能播放原片，仍可查看右侧数据。'; });
  film.addEventListener('play', pauseFlight);
  $('historical-export').onclick = () => {
    const record = {type: 'historical-descent-replay', start: PDI, durationSeconds: DESCENT_DURATION,
      report: REPORT, film: FILM, reconstruction: RECONSTRUCTION, events: descentEvents,
      samples: Array.from({length: Math.ceil(DESCENT_DURATION) + 1}, (_, second) => {
        const offsetSeconds = Math.min(second, DESCENT_DURATION);
        const {values, basis} = getReplaySample(offsetSeconds, reconstruction);
        return {offsetSeconds, values, basis};
      }), columns: reconstruction.columns};
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Apollo11-historical-descent.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  showSample(0);
  return {pauseReplay() { film.pause(); }};
}
