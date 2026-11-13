// SPDX-License-Identifier: GPL-2.0-or-later
export const REPORT = 'https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_MissionReport.pdf';
export const RECONSTRUCTION = 'https://ntrs.nasa.gov/citations/20220007267';
export const FILM = 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/video11.html';
export const PDI = 102 * 3600 + 33 * 60 + 5;
export const TOUCHDOWN = 102 * 3600 + 45 * 60 + 39.9;
export const DESCENT_DURATION = TOUCHDOWN - PDI;
const seconds = time => time.split(':').map(Number).reduce((total, part) => total * 60 + part);

export const milestones = [
  ['00:00:00.6', '离开发射台', '土星五号携带哥伦比亚号和鹰号升空。鹰号还装在第三级上方的适配器里。', 'stack'],
  ['00:02:41.7', '一级关机与分离', '这是 S-IC 外侧发动机关机时刻。随后一级脱离，二级 S-II 接力点火。', 'stage1'],
  ['00:09:08.3', '二级关机与分离', '这是 S-II 关机时刻。随后二级脱离，第三级 S-IVB 在 00:09:12.2 点火。', 'stage2'],
  ['02:44:16.2', '驶向月球', '第三级再次点火，把仍连接在一起的飞船送上地月转移轨道。', 'transfer'],
  ['03:17:04.6', '哥伦比亚号脱离第三级', '指令舱与服务舱一起离开第三级，转身面对还在适配器里的鹰号。', 'turn'],
  ['03:24:03.1', '与鹰号对接', '哥伦比亚号对准鹰号并接合。鹰号此时还在第三级适配器上。', 'dock'],
  ['04:16:59.1', '取出鹰号', '已对接的哥伦比亚号和鹰号一起离开第三级。', 'extract'],
  ['75:49:50.4', '进入月球轨道', '服务舱主发动机减速，带着仍对接的两艘飞船进入月球轨道。', 'orbit'],
  ['100:12:00', '鹰号在月轨解锁', '阿姆斯特朗和奥尔德林乘鹰号解锁。柯林斯驾驶哥伦比亚号留在月轨。', 'undock'],
  ['100:39:52.9', '哥伦比亚号拉开距离', '哥伦比亚号的姿态控制系统点火。两个飞船此时已解锁，机动进一步拉开距离。', 'separate'],
  ['101:36:14', '鹰号降低轨道', '下降发动机点火约 30 秒，把轨道近月点降到约 50,000 英尺。随后仍有一段滑行。', 'doi'],
  ['102:33:05', '动力下降点火', '鹰号开始用下降发动机制动。可进入右舷窗历史回放。', 'descent'],
  ['102:45:39.9', '脚垫触地', '鹰号在静海着陆。接触探针、脚垫和关机各自有不同的含义。', 'touchdown'],
].map(([time, title, description, configuration]) => ({time, title, description, configuration}));

export const descentEvents = [
  ['102:33:05', 'P63 · 下降发动机点火'],
  ['102:37:59', '窗朝上转向完成'],
  ['102:38:22', '首次 1202 程序报警'],
  ['102:38:45', '允许着陆雷达更新'],
  ['102:39:31', '下降发动机节流转换'],
  ['102:41:32', 'P64 · 进近'],
  ['102:42:19', '雷达进入低高度量程'],
  ['102:43:13', '指令长切至姿态保持'],
  ['102:43:22', 'P66 · 乘员操纵姿态，计算机控制下降率'],
  ['102:44:28', '下降推进剂低量传感器亮灯'],
  ['102:45:39.9', '脚垫接触月面'],
].map(([time, title]) => ({time, title, offset: seconds(time) - PDI}));

// Table 5-III best-estimate altitude, Table 5-I, section 5.3, and the
// approximate reading at Fig. 5-3 marker 6. Interpolated, not raw telemetry.
const earlyAltitude = [
  ['102:33:05', 49376], ['102:36:57', 43000], ['102:37:59', 36000],
  ['102:38:50', 30000], ['102:39:31', 22500], ['102:41:32', 7129],
  ['102:42:19', 2500], ['102:43:13', 600],
].map(([time, altitude]) => [seconds(time) - PDI, altitude]);

export function getReplaySample(offset, reconstruction) {
  const time = Math.max(0, Math.min(offset, DESCENT_DURATION));
  const {samples, sampleSeconds} = reconstruction;
  const finalStart = DESCENT_DURATION - (samples.length - 1) * sampleSeconds;
  if (time >= finalStart) {
    const index = (time - finalStart) / sampleSeconds;
    const lower = Math.min(Math.floor(index), samples.length - 1);
    const next = samples[Math.min(lower + 1, samples.length - 1)];
    const values = samples[lower].map((value, i) => {
      if (index === lower) return value;
      return value === null || next[i] === null ? null : value + (next[i] - value) * (index - lower);
    });
    return {values, basis: 'NASA 末段轨迹重建 · 图 14 数字化'};
  }
  const upper = earlyAltitude.findIndex(point => point[0] > time);
  const [start, startHeight] = earlyAltitude[upper < 0 ? earlyAltitude.length - 1 : upper - 1];
  const [end, endHeight] = upper < 0 ? [finalStart, samples[0][0]] : earlyAltitude[upper];
  const rate = (endHeight - startHeight) / (end - start);
  return {values: [startHeight + (time - start) * rate, rate, null, null, null], basis: '任务报告高度锚点插值 · 速率为段平均值'};
}

export function missionTime(time) {
  const whole = Math.floor(time + 1e-6);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}
