// SPDX-License-Identifier: GPL-2.0-or-later
import {grid, elevationCentimetres} from './assets/tranquility-elevation.mjs';

export const LROC_TERRAIN = 'lroc-apollo11-8m-v1';
export const SCHEMATIC_TERRAIN = 'schematic-v1';
const {lowX, highX, lowY, highY, step} = grid;
const columns = (highX - lowX) / step + 1;
const rows = (highY - lowY) / step + 1;
const bytes = Uint8Array.from(atob(elevationCentimetres), character => character.charCodeAt(0));
const heights = new DataView(bytes.buffer);
const heightAt = (ix, iy) => heights.getInt16(2 * (iy * columns + ix), true) / 100;

export function tranquilityHeight(x, y) {
  if (x <= lowX || x >= highX || y <= lowY || y >= highY) return 0;
  const u = (x - lowX) / step, v = (y - lowY) / step;
  const i = Math.floor(u), j = Math.floor(v);
  const du = u - i, dv = v - j;
  const northwest = heightAt(i, j), forward = heightAt(i + 1, j), right = heightAt(i, j + 1);
  if (du + dv <= 1) return northwest + (forward - northwest) * du + (right - northwest) * dv;
  const opposite = heightAt(i + 1, j + 1);
  return opposite + (right - opposite) * (1 - du) + (forward - opposite) * (1 - dv);
}

export function measuredTerrainMesh() {
  const x = [-3000, ...Array.from({length: columns}, (_, i) => lowX + i * step), 3000];
  const y = [-3000, ...Array.from({length: rows}, (_, j) => lowY + j * step), 3000];
  const vertices = [], indices = [];
  for (const north of y) {
    for (const west of x) vertices.push(north, tranquilityHeight(west, north), -west);
  }
  for (let j = 0; j < y.length - 1; j++) {
    for (let i = 0; i < x.length - 1; i++) {
      const a = j * x.length + i, b = a + 1, c = a + x.length, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {vertices, indices};
}
