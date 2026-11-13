// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {groundHeight} from './terrain.mjs';
import {LROC_TERRAIN, measuredTerrainMesh} from './lroc-terrain.mjs';

// Source coordinates in metres. The descent-stage eye height includes the
// +1.75 m camera offset and subtracts the +0.99 m ascent-mesh translation.
const views = {
  panel: {eye: [0, 0.59, -1.29], yaw: 0, pitch: 0, fov: 89},
  all: {eye: [-0.45, 0.69, -1.25], yaw: 0, pitch: -7.95581, fov: 85},
  window: {eye: [-0.45, 0.69, -1.25], yaw: -33, pitch: -20, fov: 68},
  'right-window': {eye: [0.45, 0.69, -1.25], yaw: 33, pitch: -20, fov: 68},
  lpd: {eye: [-0.58, 0.61, -1.40], yaw: -6, pitch: -30, fov: 72},
  dsky: {eye: [0, 0.36, -1.20], yaw: 0, pitch: -48, fov: 34}
};
const rad = THREE.MathUtils.degToRad;
const axisPosition = new THREE.Vector3();
const regions = [
  {source: [309, 1520], size: [105, 176], output: [0, 0]},
  {source: [165, 1525], size: [102, 169], output: [112, 0]},
  {source: [348, 1025], size: [23, 23], output: [0, 184]},
  {source: [422, 1025], size: [23, 23], output: [24, 184]}
];

export async function loadCabinModel(signal, report) {
  const directory = new URL('nassp/vc/', import.meta.url);
  report('正在下载 NASSP 三维座舱和原始材质…');
  const response = await fetch(new URL('LM_VC.glb.gz?v=virtual-cabin-2', directory), {signal});
  if (!response.ok || !response.body) throw new Error('座舱文件下载失败（HTTP ' + response.status + '）');
  const total = Number(response.headers.get('Content-Length'));
  const size = bytes => (bytes / 1_000_000).toFixed(1) + ' MB';
  let received = 0;
  const meter = new TransformStream({transform(chunk, stream) {
    received += chunk.byteLength;
    report('正在下载三维座舱 · ' + size(received) + (total ? ' / ' + size(total) : ''));
    stream.enqueue(chunk);
  }});
  const unpacked = response.body.pipeThrough(meter).pipeThrough(new DecompressionStream('gzip'));
  const data = await new Response(unpacked).arrayBuffer();
  signal.throwIfAborted();
  report('已下载座舱，正在解码网格和原始材质…');
  return (await new GLTFLoader().parseAsync(data, directory.href)).scene;
}

