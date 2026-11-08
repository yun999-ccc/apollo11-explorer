// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {groundHeight} from './terrain.mjs';

// Source coordinates in metres. The descent-stage eye height includes the
// +1.75 m camera offset and subtracts the +0.99 m ascent-mesh translation.
const views = {
  panel: {eye: [0, 0.53, -1.12], yaw: 0, pitch: 3, fov: 66},
  all: {eye: [-0.45, 0.69, -1.25], yaw: 0, pitch: -7.95581, fov: 85},
  window: {eye: [-0.45, 0.69, -1.25], yaw: -29, pitch: -15, fov: 65},
  lpd: {eye: [-0.58, 0.61, -1.40], yaw: 0, pitch: -30, fov: 60},
  dsky: {eye: [0, 0.36, -1.20], yaw: 0, pitch: -48, fov: 38}
};
const rad = THREE.MathUtils.degToRad;
const axisPosition = new THREE.Vector3();
const regions = [
  {source: [309, 1520], size: [105, 176], output: [0, 0]},
  {source: [165, 1525], size: [102, 169], output: [112, 0]},
  {source: [348, 1025], size: [23, 23], output: [0, 184]},
  {source: [422, 1025], size: [23, 23], output: [24, 184]}
];

async function loadModel() {
  const directory = new URL('nassp/vc/', import.meta.url);
  const response = await fetch(new URL('LM_VC.glb.gz?v=virtual-cabin-2', directory));
  if (!response.ok || !response.body) throw new Error('座舱网格下载失败');
  const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return (await new GLTFLoader().parseAsync(data, directory.href)).scene;
}

function createLunarTerrain() {
  const geometry = new THREE.PlaneGeometry(6000, 6000, 240, 240).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = -positions.getZ(i), y = positions.getX(i), z = groundHeight(x, y);
    positions.setY(i, z);
    const noise = (Math.sin(x * 0.23 + y * 0.91) * Math.sin(y * 0.13 - x * 0.17) + 1) * 0.035;
    const shade = 0.18 + noise + Math.max(-0.06, z * 0.001);
    colors.push(shade, shade * 0.98, shade * 0.93);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({vertexColors: true}));
}

function createPanelAtlas(model) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const overlay = new THREE.CanvasTexture(canvas);
  overlay.colorSpace = THREE.SRGBColorSpace;
  overlay.flipY = false;
  overlay.generateMipmaps = false;
  overlay.minFilter = THREE.LinearFilter;
  const patched = new Set();
  const vector = values => 'vec2(' + values.map(value => value.toFixed(1)).join(', ') + ')';
  model.traverse(mesh => {
    const material = mesh.material;
    if (material?.userData.sourceTexture !== 4 || patched.has(material)) return;
    patched.add(material);
    material.onBeforeCompile = shader => {
      shader.uniforms.vcOverlay = {value: overlay};
      shader.fragmentShader = 'uniform sampler2D vcOverlay;\n' + shader.fragmentShader;
      const lines = regions.map(region => {
        const [origin, size, output] = [region.source, region.size, region.output].map(vector);
        return [
          '{ vec2 pixel = vMapUv * 2048.0 - ' + origin + ';',
          'if (all(greaterThanEqual(pixel, vec2(0.0))) && all(lessThan(pixel, ' + size + '))) {',
          'vec4 ink = texture2D(vcOverlay, (pixel + ' + output + ') / 256.0);',
          'diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb, ink.a); } }'
        ].join('\n');
      });
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n' + lines.join('\n'));
    };
    material.needsUpdate = true;
  });
  if (!patched.size) throw new Error('找不到 NASSP 主面板材质');
  return {context, changed() { overlay.needsUpdate = true; }};
}

