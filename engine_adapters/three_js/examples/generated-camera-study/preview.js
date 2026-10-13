import * as THREE from 'three';
import { factories, createTake, step } from './evaluate.js';
import { playerAt } from '../game-feel-comparison/comparison.js';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#182332');
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 3));
const grid = new THREE.GridHelper(32, 32); scene.add(grid);
const actor = color => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.6), new THREE.MeshStandardMaterial({ color }));
  scene.add(mesh); return mesh;
};
const player = actor('#3cb8ff'), target = actor('#ff8840');
const renderers = Object.keys(factories).map(id => {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(id), antialias: true });
  renderer.setSize(640, 360, false); return renderer;
});
let takes = [], handle, start;
function reset() {
  cancelAnimationFrame(handle); takes.forEach(t => t.controller.dispose());
  takes = Object.values(factories).map(factory => createTake(factory, document.getElementById('reduced').checked));
  start = null;
}
function render(time) {
  player.position.copy(playerAt(time)); player.position.y = 0.85;
  target.position.copy(player.position).add(new THREE.Vector3(0, 0, 3));
  takes.forEach((take, i) => { step(take, time); renderers[i].render(scene, take.camera); });
  document.getElementById('seek').value = time;
  document.getElementById('report').textContent = JSON.stringify({ time,
    control: takes[0].samples.at(-1), treatment: takes[1].samples.at(-1) }, null, 2);
}
function frame(now) {
  start ??= now; const time = Math.min(8, (now - start) / 1000);
  render(time); if (time < 8) handle = requestAnimationFrame(frame);
}
function replay() { reset(); handle = requestAnimationFrame(frame); }
document.getElementById('replay').onclick = replay;
document.getElementById('reduced').onchange = replay;
document.getElementById('seek').oninput = event => {
  const time = Number(event.target.value); reset();
  for (let frame = 0; frame < Math.ceil(time * 60); frame++) takes.forEach(t => step(t, frame / 60));
  render(time);
};
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(handle); takes.forEach(t => t.controller.dispose());
  renderers.forEach(r => r.dispose()); grid.geometry.dispose(); grid.material.dispose();
  [player, target].forEach(a => { a.geometry.dispose(); a.material.dispose(); });
}, { once: true });
replay();
