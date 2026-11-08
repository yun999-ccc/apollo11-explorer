import assert from 'node:assert/strict';
import {createDescentHelium} from '../landing/descent-helium.mjs';

const primary = 'DESHeReg1Switch';
const secondary = 'DESHeReg2Switch';
const model = createDescentHelium();
const state = (model, id) => model.inspect(id).open;
const frame = (model, id) => model.inspect(id).frame;

// PDI T-15m scenario, PRIMREGHELIUMVALVE_ISOPEN and SECREGHELIUMVALVE_ISOPEN.
assert.equal(state(model, primary), true);
assert.equal(state(model, secondary), false);
model.move(primary, 0);
model.move(primary, 1);
model.move(secondary, 2);
model.move(secondary, 1);
assert.equal(state(model, primary), false, 'release must not reopen the primary valve');
assert.equal(state(model, secondary), true, 'release must not close the secondary valve');
assert.deepEqual([frame(model, primary), frame(model, secondary)], [3, 0]);
for (const expected of [[2, 1], [1, 2], [0, 3]]) {
  model.advance(0.25);
  assert.deepEqual([frame(model, primary), frame(model, secondary)], expected);
}
assert.equal(model.moving, false);

const belowThreshold = createDescentHelium({commandVoltage: 20});
belowThreshold.move(primary, 0);
belowThreshold.move(secondary, 2);
assert.equal(state(belowThreshold, primary), true);
assert.equal(state(belowThreshold, secondary), false);
const aboveThreshold = createDescentHelium({commandVoltage: 20.01});
aboveThreshold.move(primary, 0);
assert.equal(state(aboveThreshold, primary), false);
assert.equal(state(aboveThreshold, secondary), false, 'command must not affect another valve');

const indicatorUnpowered = createDescentHelium({indicatorVoltage: 20});
indicatorUnpowered.move(primary, 0);
indicatorUnpowered.move(secondary, 2);
indicatorUnpowered.advance(1);
assert.deepEqual([state(indicatorUnpowered, primary), state(indicatorUnpowered, secondary)], [false, true]);
assert.deepEqual([frame(indicatorUnpowered, primary), frame(indicatorUnpowered, secondary)], [3, 0]);
model.reset();
assert.deepEqual([state(model, primary), state(model, secondary)], [true, false]);
assert.deepEqual([frame(model, primary), frame(model, secondary)], [3, 0]);
const vc = createDescentHelium({indicatorRate: 64});
vc.move(primary, 0);
vc.advance(2 / 64);
assert.equal(frame(vc, primary), 1);
vc.advance(1 / 64);
assert.equal(frame(vc, primary), 0);
console.log('Two descent helium valves verified: independent latch, strict >20 V command threshold, separate indicator power, original frame travel, and scenario reset.');
