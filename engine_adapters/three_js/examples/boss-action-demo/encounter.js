import * as THREE from 'three';

export const DURATION = 16;
export const IMPACTS = [3, 5, 7.8, 11.4];
export function encounterAt(time) {
  const t = Math.max(0, Math.min(DURATION, time));
  const player = new THREE.Vector3(-3 + Math.min(t / 2, 1) * 2, 0, 0);
  const target = new THREE.Vector3(1.2, 0, 0);
  let mode = 'follow', label = 'Approach / readable combat framing';
  if (t >= 2 && t < 3) { mode = 'windup'; label = 'Wind-up / keep action silhouettes separated'; }
  if (t >= 3 && t < 3.4) { mode = 'impact'; label = 'Confirmed strike / recoil, sparks and bounded camera impulse'; }
  if (t >= 3.4 && t < 7.8) {
    mode = 'airborne'; label = 'Launch / vertical two-actor framing and bounded side arc';
    const u = (t - 3.4) / 4.4;
    target.y = 4.2 * Math.sin(Math.PI * u);
    player.y = 3.0 * Math.sin(Math.PI * u);
    player.x = -1 + 0.4 * Math.sin(Math.PI * u);
    target.x += 0.6 * Math.sin(Math.PI * u);
  }
  if (t >= 7.8 && t < 9.2) { mode = 'landing'; label = 'Landing / ground ring, recoil and camera recovery'; }
  if (t >= 9.2 && t < 10.4) { mode = 'recovery'; label = 'Recover / return to stable playable view'; }
  if (t >= 10.4 && t < 11.4) { mode = 'windup'; label = 'Boss telegraph / dodge before contact'; }
  if (t >= 11.4 && t < 12.2) {
    mode = 'impact'; label = 'Boss sweep / confirmed contact only triggers feedback';
    player.x -= Math.sin((t - 11.4) / 0.8 * Math.PI) * 1.3;
  }
  if (t >= 12.2) { mode = 'recovery'; label = 'Return to play / same-side camera, no roll'; }
  const lastImpact = [...IMPACTS].reverse().find(hit => hit <= t);
  const impactAge = lastImpact === undefined ? Infinity : t - lastImpact;
  return { player, target, mode, label, time: t, impactAge,
    health: 1 - IMPACTS.filter(hit => hit <= t).length * 0.12,
    attackPose: t >= 2 && t < 3.5 ? Math.sin((t - 2) / 1.5 * Math.PI * 1.5) : t >= 4.6 && t < 5.4 ? Math.sin((t - 4.6) * 5) : 0 };
}

/** Small playable mechanic: commands own airborne state/damage; presentation consumes them. */
export class BossEncounter {
  constructor() { this.player = new THREE.Vector3(-1, 0, 0); this.target = new THREE.Vector3(1.2, 0, 0); this.time = 0; this.airTime = Infinity; this.lastHit = -Infinity; this.health = 1; }
  update(delta, { x = 0, z = 0, jump = false, attack = false } = {}) {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError('delta must be finite and non-negative');
    this.time += delta; this.airTime += delta;
    if (jump && this.player.y === 0) this.airTime = 0;
    this.player.y = this.airTime < 1 ? 2.3 * Math.sin(Math.PI * this.airTime) : 0;
    this.player.x = THREE.MathUtils.clamp(this.player.x + x * delta * 3, -7, 7);
    this.player.z = THREE.MathUtils.clamp(this.player.z + z * delta * 3, -7, 7);
    const impact = attack && this.time - this.lastHit >= 0.45 && this.player.distanceTo(this.target) < 3;
    if (impact) { this.lastHit = this.time; this.health = Math.max(0, this.health - 0.08); }
    return { player: this.player.clone(), target: this.target.clone(), impact,
      impactAge: this.time - this.lastHit, health: this.health, attackPose: attack ? Math.sin(this.time * 12) : 0,
      mode: this.player.y > 0.15 ? 'airborne' : impact ? 'impact' : 'follow', label: 'Live play / WASD move · Space jump · J attack', time: this.time };
  }
}
