import * as THREE from 'three';
import { A3GameCameraRig, A3GameFeedback } from '@a3game/playable';
import { createArenaCameraProfile } from '../arena-fighter-example/src/camera-profile.js';

export const DURATION = 8;
export const BASELINE_REF = '41445aaf3f66d1e5dabde079c9b5eaf04884f68c';

/** Same world-space movement for both cameras; independent of input mappings. */
export function playerAt(seconds) {
  return new THREE.Vector3(10 * Math.sin(seconds * Math.PI / 4), 0, 0);
}

export function createComparison({ aspect = 16 / 9, reducedMotion = false } = {}) {
  // main's arena startup: host camera (0,2,8), Orbit target (0,1.2,0), fov 55.
  // OrbitControls with no user look input retains this position/target.
  const before = new THREE.PerspectiveCamera(55, aspect, 0.1, 2000);
  before.position.set(0, 2, 8);
  before.lookAt(0, 1.2, 0);
  before.updateMatrixWorld(true);
  const after = before.clone();
  const rig = new A3GameCameraRig(after, createArenaCameraProfile());
  rig.update(0, playerAt(0), { cut: true });
  const feedback = new A3GameFeedback({ navigator: {}, window: null, document: null,
    media: null, reducedMotion });
  return { before, after, rig, feedback, reducedMotion, samples: [], lastTime: 0, impacts: 0 };
}

/** Bounding-box projections measure framing, not depth-buffer occlusion or comfort. */
export function framing(camera, position) {
  const points = [];
  for (const x of [-0.3, 0.3]) for (const y of [0, 1.7]) for (const z of [-0.3, 0.3]) {
    points.push(position.clone().add(new THREE.Vector3(x, y, z)).project(camera));
  }
  const focus = position.clone().add(new THREE.Vector3(0, 1.2, 0)).project(camera);
  return {
    fullyVisible: points.every(p => p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z >= -1 && p.z <= 1),
    focusError: Math.hypot(focus.x, focus.y),
  };
}

export function stepComparison(state, time) {
  if (!Number.isFinite(time) || time < state.lastTime) throw new RangeError('time must advance monotonically');
  const delta = time - state.lastTime;
  for (const impact of [3, 6]) if (state.lastTime < impact && time >= impact) {
    state.feedback.trigger({ strength: 0.05 });
    state.impacts++;
  }
  state.lastTime = time;
  const player = playerAt(time);
  state.rig.update(delta, player, { ...state.feedback.update(delta), reducedMotion: state.reducedMotion });
  const sample = { time, before: framing(state.before, player), after: framing(state.after, player) };
  state.samples.push(sample);
  return { player, sample };
}

export function summarize(state) {
  const score = key => ({
    fullyVisibleFraction: state.samples.filter(s => s[key].fullyVisible).length / state.samples.length,
    meanFocusErrorNdc: state.samples.reduce((sum, s) => sum + s[key].focusError, 0) / state.samples.length,
  });
  if (!state.samples.length) throw new Error('Capture at least one sample');
  return { schema: 'a3game.camera_comparison.v1', baselineRef: BASELINE_REF, candidateProfileRef: '321567d166fcefa1e364444b5d26df8ad775553b',
    scope: 'reference camera implementation, not a generated-skill effectiveness trial',
    durationSeconds: state.lastTime, samples: state.samples.length, impacts: state.impacts,
    reducedMotion: state.reducedMotion, before: score('before'), after: score('after'),
    limitations: ['whitebox actors', 'no volumetric camera collision', 'no physical haptics',
      'projection metrics do not establish comfort or rendered occlusion'] };
}

export function measure({ fps = 60, reducedMotion = false } = {}) {
  if (!Number.isInteger(fps) || fps < 1) throw new RangeError('fps must be a positive integer');
  const state = createComparison({ reducedMotion });
  for (let frame = 0; frame <= DURATION * fps; frame++) stepComparison(state, frame / fps);
  const report = { fps, ...summarize(state) };
  state.feedback.dispose();
  return report;
}
