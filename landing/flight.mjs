// SPDX-License-Identifier: GPL-2.0-or-later
// SI units. Local tangent frame: x forward, y right, z up.
// Engineering model of rate-command control; original Luminary ROM is operated separately.
export const FT = 0.3048;
export const LBF = 4.4482216152605;
export const PARAMETERS = Object.freeze({
  gravity: 1.62,
  maximumThrust: 9870 * LBF,
  minimumThrust: 1050 * LBF,
  throttleMaximum: 6300 / 9870,
  specificImpulse: 305,
  standardGravity: 9.80665,
  inertMass: 6500,
  initialPropellant: 650,
  engineLag: 0.3,
  attitudeSlewDegrees: 3,
  rateGain: 0.8
});
const rad = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function createFlight(parameters = PARAMETERS, ground = () => 0) {
  const p = {...parameters};
  const s = {
    tick: 0, time: 0, x: 0, y: 0, altitude: 400 * FT,
    vx: 58 * FT, vy: 0, vz: -9 * FT,
    pitch: 6, roll: 0, pitchCommand: 6, rollCommand: 0,
    rateCommand: -3 * FT, fuel: p.initialPropellant,
    thrust: (p.inertMass + p.initialPropellant) * p.gravity,
    engine: true, contact: false, touchdown: null, assist: false
  };
  const events = [];
  function input(action, value) {
    if (s.touchdown) return;
    if (!Number.isFinite(value)) throw new TypeError('Control value must be finite');
    switch (action) {
      case 'rate': s.rateCommand = clamp(s.rateCommand + value * FT, -15 * FT, 3 * FT); break;
      case 'pitch': s.pitchCommand = clamp(s.pitchCommand + value, -25, 35); break;
      case 'roll': s.rollCommand = clamp(s.rollCommand + value, -20, 20); break;
      case 'engine': s.engine = Boolean(value); break;
      case 'assist': s.assist = Boolean(value); break;
      default: throw new TypeError('Unknown control');
    }
    events.push({tick: s.tick, action, value});
  }
  function step(dt = 1 / 60) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('Invalid integration step');
    if (s.touchdown) return;
    if (s.assist) {
      s.rateCommand = -Math.min(2.2, Math.max(0.35, s.altitude * 0.035));
      s.pitchCommand = clamp(Math.atan(s.vx * 0.16 / p.gravity) / rad, -25, 35);
      s.rollCommand = clamp(-Math.atan(s.vy * 0.16 / p.gravity) / rad, -20, 20);
    }
    const slew = p.attitudeSlewDegrees * dt;
    s.pitch += clamp(s.pitchCommand - s.pitch, -slew, slew);
    s.roll += clamp(s.rollCommand - s.roll, -slew, slew);
    const pitch = s.pitch * rad, roll = s.roll * rad;
    const axis = [-Math.sin(pitch), Math.cos(pitch) * Math.sin(roll), Math.cos(pitch) * Math.cos(roll)];
    const mass = p.inertMass + s.fuel;
    let desired = mass * (p.gravity + p.rateGain * (s.rateCommand - s.vz)) / Math.max(0.2, axis[2]);
    desired = clamp(desired, p.minimumThrust, p.maximumThrust * p.throttleMaximum);
    if (!s.engine || s.fuel <= 0) desired = 0;
    s.thrust += (desired - s.thrust) * (1 - Math.exp(-dt / p.engineLag));
    if (!s.engine || s.fuel <= 0) s.thrust = 0;
    const demand = s.thrust * dt / (p.specificImpulse * p.standardGravity);
    if (demand > s.fuel && demand > 0) s.thrust *= s.fuel / demand;
    const consumed = Math.min(s.fuel, demand);
    const midMass = mass - consumed / 2;
    const ax = s.thrust * axis[0] / midMass;
    const ay = s.thrust * axis[1] / midMass;
    const az = s.thrust * axis[2] / midMass - p.gravity;
    const old = {...s};
    s.x += s.vx * dt + ax * dt * dt / 2;
    s.y += s.vy * dt + ay * dt * dt / 2;
    s.altitude += s.vz * dt + az * dt * dt / 2;
    s.vx += ax * dt; s.vy += ay * dt; s.vz += az * dt;
    s.fuel -= consumed; s.time += dt; s.tick++;
    // Geometric contact probe approximation, measured relative to footpad height.
    const clearance = s.altitude - ground(s.x, s.y);
    s.contact = clearance <= 1.7;
    if (clearance <= 0) {
      const oldClearance = old.altitude - ground(old.x, old.y);
      const fraction = clamp(oldClearance / (oldClearance - clearance), 0, 1);
      s.time = old.time + dt * fraction;
      s.x = old.x + (s.x - old.x) * fraction;
      s.y = old.y + (s.y - old.y) * fraction;
      s.vx = old.vx + ax * dt * fraction;
      s.vy = old.vy + ay * dt * fraction;
      s.vz = old.vz + az * dt * fraction;
      s.fuel = old.fuel - consumed * fraction;
      s.altitude = ground(s.x, s.y);
      s.touchdown = {time: s.time, verticalSpeed: -s.vz, horizontalSpeed: Math.hypot(s.vx, s.vy), pitch: s.pitch, roll: s.roll, fuel: s.fuel, x: s.x, y: s.y};
      s.thrust = 0;
    }
  }
  return {state: s, parameters: p, events, input, step};
}
