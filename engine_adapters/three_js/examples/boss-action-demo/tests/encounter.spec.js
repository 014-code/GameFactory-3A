import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { A3GameActionCameraDirector } from '@a3game/playable';
import { encounterAt, BossEncounter } from '../encounter.js';
import { createBossScene } from '../scene.js';

function replay(fps, reducedMotion = false) {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
  const director = new A3GameActionCameraDirector(camera);
  const poses = [];
  for (let i = 0; i <= 16 * fps; i++) {
    const state = encounterAt(i / fps);
    director.update(i ? 1 / fps : 0, state.player, state.target, { mode: state.mode, cut: !i, reducedMotion });
    poses.push({ mode: state.mode, position: camera.position.toArray(), fov: camera.fov });
  }
  director.dispose(); return poses;
}
describe('action-aware combat presentation', () => {
  it('frames real vertical motion through launch, landing and recovery', () => {
    expect(encounterAt(5).target.y).toBeGreaterThan(3);
    expect(encounterAt(5).player.y).toBeGreaterThan(2);
    expect(encounterAt(8).mode).toBe('landing');
    expect(encounterAt(15).mode).toBe('recovery');
    for (const fps of [30, 60, 120]) {
      const poses = replay(fps);
      expect(poses.every(p => [...p.position, p.fov].every(Number.isFinite))).toBe(true);
      expect(poses.at(-1).fov).toBeCloseTo(55, 3);
    }
  });
  it('keeps frame-rate endpoints close and reduced-motion shots stable', () => {
    const a = replay(30).at(-1).position, b = replay(120).at(-1).position;
    expect(Math.hypot(...a.map((v, i) => v - b[i]))).toBeLessThan(0.02);
    expect(replay(60, true).every(p => p.fov === 55)).toBe(true);
  });
  it('does not restart repeated modes and stops writing after disposal', () => {
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    const director = new A3GameActionCameraDirector(camera);
    const p = new THREE.Vector3(), t = new THREE.Vector3(1, 2, 0);
    for (let i = 0; i < 3; i++) director.update(0.1, p, t, { mode: 'airborne' });
    expect(director.age).toBeCloseTo(0.3);
    director.dispose(); const pose = camera.position.clone(); director.update(1, p, t);
    expect(camera.position.equals(pose)).toBe(true); director.dispose();
    expect(() => director.update(-1, p, t)).toThrow();
  });
  it('only confirms live attacks in range, with cooldown, and supports real jump input', () => {
    const match = new BossEncounter();
    expect(match.update(0.1, { attack: true }).impact).toBe(true);
    expect(match.update(0.1, { attack: true }).impact).toBe(false);
    expect(match.update(0.1, { jump: true }).player.y).toBe(0);
    expect(match.update(0.2).player.y).toBeGreaterThan(1);
    match.player.set(-7, 0, -7); expect(match.update(1, { attack: true }).impact).toBe(false);
    expect(() => match.update(-1)).toThrow();
  });
  it('keeps full procedural actor bounds inside the vertical action view', () => {
    const world = createBossScene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 100);
    const director = new A3GameActionCameraDirector(camera);
    for (let i = 0; i <= 16 * 60; i++) {
      const state = encounterAt(i / 60); world.update(state, false); world.scene.updateMatrixWorld(true);
      director.update(i ? 1 / 60 : 0, state.player, state.target, { mode: state.mode, cut: !i });
      for (const actor of [world.player, world.boss]) {
        const box = new THREE.Box3().setFromObject(actor.group);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(1);
        }
      }
    }
    director.dispose(); world.dispose();
  });
});
