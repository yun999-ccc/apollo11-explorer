// SPDX-License-Identifier: GPL-2.0-or-later
// Bus tests using the actual LMY99 ROM. These fixtures are not a mission state.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const binary = await readFile(process.argv[2] ?? new URL('../vendor/agc/yaAGC.wasm', import.meta.url));
const rom = await readFile(new URL('../assets/agc/Luminary099.bin', import.meta.url));

async function boot() {
  const memory = new WebAssembly.Memory({initial: 5});
  const {instance} = await WebAssembly.instantiate(binary, {
    env: {memory},
    wasi_snapshot_preview1: {
      fd_close: () => 8, fd_seek: () => 8, fd_fdstat_get: () => 8, fd_write: () => 8,
      fd_prestat_get: () => 8, fd_prestat_dir_name: () => 8,
      proc_exit: status => { throw new Error(`AGC runtime exited: ${status}`); }
    }
  });
  const cpu = instance.exports;
  const pointer = cpu.malloc(rom.length);
  new Uint8Array(memory.buffer).set(rom, pointer);
  cpu.set_fixed(pointer);
  cpu.free(pointer);
  cpu.cpu_reset();
  const erasable = new Uint16Array(memory.buffer, cpu.get_erasable_ptr(), 8 * 0o400);
  const events = [];
  function packet(channel, value) {
    assert(cpu.packet_write(channel, value) > 0);
  }
  function step(cycles) {
    for (let remaining = cycles; remaining > 0; remaining -= 1024) {
      cpu.cpu_step(Math.min(remaining, 1024));
      for (let word; (word = cpu.packet_read()) !== 0;) {
        events.push([word >>> 16, word & 0o77777]);
      }
    }
  }
  step(400_000);
  return {memory, erasable, events, packet, step, cpu};
}

const rod = await boot();
const rodCount = () => rod.erasable[7 * 0o400 + (0o1746 & 0o377)];
rod.packet(0x100 | 0o16, 0o140);
assert.equal(rodCount(), 0);
for (const [signal, expected] of [[0o40, 1], [0o40, 1], [0, 1], [0o100, 0o77777], [0, 0o77777], [0o100, 0o77776]]) {
  rod.packet(0o16, signal);
  rod.step(4000);
  assert.equal(rodCount(), expected, `RODCOUNT after channel 016 word ${signal.toString(8)}`);
}
console.log('ROD: LMY99 counted both directions, with no repeat while held or on release.');

function enterBankedRoutine({memory, erasable, cpu}, bank, address) {
  // Test fixture only. The original core layout before OutputChannel7 is
  // Erasable, Fixed, Parities, InputChannel (agc_engine.h).
  const channel7 = cpu.get_erasable_ptr() + 2 * (8 * 256 + 40 * 1024 + 512) + 4 * (40 * 32);
  new Uint16Array(memory.buffer, channel7, 1)[0] = 0;
  erasable[3] = 7 << 8;
  erasable[4] = bank << 10;
  erasable[5] = address;
  erasable[6] = (bank << 10) | 7;
}

const rate = await boot();
rate.packet(0x100 | 0o16, 0o140);
rate.packet(0o16, 0o40);
rate.step(4000);
const bank7 = rate.erasable.subarray(7 * 0o400);
assert.equal(bank7[0o346], 1); // RODCOUNT, from the ROM's interrupt handler
bank7[0o244] = 0;
bank7[0o245] = 0; // VDGVERT, zero in this isolated test
bank7[0o356] = 0o14370; // RODSCAL1, copied from RODSCALE in NASSP's PDI T-15m scenario
enterBankedRoutine(rate, 0o32, 0o3275); // RODCOMP, listing page 816
rate.step(13);
assert.equal(bank7[0o346], 0, 'RODCOMP must consume the click');
assert.deepEqual(Array.from(bank7.subarray(0o244, 0o246)), [0, 0o14370]);
console.log('P66 routine fixture: RODCOMP consumed the real interrupt count and changed VDGVERT.');

// Begin at the original FLATOUT entry (bank 31, address 2370, listing p. 796).
// The fixture selects the original routine but never writes a thrust word.
const thrust = await boot();
const {erasable, events, step} = thrust;
enterBankedRoutine(thrust, 0o31, 0o2370);
events.length = 0;
step(25);
assert.equal(erasable[0o55], 4096);
assert(!events.some(([channel]) => channel === 0o142), 'Output must wait for the enable bit');
step(10);
assert.deepEqual(events.filter(([channel]) => channel === 0o142), [[0o142, 4096]]);
assert.equal(erasable[0o55], 0, 'Output must consume the pulse word exactly once');
console.log('DPS: LMY99 wrote 4096 pulses, enabled the drive, then emitted one channel 0142 packet.');