function terrainGeometry(terrainId) {
  if (terrainId === LROC_TERRAIN) {
    const {vertices, indices} = measuredTerrainMesh();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const geometry = new THREE.PlaneGeometry(6000, 6000, 240, 240).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, groundHeight(-positions.getZ(i), positions.getX(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createLunarTerrain() {
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 groundMetres;
      varying vec3 groundNormal;
      void main() {
        groundMetres = position.xz;
        groundNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 groundMetres;
      varying vec3 groundNormal;
      float cellHash(vec2 cell) {
        vec3 p = fract(cell.xyx * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float grain(float metres) {
        vec2 p = groundMetres / metres;
        vec2 base = floor(p);
        vec2 f = smoothstep(0.0, 1.0, fract(p));
        float value = mix(mix(cellHash(base), cellHash(base + vec2(1, 0)), f.x),
                          mix(cellHash(base + vec2(0, 1)), cellHash(base + vec2(1, 1)), f.x), f.y);
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        return (value - 0.5) * (1.0 - smoothstep(0.25, 1.0, footprint));
      }
      void main() {
        // The craters come from groundHeight. Grain only modulates reflectance.
        float albedo = 0.34 + 0.16 * grain(15.0) + 0.12 * grain(3.5)
                     + 0.10 * grain(0.8) + 0.08 * grain(0.18);
        float sun = max(0.0, dot(normalize(groundNormal), normalize(vec3(-0.85, 0.19, 0.49))));
        gl_FragColor = vec4(vec3(1.0, 0.985, 0.95) * albedo * (0.055 + 0.92 * sun), 1.0);
        #include <colorspace_fragment>
      }`
  });
  return new THREE.Mesh(terrainGeometry(LROC_TERRAIN), material);
}

function lightCabin(scene, model, renderer) {
  // Keep the original maps and transparency. The soft key models cabin fill;
  // the etched reticle keeps its independent luminance against the terrain.
  const anisotropy = THREE.MathUtils.clamp(renderer.capabilities.getMaxAnisotropy(), 1, 8);
  const materials = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material;
    if (original.map) original.map.anisotropy = anisotropy;
    if (mesh.userData.landingReticle || original.transparent) return;
    if (!materials.has(original)) {
      const material = new THREE.MeshLambertMaterial({
        color: original.color, map: original.map, side: original.side,
        alphaTest: original.alphaTest, opacity: original.opacity
      });
      material.userData = original.userData;
      materials.set(original, material);
    }
    mesh.material = materials.get(original);
  });
  const ambient = new THREE.AmbientLight(0xffffff, 1.75);
  const key = new THREE.DirectionalLight(0xfff3de, 1.05);
  key.position.set(-1, 2, 1.7);
  scene.add(ambient, key);
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
        'outgoingLight = mix(outgoingLight, ink.rgb, ink.a); } }'
        ].join('\n');
      });
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        lines.join('\n') + '\n#include <opaque_fragment>');
    };
    material.needsUpdate = true;
  });
  if (!patched.size) throw new Error('找不到 NASSP 主面板材质');
  return {context, changed() { overlay.needsUpdate = true; }};
}

export function createCabinScene(container, model) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true});
  } catch (error) {
    throw new Error('无法启动 WebGL，请检查浏览器的硬件加速设置', {cause: error});
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = 'native-panel';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'NASSP 三维驾驶舱。左键拖动或用方向键转头，点击实体控件。');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.add(model);
  lightCabin(scene, model, renderer);
  const exterior = new THREE.Group();
  const ground = createLunarTerrain();
  let terrainId = LROC_TERRAIN;
  exterior.add(ground);
  scene.add(exterior);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.007, 8500);
  const comparisonCameras = [new THREE.PerspectiveCamera(68, 1, 0.007, 8500),
    new THREE.PerspectiveCamera(68, 1, 0.007, 8500)];
  const direction = new THREE.Vector3(), target = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const controls = new Map();
  const blockers = [];
  const clickableMeshes = [];
  let reticle, yaw = 0, pitch = 0, view, scheduled = false, tick = null;
  let nominalFov = 65;
  let width = 0, height = 0;
  let panelFrame;
  let renderedViews = [];
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

  const viewStatus = document.createElement('p');
  viewStatus.className = 'cabin-render-status';
  viewStatus.setAttribute('role', 'status');
  viewStatus.hidden = true;
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    viewStatus.textContent = '三维画面连接已中断，正在等待浏览器恢复。';
    viewStatus.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    viewStatus.hidden = true;
    requestDraw();
  });

  function renderViews() {
    renderer.setScissorTest(true);
    for (const {camera: viewCamera, frame} of renderedViews) {
      const [x, y, w, h] = frame;
      renderer.setViewport(x, height - y - h, w, h);
      renderer.setScissor(x, height - y - h, w, h);
      renderer.render(scene, viewCamera);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }

  function requestDraw() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!width || !height || !viewStatus.hidden) return;
      if (renderedViews.length) renderViews();
      else renderer.render(scene, camera);
    });
  }
  function pointCamera(activeCamera, horizontal, vertical) {
    const h = rad(horizontal), v = rad(vertical);
    direction.set(Math.sin(h) * Math.cos(v), Math.sin(v), -Math.cos(h) * Math.cos(v));
    activeCamera.lookAt(target.copy(activeCamera.position).add(direction));
    activeCamera.updateMatrixWorld();
  }
  function orient() {
    pointCamera(camera, yaw, pitch);
    canvas.dataset.view = view;
    canvas.dataset.eye = camera.position.toArray().join(',');
    canvas.dataset.yaw = String(yaw);
    canvas.dataset.pitch = String(pitch);
    requestDraw();
  }
  function updateFov(activeCamera = camera, fov = nominalFov) {
    const minimumAspect = activeCamera === camera && view === 'panel' ? 1.35 : 1.1;
    const narrowScale = Math.max(1, minimumAspect / activeCamera.aspect);
    activeCamera.fov = Math.min(115, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(rad(fov) / 2) * narrowScale)));
    activeCamera.updateProjectionMatrix();
  }

  function layoutViews() {
    if (!width || !height) return;
    const panelStacked = width < 900;
    const dualStacked = width < 700;
    const halfWidth = Math.floor(width / 2);
    let windowFrames = [];
    panelFrame = [0, 0, width, height];
    if (view === 'panel') {
      if (panelStacked) {
        const panelHeight = Math.round(height * 2 / 3);
        panelFrame = [0, 0, width, panelHeight];
        windowFrames = [[0, panelHeight, halfWidth, height - panelHeight],
          [halfWidth, panelHeight, width - halfWidth, height - panelHeight]];
      } else {
        const side = Math.floor(width / 4);
        panelFrame = [side, 0, width - 2 * side, height];
        windowFrames = [[0, 0, side, height], [width - side, 0, side, height]];
      }
    } else if (view === 'dual-window') {
      const halfHeight = Math.ceil(height / 2);
      windowFrames = dualStacked
        ? [[0, 0, width, halfHeight], [0, halfHeight, width, height - halfHeight]]
        : [[0, 0, halfWidth, height], [halfWidth, 0, width - halfWidth, height]];
    }
    container.classList.toggle('is-panel-stacked', panelStacked);
    container.classList.toggle('is-window-stacked', dualStacked);
    camera.aspect = panelFrame[2] / panelFrame[3];
    updateFov();
    renderedViews = windowFrames.map((frame, index) => {
      const preset = views[index === 0 ? 'window' : 'right-window'];
      const windowCamera = comparisonCameras[index];
      windowCamera.aspect = frame[2] / frame[3];
      windowCamera.position.fromArray(preset.eye);
      if (view === 'panel') {
        windowCamera.fov = 65;
        windowCamera.updateProjectionMatrix();
      } else updateFov(windowCamera, preset.fov);
      pointCamera(windowCamera, preset.yaw, preset.pitch);
      return {camera: windowCamera, frame};
    });
    if (view === 'panel') renderedViews.push({camera, frame: panelFrame});
  }

  function pointerInPanel(x, y) {
    if (!panelFrame || view === 'dual-window') return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const [left, top, w, h] = panelFrame;
    const localX = (x - rect.left) * width / rect.width - left;
    const localY = (y - rect.top) * height / rect.height - top;
    if (localX < 0 || localX >= w || localY < 0 || localY >= h) return false;
    pointer.set(2 * localX / w - 1, 1 - 2 * localY / h);
    return true;
  }

  function setView(name) {
    if (!views[name] && name !== 'dual-window') return;
    container.classList.toggle('is-panel-overview', name === 'panel');
    container.parentElement.classList.toggle('is-panel-overview', name === 'panel');
    container.classList.toggle('is-window-comparison', name === 'dual-window');
    view = name;
    if (name === 'dual-window') {
      canvas.dataset.view = name;
      if (reticle) reticle.visible = false;
      resize();
      return;
    }
    const preset = views[name];
    camera.position.fromArray(preset.eye);
    yaw = preset.yaw;
    pitch = preset.pitch;
    nominalFov = preset.fov;
    if (reticle) reticle.visible = name === 'lpd';
    resize();
    orient();
  }
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    renderer.setViewport(0, 0, width, height);
    layoutViews();
    requestDraw();
  }
  new ResizeObserver(resize).observe(container);
  setView('panel');

  return {
    canvas, viewStatus, atlas, requestDraw, setView, pointerInPanel,
    rotate(dx, dy) {
      if (view === 'dual-window') return;
      yaw = (yaw + dx * 0.25) % 360;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.25, -89, 89);
      orient();
    },
    zoom(delta) {
      if (view === 'dual-window') return;
      nominalFov = THREE.MathUtils.clamp(nominalFov * Math.exp(delta * 0.001), 20, 105);
      updateFov();
      requestDraw();
    },
    pick(x, y, hoverOnly = false) {
      if (!pointerInPanel(x, y)) return null;
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
      if (state.terrain !== terrainId) {
        terrainId = state.terrain;
        const old = ground.geometry;
        ground.geometry = terrainGeometry(terrainId);
        old.dispose();
        tick = null;
      }
      if (state.tick === tick && state.x === ground.position.z && -state.y === ground.position.x &&
          -state.altitude - 1.8 === ground.position.y) return;
      tick = state.tick;
      ground.position.set(-state.y, -state.altitude - 1.8, state.x);
      exterior.rotation.set(rad(state.pitch), 0, rad(-state.roll), 'YXZ');
      requestDraw();
    },
    snapshot() {
      return {view, eye: camera.position.toArray(), yaw, pitch, fov: camera.fov,
        triangles: renderer.info.render.triangles, controls: controls.size, tick,
        comparison: renderedViews.length ? comparisonCameras.map(cam => cam.position.toArray()) : null};
    },
    controlSourceLine(name) {
      return controls.get(name)?.control.line;
    }
  };
}
