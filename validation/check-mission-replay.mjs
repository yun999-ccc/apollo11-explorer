import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createFlight, FT, PARAMETERS} from '../landing/flight.mjs';
import {LROC_TERRAIN, measuredTerrainMesh, tranquilityHeight} from '../landing/lroc-terrain.mjs';
import {createFixedClock} from '../simulation/fixed-clock.mjs';
import {DESCENT_DURATION, descentEvents, getReplaySample, milestones, PDI} from '../landing/mission-data.mjs';

const base = new URL('../landing/', import.meta.url);
const reconstruction = JSON.parse(await readFile(new URL('nasa-final-descent.json', base)));
const near = (actual, expected, tolerance) => assert(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected} by more than ${tolerance}`);

// Independently transcribed checkpoints from the original report Tables 3-I,
// 5-I and 5-III and NASA/TM-20220007267 Figure 14 (rounded to graph divisions).
assert.equal(milestones.find(item => item.configuration === 'extract').time, '04:16:59.1');
assert.equal(milestones.find(item => item.configuration === 'undock').time, '100:12:00');
assert.equal(descentEvents.find(item => item.title.startsWith('P64')).offset, 507);
assert.equal(descentEvents.find(item => item.title.startsWith('P66')).offset, 617);
near(DESCENT_DURATION, 754.9, 1e-6);
near(getReplaySample(0, reconstruction).values[0], 49376, 0.01);
near(getReplaySample(507, reconstruction).values[0], 7129, 0.01);
const finalStart = DESCENT_DURATION - (reconstruction.samples.length - 1) * reconstruction.sampleSeconds;
const figureCheckpoints = [[0, 405, -10.5], [40, 260, -1.5], [80, 105, -3.5], [120, 18, 0.5]];
const checkedCurve = figureCheckpoints.map(([second, altitude, rate]) => {
  const [actualAltitude, actualRate] = getReplaySample(finalStart + second, reconstruction).values;
  near(actualAltitude, altitude, 10);
  near(actualRate, rate, 1);
  return {second, approximateFigureAltitudeFt: altitude, extractedAltitudeFt: actualAltitude,
    approximateFigureVerticalRateFtS: rate, extractedVerticalRateFtS: actualRate};
});

// The crop generator independently samples the TIFF near the LROC landing
// coordinate. The drawn mesh and contact function must agree at a vertex.
near(tranquilityHeight(0, 0), 0, 1e-9);
near(tranquilityHeight(768, 0), 8.54, 0.03);
const {vertices} = measuredTerrainMesh();
const siteVertex = vertices.findIndex((value, i) => i % 3 === 0 && value === 0 && vertices[i + 2] === -768);
assert(siteVertex >= 0);
near(vertices[siteVertex + 1], tranquilityHeight(768, 0), 1e-9);

function runFlight(inputs, fps) {
  const flight = createFlight(PARAMETERS, tranquilityHeight);
  const initial = {...flight.state};
  const samples = [];
  let index = 0;
  const clock = createFixedClock(({dt}) => {
    if (flight.state.touchdown) return;
    while (inputs[index]?.tick === flight.state.tick) {
      const input = inputs[index++];
      flight.input(input.action, input.value);
    }
    flight.step(dt);
    if (flight.state.tick % 60 === 0 || flight.state.touchdown) samples.push({...flight.state});
  });
  for (let frame = 0; frame < 220 * fps && !flight.state.touchdown; frame++) clock.advance(1 / fps);
  assert(flight.state.touchdown, 'Flight must touch down');
  assert(flight.state.probeContactTime < flight.state.touchdown.time);
  near(flight.state.altitude, tranquilityHeight(flight.state.x, flight.state.y), 1e-9);
  return {version: 1, scenario: 'LM-5 engineering terminal-descent model', timestep: 1 / 60,
    terrain: LROC_TERRAIN, parameters: flight.parameters, events: flight.events, initial, samples, currentState: {...flight.state},
    originalAgcClosedLoop: false, historicalFlightReproduction: false};
}

const baseline = runFlight([], 60);
const changedInputs = [{tick: 120, action: 'rate', value: -1}, {tick: 360, action: 'roll', value: 1}];
const changed = runFlight(changedInputs, 60);
assert.deepEqual(changed.initial, baseline.initial);
assert.deepEqual(changed, runFlight(changedInputs, 30));
assert.deepEqual(changed, runFlight(changedInputs, 144));
near(changed.currentState.rateCommand - baseline.currentState.rateCommand, -FT, 1e-12);
assert(Math.abs(changed.currentState.touchdown.y - baseline.currentState.touchdown.y) > 1);
assert(Math.abs(changed.currentState.touchdown.time - baseline.currentState.touchdown.time) > 1);

const result = {historicalReplay: {startMissionSeconds: PDI, durationSeconds: DESCENT_DURATION,
  reference: reconstruction.source, checkedCurve, nativeHistoricalTelemetry: false},
  engineeredDescent: {terrain: LROC_TERRAIN, siteElevationRelativeToStartM: tranquilityHeight(768, 0),
  baseline: baseline.currentState.touchdown, changed: changed.currentState.touchdown,
  testedFramesPerSecond: [30, 60, 144], originalAgcClosedLoop: false}};
if (process.argv.includes('--write')) {
  for (const [filename, record] of Object.entries({'mission-verification.json': result,
    'p66-baseline.json': baseline, 'p66-adjusted.json': changed})) {
    await writeFile(new URL(filename, base), JSON.stringify(record) + '\n');
  }
}
console.log(JSON.stringify(result, null, 2));
