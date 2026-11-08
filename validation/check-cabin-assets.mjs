import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const dir = new URL('../landing/nassp/vc/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir)));
const panel = JSON.parse(await readFile(new URL('../controls/controls.json', dir)));
const compressed = await readFile(new URL(manifest.mesh.web, dir));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(compressed), manifest.mesh.webSha256);
const glb = gunzipSync(compressed);
assert.equal(glb.toString('ascii', 0, 4), 'glTF');
assert.equal(glb.readUInt32LE(4), 2);
assert.equal(glb.readUInt32LE(8), glb.length);
const length = glb.readUInt32LE(12);
const model = JSON.parse(glb.toString('utf8', 20, 20 + length));
const binary = glb.subarray(28 + length);

const groups = model.nodes.flatMap(node => node.extras.sourceGroups ?? [node.extras.sourceGroup]);
assert.deepEqual([...groups].sort((a, b) => a - b), Array.from({length: 686}, (_, i) => i));
let vertices = 0;
let triangles = 0;
for (const {primitives: [mesh]} of model.meshes) {
  const position = model.accessors[mesh.attributes.POSITION];
  const index = model.accessors[mesh.indices];
  const view = model.bufferViews[index.bufferView];
  const indices = new Uint32Array(binary.buffer, binary.byteOffset + view.byteOffset, index.count);
  assert(indices.every(i => i < position.count));
  assert(position.min.every((p, i) => Number.isFinite(p) && p <= position.max[i]));
  vertices += position.count;
  triangles += index.count / 3;
}
assert.equal(vertices, 468775);
assert.equal(triangles, 335729);

const byName = new Map(model.nodes.filter(n => n.extras.control).map(n => [n.extras.control.name, n]));
assert.equal(byName.size, 66);
for (const control of panel.controls) {
  const node = byName.get(control.id);
  assert.equal(node.extras.control.kind, control.kind);
  assert.equal(node.extras.sourceGroup, node.extras.control.group);
  if (control.kind === 'rotary' || control.kind === 'two' || control.kind === 'three') {
    assert.deepEqual(node.translation, node.extras.control.pivot);
    assert(Math.abs(Math.hypot(...node.extras.control.axis) - 1) < 1e-6);
  }
}
const keys = [...byName.values()].flatMap(n => n.extras.control.key ?? []);
assert.deepEqual(keys.sort(), [...'0123456789', '+', '−', 'VERB', 'NOUN', 'CLR', 'PRO', 'KEY REL', 'ENTR', 'RSET'].sort());

assert.equal(model.images.length, 34);
for (const entry of manifest.textures) {
  const image = model.images[entry.imageIndex];
  assert.equal(image.uri, undefined);
  assert.equal(image.mimeType, 'image/webp');
  const view = model.bufferViews[image.bufferView];
  const imageBytes = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  assert.equal(imageBytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(hash(imageBytes), entry.webSha256);
}
console.log('NASSP cabin verified: 686 unique source groups, 468775 vertices, 335729 triangles, 34 embedded textures, 47 panel controls and 19 DSKY keys.');
