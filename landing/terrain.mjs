// SPDX-License-Identifier: GPL-2.0-or-later
// Explicit schematic craters. Geometry and contact sampling use this same function.
export const CRATERS = [
  [260, -90, 90, 17], [550, 120, 125, 25], [860, -160, 160, 31],
  [125, 190, 40, 6], [90, -220, 60, 9], [-200, 90, 90, 14],
  [1100, 400, 220, 45], [450, -520, 180, 30], [1200, -600, 125, 20],
  [-500, -300, 180, 22], [700, 650, 130, 20]
];
export function groundHeight(x, y) {
  let height = 0;
  for (const [cx, cy, radius, depth] of CRATERS) {
    const distance = Math.hypot(x - cx, y - cy) / radius;
    if (distance < 1) height -= depth * (1 - distance * distance) ** 2;
    if (distance >= 0.85 && distance < 1.2) height += depth * 0.09 * Math.sin((distance - 0.85) / 0.35 * Math.PI) ** 2;
  }
  return height;
}
