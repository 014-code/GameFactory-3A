import * as THREE from 'three';
import { A3GameFeedback, A3GameActionCameraDirector } from '@a3game/playable';
import { encounterAt, BossEncounter, IMPACTS, DURATION } from './encounter.js';
import { createBossScene } from './scene.js';
import { createImpactAudio } from './impact-audio.js';

const world = createBossScene();
const base = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);
base.position.set(0, 2, 8); base.lookAt(0, 1.2, 0); base.updateMatrixWorld(true);
const updated = base.clone();
const renderers = ['base', 'updated'].map(id => {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(id), antialias: true });
  renderer.setSize(640, 360, false); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping;
  return renderer;
});
const feedback = new A3GameFeedback({ haptics: false });
const audio = createImpactAudio();
const director = new A3GameActionCameraDirector(updated);
const status = document.getElementById('status'), keys = new Set();
const reduced = document.getElementById('reduced'); reduced.checked = feedback.reducedMotion;
let time = 0, previous = null, handle, paused = false, live = false, mechanic = new BossEncounter();
let recording = false, recorder, stream, recordingStart, recordingPhase = -1, captureComplete = false;
const revision = /^[0-9a-f]{7,40}$/.test(new URLSearchParams(location.search).get('revision') ?? '')
  ? new URLSearchParams(location.search).get('revision').slice(0, 7) : 'local';
const combined = document.createElement('canvas'); combined.width = 1280; combined.height = 480;
const ctx = combined.getContext('2d');
const mime = ['video/mp4', 'video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9']
  .find(type => globalThis.MediaRecorder?.isTypeSupported(type));
document.getElementById('record').disabled = !mime;