export async function createCabinScene(container) {
  const model = await loadModel();
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = 'native-panel';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'NASSP 三维驾驶舱。左键拖动或用方向键转头，点击实体控件。');
  container.replaceChildren(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.add(model);
  const exterior = new THREE.Group();
  const ground = createLunarTerrain();
  exterior.add(ground);
  scene.add(exterior);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.007, 8500);
  const direction = new THREE.Vector3(), target = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const controls = new Map();
  const blockers = [];
  const clickableMeshes = [];
  let reticle, yaw = 0, pitch = 0, view, scheduled = false, tick = null;
  let nominalFov = 65;
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.material.userData.sourceTexture && !mesh.material.map) {
      throw new Error('原始座舱材质未能解码');
    }
    if (mesh.userData.optionalSight) mesh.visible = false;
    if (mesh.userData.landingReticle) reticle = mesh;
    if (mesh.userData.control) {
      const control = mesh.userData.control;
      controls.set(control.name, {mesh, control, rest: mesh.position.clone()});
      clickableMeshes.push(mesh);
    }
    if (mesh.visible && !mesh.material.transparent && !mesh.userData.landingReticle) blockers.push(mesh);
  });
  if (controls.size !== 66) throw new Error('座舱网格缺少原始控件组');
  model.updateMatrixWorld(true);
  const atlas = createPanelAtlas(model);
  const selection = new THREE.Box3Helper(new THREE.Box3(), 0xf5ca68);
  selection.visible = false;
  scene.add(selection);

  function requestDraw() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderer.render(scene, camera);
    });
  }
  function orient() {
    const h = rad(yaw), v = rad(pitch);
    direction.set(Math.sin(h) * Math.cos(v), Math.sin(v), -Math.cos(h) * Math.cos(v));
    camera.lookAt(target.copy(camera.position).add(direction));
    camera.updateMatrixWorld();
    canvas.dataset.view = view;
    canvas.dataset.eye = camera.position.toArray().join(',');
    canvas.dataset.yaw = String(yaw);
    canvas.dataset.pitch = String(pitch);
    requestDraw();
  }
  function updateFov() {
    const narrowScale = Math.max(1, 1.1 / camera.aspect);
    camera.fov = Math.min(115, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(rad(nominalFov) / 2) * narrowScale)));
    camera.updateProjectionMatrix();
  }
  function setView(name) {
    const preset = views[name];
    if (!preset) return;
    view = name;
    camera.position.fromArray(preset.eye);
    yaw = preset.yaw;
    pitch = preset.pitch;
    nominalFov = preset.fov;
    updateFov();
    if (reticle) reticle.visible = name === 'lpd';
    orient();
  }
  function resize() {
    const {clientWidth: width, clientHeight: height} = container;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    updateFov();
    requestDraw();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  setView('panel');

  return {
    canvas, atlas, requestDraw, setView,
    rotate(dx, dy) {
      yaw = (yaw + dx * 0.25) % 360;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.25, -89, 89);
      orient();
    },
    zoom(delta) {
      nominalFov = THREE.MathUtils.clamp(nominalFov * Math.exp(delta * 0.001), 20, 105);
      updateFov();
      requestDraw();
    },
    pick(x, y, hoverOnly = false) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((x - rect.left) * 2 / rect.width - 1, 1 - (y - rect.top) * 2 / rect.height);
      if (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1) return null;
      ray.setFromCamera(pointer, camera);
      if (hoverOnly && !ray.intersectObjects(clickableMeshes, false).length) return null;
      const hit = ray.intersectObjects(blockers, false)[0];
      const data = hit?.object.userData.control;
      if (!data) return null;
      hit.object.getWorldPosition(axisPosition).project(camera);
      return {data, direction: data.kind === 'rotary'
        ? (pointer.x >= axisPosition.x ? 1 : -1)
        : (pointer.y >= axisPosition.y ? 1 : -1)};
    },
    select(name, enabled) {
      const item = controls.get(name);
      selection.visible = Boolean(item && enabled);
      if (selection.visible) selection.box.setFromObject(item.mesh).expandByScalar(0.002);
      requestDraw();
    },
    positionControl(name, value, angles) {
      const item = controls.get(name);
      if (!item?.control.axis) return;
      const {mesh, control} = item;
      const degrees = control.kind === 'rotary' ? angles[value]
        : control.kind === 'three' ? (value - 1) * 22.5 : (value - 0.5) * 45;
      mesh.quaternion.setFromAxisAngle(axisPosition.fromArray(control.axis), rad(degrees));
      mesh.updateMatrixWorld();
      requestDraw();
    },
    pressKey(name, pressed) {
      const item = controls.get(name);
      if (!item) return;
      // P4_PB_VECT from lemvc.cpp in reflected mesh coordinates.
      item.mesh.position.copy(item.rest);
      if (pressed) item.mesh.position.addScaledVector(axisPosition.set(0, -Math.sin(rad(45.0663)), -Math.cos(rad(45.0663))), 0.001);
      item.mesh.updateMatrixWorld();
      requestDraw();
    },
    setFlight(state) {
      if (state.tick === tick) return;
      tick = state.tick;
      ground.position.set(-state.y, -state.altitude - 1.8, state.x);
      exterior.rotation.set(rad(state.pitch), 0, rad(-state.roll), 'YXZ');
      requestDraw();
    },
    snapshot() {
      return {view, eye: camera.position.toArray(), yaw, pitch, fov: camera.fov,
        triangles: renderer.info.render.triangles, controls: controls.size};
    },
    controlSourceLine(name) {
      return controls.get(name)?.control.line;
    }
  };
}
