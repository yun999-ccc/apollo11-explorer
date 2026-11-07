// SPDX-License-Identifier: GPL-2.0-or-later
// Mechanical switch behavior ported from NASSP toggleswitch.cpp. This is not
// an electrical/propellant/environment simulation. Unported effects stay explicit.
const definitions = {
  EngineArmSwitch:['ENG ARM','发动机预备',['DES（下降发动机）','OFF（关闭）','ASC（上升发动机）'],'选择预备的发动机；完整启动联锁尚未移植。'],
  LeftXPointerSwitch:['X-POINTER SCALE','左交叉指针量程',['LO MULT（低倍率）','HI MULT（高倍率）'],'选择交叉指针的显示倍率。'],
  GuidContSwitch:['GUID CONT','制导控制',['AGS（中止制导系统）','PGNS（主制导导航系统）'],'选择制导来源；AGS计算机和切换继电器尚未接通。'],
  ModeSelSwitch:['MODE SEL','数据来源选择',['AGS（中止制导系统）','PGNS（主制导导航系统）','LDG RADAR（着陆雷达）'],'选择仪表使用的数据来源。'],
  AltRngMonSwitch:['ALT/RNG MON','高度／距离监视',['ALT/ALT RT（高度／高度变化率）','RNG/RNG RT（距离／距离变化率）'],'选择带尺显示的物理量。'],
  RateErrorMonSwitch:['RATE/ERR MON','左角速度／误差监视',['LDG RDR/CMPTR（着陆雷达／计算机）','RNDZ RADAR（交会雷达）'],'切换监视信号来源。'],
  RightRateErrorMonSwitch:['RATE/ERR MON','右角速度／误差监视',['LDG RDR/CMPTR（着陆雷达／计算机）','RNDZ RADAR（交会雷达）'],'切换监视信号来源。'],
  AttitudeMonSwitch:['ATTITUDE MON','左姿态监视',['AGS（中止制导系统）','PGNS（主制导导航系统）'],'选择姿态指示器参考来源。'],
  RightAttitudeMonSwitch:['ATTITUDE MON','右姿态监视',['AGS（中止制导系统）','PGNS（主制导导航系统）'],'选择姿态指示器参考来源。'],
  ShiftTruSwitch:['SHIFT/TRU','姿态误差量程',['±5°','±50°'],'选择FDAI（姿态指示器）的误差量程。'],
  RateScaleSwitch:['RATE SCALE','角速度量程',['5°/SEC（每秒5度）','25°/SEC（每秒25度）'],'选择姿态指示器的角速度量程。'],
  ACAPropSwitch:['ACA PROP','左姿态控制器比例模式',['DISABLE（禁用）','ENABLE（启用）'],'选择姿态控制器的比例控制模式。'],
  RightACAPropSwitch:['ACA PROP','右姿态控制器比例模式',['DISABLE（禁用）','ENABLE（启用）'],'选择姿态控制器的比例控制模式。'],
  THRContSwitch:['THR CONT','推力控制',['MAN（手动）','AUTO（自动）'],'按NASSP原始接线写入AGC通道030的AutoThrottle信号；不等于AGC已接管网页飞行。'],
  MANThrotSwitch:['MAN THROT','手动节流控制来源',['SE（系统工程师）','CDR（指令长）'],'选择由哪一侧控制器提供手动节流指令。'],
  ATTTranslSwitch:['ATT/TRANSL','姿态／平移喷口模式',['2 JETS（双喷口）','4 JETS（四喷口）'],'选择姿态与平移控制的喷口工作方式。'],
  BALCPLSwitch:['BAL CPL','平衡耦合',['OFF（关闭）','ON（开启）'],'选择平衡耦合功能；喷口分配和继电器尚未移植。'],
  QTYMonSwitch:['PRPLNT QTY MON','推进剂数量监视',['OFF（关闭）','DES 2（下降级第2组）','DES 1（下降级第1组）'],'选择推进剂数量监视通道。'],
  TempPressMonSwitch:['PRPLNT TEMP/PRESS MON','推进剂温度压力监视',['DES 2（下降级第2组）','DES 1（下降级第1组）','ASC（上升级）'],'选择推进剂温度与压力监视来源。'],
  HeliumMonRotary:['HELIUM MON','氦气监视',['SUPCRIT（超临界）','PRESS 1（压力1）','PRESS 2（压力2）','TEMP 1（温度1）','TEMP 2（温度2）','DES AMB PRESS（下降级环境温度氦气压力）','ASC PRESS（上升级压力）'],'选择氦气传感器。数据来源和量程需与系统手册进一步核对，当前不生成读数。'],
  TempPressMonRotary:['TEMP/PRESS MON','温度压力监视选择',['HE（氦气）','PRPLNT（推进剂贮箱）','FUEL MANF（燃料歧管）','OXID MANF（氧化剂歧管）'],'选择监视回路；目前无传感器模型。'],
  GlycolRotary:['GLYCOL','乙二醇冷却泵选择',['INST (SEC)（仪表／次级）','PUMP 1（1号泵）','PUMP 2（2号泵）'],'选择冷却回路泵；不能仅凭旋钮位置推算冷却液压力。'],
  SuitFanRotary:['SUIT FAN','航天服通风机',['OFF（关闭）','1（1号风机）','2（2号风机）'],'选择航天服回路通风机；电源和气体回路尚未移植。'],
  QtyMonRotary:['O₂/H₂O QTY MON','氧气／水量监视',['C/W RESET（告警复位）','DES（下降级）','ASC 1（上升级1）','ASC 2（上升级2）'],'选择氧气与水量显示来源；不提供未经验证的库存数据。'],
  AbortSwitch:['ABORT','中止',['RELEASED（释放）','PRESSED（按下）'],'向制导系统请求中止。任务中止程序与飞行状态尚未接通，本版不执行中止。'],
  AbortStageSwitch:['ABORT STAGE','中止分级',['RELEASED（释放）','PRESSED（按下）'],'带保护盖的中止分级指令；分级及上升程序尚未移植，本版不执行分级。'],
  LeftMasterAlarmSwitch:['MASTER ALARM','左主警报',['RELEASED（释放）','PRESSED（按下）'],'确认主警报；原始CWEA（告警电子组件）尚未移植，不能模拟清除真实故障。'],
  RightMasterAlarmSwitch:['MASTER ALARM','右主警报',['RELEASED（释放）','PRESSED（按下）'],'确认主警报；原始CWEA（告警电子组件）尚未移植，不能模拟清除真实故障。']
};
export function describeControl(c) {
  let d=definitions[c.id];
  const helium=c.id.match(/^(ASC|DES)HeReg([12])Switch$/);
  const feed=c.id.match(/^RCSAscFeed([12])([AB])Switch$/);
  const quad=c.id.match(/^RCSQuad([1-4])([AB])CmdEnableSwitch$/);
  const main=c.id.match(/^RCSMainSov([AB])Switch$/);
  if(helium)d=[`${helium[1]} He REG ${helium[2]}`,`${helium[1]==='ASC'?'上升级':'下降级'}氦气调节器${helium[2]}`,['CLOSE（关闭）','CENTER（回中）','OPEN（打开）'],'保持指令后松手回中；阀门与供电回路尚未移植，不能把开关位置当作阀门已到位。'];
  if(feed)d=[`SYS ${feed[2]} ASC FEED ${feed[1]}`,`${feed[2]}系统上升级推进剂供给${feed[1]}`,['CLOSE（关闭）','CENTER（回中）','OPEN（打开）'],'发出推进剂供给阀指令，松手回中。阀门与电气联锁尚未移植。'];
  if(quad)d=[`SYS ${quad[2]} QUAD ${quad[1]} LGC CMD`,`${quad[2]}系统第${quad[1]}组制导指令使能`,['DISABLE（禁用）','CENTER（回中）','ENABLE（启用）'],'发出隔离阀控制指令，松手回中。阀门反馈和推进器故障逻辑尚未移植。'];
  if(main||c.id==='RCSXFeedSwitch')d=[main?`MAIN SOV SYS ${main[1]}`:'CRSFD',main?`${main[1]}系统主关断阀`:'反作用控制交叉供给',['CLOSE（关闭）','CENTER（回中）','OPEN（打开）'],'发出阀门控制指令，松手回中；阀门与供电回路尚未移植。'];
  if(!d)throw new Error(`Missing reviewed control description: ${c.id}`);
  if(c.id==='HeliumMonRotary')d=[d[0],d[1],c.angles.map((angle,i)=>`POSITION ${i}（第${i+1}档，原图角度${angle}°；名称对应待核）`),d[3]];
  return {english:d[0],chinese:d[1],labels:d[2],purpose:d[3]};
}
export function createPanelControls(items,{onSignal=()=>{},onChange=()=>{}}={}) {
  const controls=items.map(c=>({...c,...describeControl(c)}));
  const state=Object.fromEntries(controls.map(c=>[c.id,c.default]));
  const events=[];
  const lookup=id=>{const c=controls.find(c=>c.id===id);if(!c)throw new Error('Unknown panel control');return c;};
  function set(id,value) {
    const c=lookup(id),max=c.kind==='rotary'?c.angles.length-1:c.kind==='three'?2:1;
    if(!Number.isInteger(value)||value<0||value>max)throw new RangeError('Invalid switch position');
    if(c.kind==='abort'||c.kind==='alarm')return {accepted:false,reason:c.purpose};
    const old=state[id];state[id]=value;
    if(old!==value){
      events.push({id,from:old,to:value});
      if(id==='THRContSwitch')onSignal({name:'autoThrottle',value:value===1});
      onChange(c);
    }
    return {accepted:true,changed:old!==value};
  }
  return {controls,state,events,set,
    move(id,direction){const c=lookup(id);const max=c.kind==='rotary'?c.angles.length-1:c.kind==='three'?2:1;return set(id,Math.min(max,Math.max(0,c.kind==='two'?(direction>0?1:0):state[id]+Math.sign(direction))));},
    release(id){const c=lookup(id);if(c.spring)set(id,1);},
    reset(){for(const c of controls)state[c.id]=c.default;events.length=0;onSignal({name:'autoThrottle',value:state.THRContSwitch===1});onChange();},
    inspect(id){const c=lookup(id);return {...c,value:state[id],current:c.labels[state[id]],systemConnected:id==='THRContSwitch',blocked:['abort','alarm'].includes(c.kind)};}
  };
}
