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
let capture, captureStream;
const recordButton = document.getElementById('record');
const status = document.getElementById('capture-status');
const captureCanvas = document.createElement('canvas');
captureCanvas.width = 1280; captureCanvas.height = 480;
const context = captureCanvas.getContext('2d');
const mimeType = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
  .find(type => globalThis.MediaRecorder?.isTypeSupported(type));
recordButton.disabled = !mimeType || !captureCanvas.captureStream;
status.textContent = mimeType ? ` Ready: ${mimeType}` : ' Recording unavailable';
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
function composeCapture(stage, elapsed) {
  context.fillStyle = '#111b27'; context.fillRect(0, 0, 1280, 480);
  context.fillStyle = '#e9f3ff'; context.font = 'bold 20px sans-serif';
  context.fillText('CONTROL: no skill | source 5878ca7', 18, 28);
  context.fillText('TREATMENT: skill afa1de1 | source 5878ca7', 658, 28);
  context.font = '16px sans-serif'; context.fillText('Independent generated modules | same actors, world trace and time | one pair', 18, 51);
  renderers.forEach((renderer, i) => context.drawImage(renderer.domElement, i * 640, 60));
  context.fillStyle = '#e9f3ff'; context.font = 'bold 19px sans-serif';
  context.fillText(stage, 18, 445);
  context.font = '15px sans-serif';
  context.fillText(`Elapsed ${elapsed.toFixed(2)}s | Blue: player, orange: target | not a comfort score or full game trial`, 18, 470);
}
recordButton.onclick = () => {
  reset(); let recordingStart, phase = -1;
  const chunks = [];
  const controls = ['replay', 'reduced', 'seek'];
  recordButton.disabled = true; controls.forEach(id => { document.getElementById(id).disabled = true; });
  captureStream = captureCanvas.captureStream(30);
  capture = new MediaRecorder(captureStream, { mimeType, videoBitsPerSecond: 2500000 });
  capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  capture.onstop = async () => {
    captureStream.getTracks().forEach(track => track.stop());
    status.textContent = ' Saving actual canvas recording...';
    try {
      const blob = new Blob(chunks, { type: capture.mimeType });
      const result = await fetch('/__capture', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      if (!result.ok) throw new Error('Local save failed');
      const saved = await result.json(); status.textContent = ` Saved ${saved.filename} (${saved.size} bytes)`;
    } catch (error) { status.textContent = ` ${error.message}`; }
    recordButton.disabled = false; controls.forEach(id => { document.getElementById(id).disabled = false; });
  };
  capture.start();
  function recordFrame(now) {
    recordingStart ??= now; const elapsed = Math.min(18, (now - recordingStart) / 1000);
    const nextPhase = elapsed < 8 ? 0 : elapsed < 10 ? 1 : 2;
    if (phase !== nextPhase) {
      takes.forEach(t => t.controller.dispose());
      takes = Object.values(factories).map(factory => createTake(factory, nextPhase === 2));
      if (nextPhase === 1) {
        for (let i = 0; i <= 183; i++) takes.forEach(t => step(t, i / 60));
        takes.forEach(t => t.controller.pause());
      }
      phase = nextPhase;
    }
    const time = phase === 0 ? elapsed : phase === 1 ? 3.05 : elapsed - 10;
    render(time);
    const stage = phase === 0 ? '1 / Shared movement and confirmed impacts at t=3,6'
      : phase === 1 ? `2 / Pause at t=3.05: control FOV ${takes[0].camera.fov.toFixed(4)} frozen; treatment ${takes[1].camera.fov.toFixed(4)} clears`
        : '3 / Reduced motion: same trace, optional impact cues suppressed';
    composeCapture(stage, elapsed);
    status.textContent = ` Recording ${elapsed.toFixed(1)} / 18s`;
    if (elapsed < 18) handle = requestAnimationFrame(recordFrame); else capture.stop();
  }
  handle = requestAnimationFrame(recordFrame);
};
document.getElementById('replay').onclick = replay;
document.getElementById('reduced').onchange = replay;
document.getElementById('seek').oninput = event => {
  const time = Number(event.target.value); reset();
  for (let frame = 0; frame < Math.ceil(time * 60); frame++) takes.forEach(t => step(t, frame / 60));
  render(time);
};
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(handle); takes.forEach(t => t.controller.dispose());
  if (capture?.state === 'recording') capture.stop();
  captureStream?.getTracks().forEach(track => track.stop());
  renderers.forEach(r => r.dispose()); grid.geometry.dispose(); grid.material.dispose();
  [player, target].forEach(a => { a.geometry.dispose(); a.material.dispose(); });
}, { once: true });
replay();