function render(state, dt, { cut = false, reducedMotion = reduced.checked, enabled = document.getElementById('feedback').checked } = {}) {
  const confirmed = live ? state.impact : IMPACTS.some(t => time - dt < t && time >= t);
  if (confirmed) feedback.trigger({ strength: 0.075, duration: 0.22, fovKick: 1.2 });
  if (confirmed && document.getElementById('sound').checked) audio.hit();
  director.update(dt, state.player, state.target, { mode: state.mode, cut, reducedMotion, ...feedback.update(dt) });
  world.update(state, reducedMotion || !enabled);
  [base, updated].forEach((camera, i) => renderers[i].render(world.scene, camera));
  for (const id of ['base', 'updated']) {
    document.getElementById(`hp-${id}`).style.width = `${state.health * 100}%`;
    document.getElementById(`hit-${id}`).style.opacity = state.impactAge >= 0 && state.impactAge < 0.65 ? '1' : '0';
  }
  status.textContent = `${time.toFixed(2)}s · ${state.mode.toUpperCase()} · ${state.label}${reducedMotion ? ' · Reduced motion' : ''}`;
  document.getElementById('seek').value = time;
  if (recording) {
    ctx.fillStyle = '#101827'; ctx.fillRect(0, 0, 1280, 480);
    ctx.fillStyle = '#edf4ff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText('BASE: static camera | reconstructed main 41445aa', 16, 29);
    ctx.fillText(`UPDATED: action director | PR78 ${revision}`, 654, 29);
    ctx.font = '16px sans-serif'; ctx.fillText('Same original actors, combat state and effects in both views · authored runtime comparison', 16, 52);
    renderers.forEach((r, i) => ctx.drawImage(r.domElement, i * 640, 60));
    ctx.fillStyle = '#dba764'; ctx.fillRect(350, 72, state.health * 250, 5); ctx.fillRect(990, 72, state.health * 250, 5);
    if (state.impactAge >= 0 && state.impactAge < 0.65) {
      ctx.fillStyle = '#ffe294'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('120 HIT', 345, 245); ctx.fillText('120 HIT', 985, 245);
    }
    ctx.fillStyle = '#edf4ff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(state.label, 16, 447);
    ctx.font = '16px sans-serif'; ctx.fillText(`${time.toFixed(2)}s · ${reducedMotion ? 'REDUCED MOTION' : 'ACTION SHOTS'} · No copied assets / no Tripo API / not a complete AAA game`, 16, 472);
  }
}
function reset() {
  time = 0; previous = null; feedback.clear(); feedback.setSuspended(false); mechanic = new BossEncounter();
  document.getElementById('pause').textContent = 'Pause';
  feedback.setPreferences({ enabled: document.getElementById('feedback').checked, reducedMotion: reduced.checked });
  render(encounterAt(0), 0, { cut: true });
}
function frame(now) {
  const dt = previous === null ? 0 : Math.min(0.1, (now - previous) / 1000); previous = now;
  if (!paused) {
    if (recording) {
      recordingStart ??= now; const elapsed = Math.min(24, (now - recordingStart) / 1000);
      const phase = elapsed < DURATION ? 0 : 1;
      if (phase !== recordingPhase) {
        recordingPhase = phase; time = 0; feedback.setPreferences({ reducedMotion: phase === 1 });
        render(encounterAt(0), 0, { cut: true, reducedMotion: phase === 1 });
      }
      time = phase === 0 ? elapsed : elapsed - DURATION;
      render(encounterAt(time), dt, { reducedMotion: phase === 1 });
      if (elapsed >= 24) { captureComplete = true; recorder.stop(); }
    } else if (live) {
      const state = mechanic.update(dt, { x: Number(keys.has('d')) - Number(keys.has('a')),
        z: Number(keys.has('s')) - Number(keys.has('w')), jump: keys.has(' '), attack: keys.has('j') });
      time = state.time; render(state, dt);
    } else { time = Math.min(DURATION, time + dt); render(encounterAt(time), dt); }
  }
  handle = requestAnimationFrame(frame);
}
document.getElementById('replay').onclick = () => { if (recording) return; audio.start(); live = false; paused = false; reset(); };
document.getElementById('live').onclick = () => { if (recording) return; audio.start(); live = true; paused = false; reset(); };
document.getElementById('pause').onclick = () => {
  if (recording) return; paused = !paused; keys.clear(); feedback.setSuspended(paused); director.clear(); previous = null;
  audio.clear();
  document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause';
};
for (const id of ['reduced', 'feedback']) document.getElementById(id).onchange = () => {
  if (recording) return;
  feedback.setPreferences({ enabled: document.getElementById('feedback').checked, reducedMotion: reduced.checked });
  director.clear();
};
document.getElementById('sound').onchange = event => { if (event.target.checked) audio.start(); else audio.clear(); };
document.getElementById('seek').oninput = event => {
  if (recording) return; live = false; paused = true; keys.clear(); feedback.clear();
  time = Number(event.target.value); render(encounterAt(time), 0, { cut: true });
  feedback.setSuspended(true); document.getElementById('pause').textContent = 'Resume';
};
document.getElementById('record').onclick = () => {
  audio.start();
  live = false; paused = false; feedback.setSuspended(false); reset();
  recordingStart = null; recordingPhase = -1; captureComplete = false; const chunks = [];
  stream = combined.captureStream(30); audio.tracks().forEach(track => stream.addTrack(track.clone()));
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    recording = false; stream.getTracks().forEach(t => t.stop());
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const result = await fetch('/__capture', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      if (!result.ok) throw new Error('Save failed');
      const file = await result.json(); paused = true; status.textContent = `Saved ${captureComplete ? '' : 'partial '}${file.filename} (${file.size} bytes)`;
    } catch (error) { paused = true; status.textContent = error.message; }
    document.getElementById('record').disabled = false;
  };
  recording = true; document.getElementById('record').disabled = true; recorder.start();
};
function keydown(event) {
  const key = event.key.toLowerCase(); if (!['w', 'a', 's', 'd', ' ', 'j'].includes(key) || !live) return;
  event.preventDefault(); if (!paused) keys.add(key);
}
function keyup(event) { keys.delete(event.key.toLowerCase()); }
function blur() {
  keys.clear(); paused = true; feedback.setSuspended(true); director.clear();
  audio.clear();
  if (recorder?.state === 'recording') recorder.stop();
}
window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(handle); keys.clear(); feedback.dispose(); director.dispose(); audio.dispose();
  if (recorder?.state === 'recording') recorder.stop(); stream?.getTracks().forEach(t => t.stop());
  window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur);
  renderers.forEach(r => r.dispose()); world.dispose();
}, { once: true });
reset(); handle = requestAnimationFrame(frame);
