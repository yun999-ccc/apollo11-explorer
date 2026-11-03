import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFlight, PARAMETERS, FT} from '../landing/flight.mjs';
import {groundHeight} from '../landing/terrain.mjs';
import {createFixedClock} from '../simulation/fixed-clock.mjs';
const checks = [];
function check(name, run) { const evidence = run(); checks.push({name, pass: true, evidence}); }
function runAssisted(dt) {
  const flight = createFlight(); flight.input('assist', 1);
  for (let i = 0; i < 600 / dt && !flight.state.touchdown; i++) flight.step(dt);
  assert(flight.state.touchdown, 'Assisted descent did not contact surface');
  return flight.state.touchdown;
}
check('Free fall agrees with independent analytic solution', () => {
  const flight = createFlight();
  Object.assign(flight.state, {altitude: 100, vz: 0, vx: 0, vy: 0, engine: false});
  for (let i = 0; i < 600; i++) flight.step();
  const expected = 100 - PARAMETERS.gravity * 10 ** 2 / 2;
  const error = Math.abs(flight.state.altitude - expected);
  assert(error < 1e-9); assert(Math.abs(flight.state.vz + PARAMETERS.gravity * 10) < 1e-9);
  return {expectedHeightM: expected, errorM: error};
});
check('Fuel consumption agrees with integrated thrust / Isp / g0', () => {
  const flight = createFlight();
  Object.assign(flight.state, {altitude: 1000, vz: 0, vx: 0, rateCommand: 0});
  let consumed = 0;
  for (let i = 0; i < 600; i++) {
    flight.step(); consumed += flight.state.thrust / (PARAMETERS.specificImpulse * PARAMETERS.standardGravity * 60);
  }
  const error = Math.abs(PARAMETERS.initialPropellant - flight.state.fuel - consumed);
  assert(error < 1e-8); return {errorKg: error};
});
check('Engine cutoff consumes no further fuel', () => {
  const flight = createFlight(); flight.input('engine', 0);
  for (let i = 0; i < 60; i++) flight.step();
  assert.equal(flight.state.thrust, 0); assert.equal(flight.state.fuel, PARAMETERS.initialPropellant);
  return {thrustN: flight.state.thrust, remainingKg: flight.state.fuel};
});
check('One descent-rate input equals one foot per second', () => {
  const flight = createFlight(); const before = flight.state.rateCommand;
  flight.input('rate', 1); assert(Math.abs(flight.state.rateCommand - before - FT) < 1e-12);
  return {incrementMps: FT};
});
check('Thrust vector follows tilt without artificial horizontal drag', () => {
  const flight = createFlight();
  Object.assign(flight.state, {altitude: 1000, pitch: 0, pitchCommand: 0, roll: 0, vx: 10, vy: 5});
  for (let i = 0; i < 60; i++) flight.step();
  assert.equal(flight.state.vx, 10); assert.equal(flight.state.vy, 5);
  return {vx: flight.state.vx, vy: flight.state.vy};
});
check('Ground sampling and touchdown use the same surface', () => {
  const flight = createFlight(PARAMETERS, groundHeight); flight.input('assist', 1);
  for (let i = 0; i < 36000 && !flight.state.touchdown; i++) flight.step();
  assert(flight.state.touchdown);
  assert(Math.abs(flight.state.altitude - groundHeight(flight.state.x, flight.state.y)) < 1e-10);
  const before = JSON.stringify(flight.state); flight.step();
  assert.equal(JSON.stringify(flight.state), before);
  return flight.state.touchdown;
});
check('Half-step refinement converges for assisted touchdown', () => {
  const coarse = runAssisted(1 / 60), fine = runAssisted(1 / 120), finer = runAssisted(1 / 240);
  const timeCoarse = Math.abs(coarse.time - finer.time), timeFine = Math.abs(fine.time - finer.time);
  assert(timeFine < timeCoarse); assert(timeCoarse < 0.5);
  assert(Math.abs(coarse.verticalSpeed - finer.verticalSpeed) < 0.02);
  return {timeErrorAt60Hz: timeCoarse, timeErrorAt120Hz: timeFine, coarse, finer};
});
check('Same tick-indexed controls give identical results at 30/60/144 render FPS', () => {
  const replay = [{tick: 180, action: 'rate', value: 1}, {tick: 360, action: 'pitch', value: 3}, {tick: 600, action: 'assist', value: 1}];
  const runs = [30, 60, 144].map(fps => {
    const flight = createFlight(); let index = 0;
    const clock = createFixedClock(({dt}) => {
      while (index < replay.length && replay[index].tick === flight.state.tick) {
        const event = replay[index++]; flight.input(event.action, event.value);
      }
      flight.step(dt);
    });
    for (let frame = 0; frame < fps * 20; frame++) clock.advance(1 / fps);
    return {fps, state: {...flight.state}, events: flight.events};
  });
  for (const run of runs) { assert.deepEqual(run.state, runs[0].state); assert.deepEqual(run.events, replay); }
  return runs.map(run => ({fps: run.fps, time: run.state.time, tick: run.state.tick}));
});
check('Operator change produces a different trajectory', () => {
  const baseline = createFlight(), changed = createFlight(); changed.input('rate', 2);
  for (let i = 0; i < 1200; i++) { baseline.step(); changed.step(); }
  const delta = changed.state.altitude - baseline.state.altitude;
  assert(delta > 5); return {heightDifferenceM: delta};
});
check('Empty propellant, bounded commands and invalid inputs', () => {
  const flight = createFlight(); flight.state.fuel = 0; flight.step();
  assert.equal(flight.state.thrust, 0); assert.equal(flight.state.fuel, 0);
  flight.input('rate', 100); assert.equal(flight.state.rateCommand, 3 * FT);
  assert.throws(() => flight.input('rate', NaN)); assert.throws(() => flight.step(-1));
  assert.throws(() => flight.input('unknown', 1));
  return {fuelKg: flight.state.fuel, maximumUpwardRateMps: flight.state.rateCommand};
});
const result = {date: '2026-11-03', checks, allPassed: true, historicalFlightValidated: false, originalAgcClosedLoop: false, browserVerification: 'pending'};
fs.writeFileSync(new URL('../landing/validation.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
