// SPDX-License-Identifier: GPL-2.0-or-later
// Relay decoding: ND-1021042 Vol II, table 4-C/4-C1; Virtual AGC I/O protocol.
// Mapping cross-checked against webDSKY 1.1.4 (Michael Karl Franzl, GPL-2.0+).
export const SEGMENTS=['','h','m','hm','fm','fhm','fm','fhm','j','jh','jm','jhm','fjm','fjhm','fjm','fjhm','ek','keh','em','ehm','efknm','ehmnkf','efmn','fehmn','ejkn','ehjkn','ejmn','ehjmn','efknmj','ehmnkfj','efjmn','efjhmn'];
const DIGITS={0:' ',3:'1',13:'4',15:'4',19:'7',21:'0',25:'2',27:'3',28:'6',29:'8',30:'5',31:'9'};
export class DskyState{
 constructor(){this.program=[' ',' '];this.verb=[' ',' '];this.noun=[' ',' '];this.registers=Array.from({length:3},()=>Array(5).fill(' '));this.codes={program:[0,0],verb:[0,0],noun:[0,0],registers:Array.from({length:3},()=>Array(5).fill(0))};this.signBits=Array.from({length:3},()=>[0,0]);this.signs=[' ',' ',' '];this.lamps={};this.flash=false;this.elOff=false}
 accept(channel,value){
  if(channel===0o10){
   const selector=value>>>11,hi=(value>>>5)&31,lo=value&31,sign=(value>>>10)&1;
   const pair=(row,col,code)=>{this.registers[row][col]=DIGITS[code]??'?';this.codes.registers[row][col]=code};
   const pairs={1:[[2,3],[2,4]],2:[[2,1],[2,2]],3:[[1,4],[2,0]],4:[[1,2],[1,3]],5:[[1,0],[1,1]],6:[[0,3],[0,4]],7:[[0,1],[0,2]],8:[null,[0,0]]};
   if(pairs[selector]){const [a,b]=pairs[selector];if(a)pair(...a,hi);pair(...b,lo)}
   if(selector===9||selector===10||selector===11){const name={9:'noun',10:'verb',11:'program'}[selector];this.codes[name]=[hi,lo];this[name]=[DIGITS[hi]??'?',DIGITS[lo]??'?']}
   const signMap={1:[2,1],2:[2,0],4:[1,1],5:[1,0],6:[0,1],7:[0,0]};
   if(signMap[selector]){const [r,b]=signMap[selector];this.signBits[r][b]=sign;this.signs[r]=this.signBits[r][1]?'−':this.signBits[r][0]?'+':' '}
   if(selector===12){for(const [name,bit] of Object.entries({priority:0,nodap:1,velocity:2,noatt:3,altitude:4,gimbal:5,tracker:7,prog:8}))this.lamps[name]=!!(value&(1<<bit))}
  }
  if(channel===0o11){this.lamps.activity=!!(value&2);this.lamps.uplink=!!(value&4)}
  if(channel===0o163){for(const [name,bit] of Object.entries({temp:3,keyrel:4,oprerr:6,restart:7,standby:8}))this.lamps[name]=!!(value&(1<<bit));this.flash=!!(value&32);this.elOff=!!(value&512)}
 }
}
