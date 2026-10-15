import * as THREE from 'three';
import { createComparison, DURATION, stepComparison, summarize } from './comparison.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#182332');
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 3));
const grid = new THREE.GridHelper(32, 32);
scene.add(grid);
const actor = color => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.6), new THREE.MeshStandardMaterial({ color }));
  scene.add(mesh); return mesh;
};
const player = actor('#3cb8ff'), opponent = actor('#ff8840');
const renderers = ['before', 'after'].map(id => {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(id), antialias: true });
  renderer.setSize(640, 360, false); return renderer;
});
const report = document.getElementById('report');
const combined = document.createElement('canvas');
combined.width = 1280; combined.height = 360;
const combinedContext = combined.getContext('2d');
const recordingButton = document.getElementById('record');
const download = document.getElementById('download');
const playback = document.getElementById('playback');
let recorder, stream, videoUrl;
let state, start, handle;
function replay() {
  if (recorder?.state === 'recording') recorder.stop();
  cancelAnimationFrame(handle); state?.feedback.dispose();
  state = createComparison({ reducedMotion: document.getElementById('reduced').checked });
  start = null; handle = requestAnimationFrame(frame);
}
function frame(now) {
  start ??= now;
  const time = Math.min(DURATION, (now - start) / 1000);
  const result = stepComparison(state, time);
  player.position.copy(result.player).y = 0.85;
  opponent.position.copy(result.player).add(new THREE.Vector3(0, 0.85, 1.5));
  renderers[0].render(scene, state.before); renderers[1].render(scene, state.after);
  report.textContent = JSON.stringify(summarize(state), null, 2);
  document.getElementById('seek').value = time;
  if (recorder?.state === 'recording') {
    combinedContext.drawImage(renderers[0].domElement, 0, 0);
    combinedContext.drawImage(renderers[1].domElement, 640, 0);
  }
  if (time < DURATION) handle = requestAnimationFrame(frame);
  else if (recorder?.state === 'recording') recorder.stop();
}
recordingButton.disabled = !globalThis.MediaRecorder || !combined.captureStream;
recordingButton.onclick = () => {
  replay();
  stream = combined.captureStream(30);
  recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop());
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    download.href = videoUrl; download.download = 'arena-camera-comparison.webm';
    download.hidden = false; recordingButton.disabled = false;
    playback.src = videoUrl; playback.hidden = false;
  };
  recorder.start(); recordingButton.disabled = true;
};
document.getElementById('seek').oninput = event => {
  cancelAnimationFrame(handle);
  if (recorder?.state === 'recording') recorder.stop();
  state.feedback.dispose();
  state = createComparison({ reducedMotion: document.getElementById('reduced').checked });
  const time = Number(event.target.value);
  for (let i = 0; i < Math.ceil(time * 60); i++) stepComparison(state, i / 60);
  start = 0; frame(time * 1000); cancelAnimationFrame(handle);
};
document.getElementById('replay').onclick = replay;
document.getElementById('reduced').onchange = replay;
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(handle); state.feedback.dispose();
  if (recorder?.state === 'recording') recorder.stop();
  stream?.getTracks().forEach(track => track.stop());
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  for (const renderer of renderers) renderer.dispose();
  grid.geometry.dispose(); grid.material.dispose();
  for (const actor of [player, opponent]) { actor.geometry.dispose(); actor.material.dispose(); }
}, { once: true });
replay();
