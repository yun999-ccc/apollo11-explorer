// SPDX-License-Identifier: GPL-2.0-or-later
import * as THREE from 'three';
import {groundHeight} from './terrain.mjs';

export function createLunarView(element) {
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  element.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 9000);
  camera.up.set(0, 0, 1);
  const geometry = new THREE.PlaneGeometry(6000, 6000, 400, 400);
  const positions = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    const z = groundHeight(x, y);
    positions.setZ(i, z);
    const noise = (Math.sin(x * 0.23 + y * 0.91) * Math.sin(y * 0.13 - x * 0.17) + 1) * 0.035;
    const shade = 0.38 + noise + Math.max(-0.09, z * 0.001);
    colors.push(shade, shade * 0.98, shade * 0.93);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 256;
  const context = textureCanvas.getContext('2d');
  const image = context.createImageData(256, 256);
  let seed = 19690720;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 190 + (seed >>> 26);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(900, 900);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true, map: texture, roughness: 1})));
  scene.add(new THREE.HemisphereLight(0xbac6d0, 0x111111, 0.65));
  const sun = new THREE.DirectionalLight(0xfff5df, 3.2);
  sun.position.set(-900, -500, 350);
  scene.add(sun);
  const center = new THREE.Vector3(), forward = new THREE.Vector3();
  function resize() {
    const width = element.clientWidth, height = element.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(element);
  resize();
  return {
    render(state, lookDownDegrees = 28) {
      const pitch = state.pitch * Math.PI / 180;
      const angle = lookDownDegrees * Math.PI / 180 - pitch;
      camera.position.set(state.x, state.y, state.altitude + 2.5);
      forward.set(Math.cos(angle), 0, -Math.sin(angle));
      center.copy(camera.position).add(forward);
      camera.up.set(0, 0, 1);
      camera.lookAt(center);
      camera.rotateZ(-state.roll * Math.PI / 180);
      renderer.render(scene, camera);
    },
    get triangles() { return renderer.info.render.triangles; }
  };
}
