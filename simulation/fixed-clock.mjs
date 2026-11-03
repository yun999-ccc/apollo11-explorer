// Based on the fixed-step accumulator workflow in threejs-gameplay-systems.
// Independent of the renderer, AGC and flight model. Time is measured in seconds.
export function createFixedClock(step, { timestep = 1 / 60, maxFrame = 0.1 } = {}) {
  if (typeof step !== 'function' || !Number.isFinite(timestep) || timestep <= 0 ||
      !Number.isFinite(maxFrame) || maxFrame < timestep) {
    throw new TypeError('Invalid fixed clock configuration');
  }

  let accumulator = 0;
  let tick = 0;
  let discardedSeconds = 0;
  let paused = false;

  return {
    advance(elapsedSeconds) {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
        throw new RangeError('Elapsed time must be finite and nonnegative');
      }
      if (paused) return 0;

      const accepted = Math.min(elapsedSeconds, maxFrame);
      discardedSeconds += elapsedSeconds - accepted;
      accumulator += accepted;
      let steps = 0;
      while (accumulator + timestep * 1e-9 >= timestep) {
        step({ tick, time: tick * timestep, dt: timestep });
        accumulator = Math.max(0, accumulator - timestep);
        tick++;
        steps++;
      }
      return steps;
    },
    pause() { paused = true; },
    resume() { paused = false; },
    get tick() { return tick; },
    get time() { return tick * timestep; },
    get interpolation() { return accumulator / timestep; },
    get discardedSeconds() { return discardedSeconds; }
  };
}
