// SPDX-License-Identifier: GPL-2.0-or-later
// Verify individual mechanical controls against the pinned upstream definitions.
// Deliberately does not certify any unported system effects or mission state.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPanelControls} from '../landing/panel-controls.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {controls}=JSON.parse(await read('landing/nassp/controls/controls.json'));
const source=await read('landing/nassp/lempanel.cpp');
const signals=[];
const panel=createPanelControls(controls,{onSignal:s=>signals.push(s)});
assert.equal(controls.length,47);
assert.equal(new Set(controls.map(c=>c.id)).size,47);
let interactive=0,blocked=0,springs=0,positions=0;
for(const c of controls){
  const line=source.split('\n')[c.line-1];
  assert(line.includes(c.id+'.Init('),c.id+' source location');
  assert(source.split('\n')[c.registerLine-1].includes(c.id+'.Register'),c.id+' registration location');
  const inspected=panel.inspect(c.id);
  assert(inspected.chinese && inspected.purpose && inspected.current,c.id+' translated description');
  if(inspected.blocked){
    blocked++;
    assert.equal(panel.set(c.id,1).accepted,false,c.id+' must not imply an unimplemented abort/alarm action');
    assert.equal(panel.state[c.id],c.default);
    continue;
  }
  interactive++;
  const max=c.kind==='rotary'?c.angles.length-1:c.kind==='three'?2:1;
  assert.equal(inspected.labels.length,max+1,c.id+' all physical positions described');
  for(let value=0;value<=max;value++){
    assert(panel.set(c.id,value).accepted);
    assert.equal(panel.state[c.id],value);
    assert.equal(panel.inspect(c.id).current,inspected.labels[value]);
    positions++;
  }
  assert.equal(panel.move(c.id,1).changed,false,c.id+' upper stop');
  panel.set(c.id,0);
  assert.equal(panel.move(c.id,-1).changed,false,c.id+' lower stop');
  assert.throws(()=>panel.set(c.id,-1),RangeError);
  assert.throws(()=>panel.set(c.id,max+1),RangeError);
  assert.throws(()=>panel.set(c.id,NaN),RangeError);
  if(c.spring){
    springs++;
    assert(source.split('\n')[c.registerLine-1].includes('SPRINGLOADEDSWITCH_CENTER'));
    for(const direction of [-1,1]){
      panel.set(c.id,1);panel.move(c.id,direction);
      assert.equal(panel.state[c.id],1+direction);
      panel.release(c.id);assert.equal(panel.state[c.id],1,c.id+' returns to center');
    }
  } else {panel.set(c.id,max);panel.release(c.id);assert.equal(panel.state[c.id],max,c.id+' retains position');}
}
assert.deepEqual({interactive,blocked,springs},{interactive:43,blocked:4,springs:19});
assert(signals.length>0 && signals.every(s=>s.name==='autoThrottle'&&typeof s.value==='boolean'));
panel.reset();
for(const c of controls)assert.equal(panel.state[c.id],c.default);
assert.equal(panel.events.length,0);
assert.deepEqual(signals.at(-1),{name:'autoThrottle',value:true});
console.log(JSON.stringify({individualControls:47,mechanicalControls:interactive,positionsTested:positions,springReturnControls:springs,explicitlyBlocked:blocked,sourceLocationsChecked:94,originalFlightClosedLoopVerified:false}));
