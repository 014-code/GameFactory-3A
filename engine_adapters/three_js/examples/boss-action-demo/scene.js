import * as THREE from 'three';

export function createBossScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#182037'); scene.fog = new THREE.Fog('#182037', 24, 60);
  scene.add(new THREE.HemisphereLight(0xb4ceff, 0x382414, 2));
  const sun = new THREE.DirectionalLight(0xffd4a3, 4); sun.position.set(-4, 10, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x61a5ff, 3); rim.position.set(3, 6, -8); scene.add(rim);
  const mat = (color, metalness = 0) => new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.5 });
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.3, 64), mat('#343d52'));
  ground.position.y = -0.16; scene.add(ground);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 6, 8), mat('#495467'));
    pillar.position.set(Math.cos(a) * 11, 3, Math.sin(a) * 11); scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), mat('#c19e61', 0.5));
    cap.position.copy(pillar.position); cap.position.y = 6; scene.add(cap);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.03, 4, 64), mat('#baa77b'));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.015; scene.add(ring);
  function actor(color, scale) {
    const group = new THREE.Group(), armor = mat(color, 0.65), dark = mat('#252b3a');
    const part = (geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
    };
    part(new THREE.CapsuleGeometry(0.29, 0.55, 4, 8), armor, 0, 1.1, 0);
    part(new THREE.IcosahedronGeometry(0.28, 1), armor, 0, 1.75, 0);
    const eyes = part(new THREE.BoxGeometry(0.31, 0.045, 0.04), new THREE.MeshBasicMaterial({ color: '#88eeff' }), 0, 1.79, 0.24);
    const legs = [-1, 1].map(side => part(new THREE.CapsuleGeometry(0.13, 0.55, 4, 6), dark, side * 0.19, 0.42, 0));
    const arms = [-1, 1].map(side => part(new THREE.CapsuleGeometry(0.12, 0.55, 4, 6), armor, side * 0.43, 1.13, 0));
    const weapon = new THREE.Group(); weapon.position.set(0.5, 1.0, 0.2); group.add(weapon);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.055), mat('#e2efff', 0.7)); blade.position.y = 0.7; weapon.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.12), mat('#e6b75c', 0.8)); weapon.add(guard);
    group.scale.setScalar(scale); scene.add(group); return { group, legs, arms, weapon, eyes };
  }
  const player = actor('#699dda', 1), boss = actor('#b17c46', 1.7);
  boss.group.rotation.y = -Math.PI / 2;
  const burst = new THREE.Group(); scene.add(burst);
  const sparks = Array.from({ length: 24 }, (_, i) => {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffdc81' : '#ff804a' }));
    burst.add(mesh); return mesh;
  });
  const wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffbb65', transparent: true, opacity: 0.6 }));
  wave.rotation.x = Math.PI / 2; scene.add(wave);
  const shadows = [player, boss].map(a => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(a === boss ? 0.9 : 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x10131c, transparent: true, opacity: 0.5, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.025; scene.add(mesh); return mesh;
  });
  return { scene, player, boss, update(state, reducedMotion) {
    player.group.position.copy(state.player); boss.group.position.copy(state.target);
    player.group.rotation.y = Math.PI / 2;
    [player, boss].forEach((a, index) => {
      a.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(state.time * 6 + i * Math.PI) * (index ? 0.08 : 0.25); });
      a.weapon.rotation.z = -0.6 + (index ? 0 : state.attackPose * 1.7);
      a.arms[1].rotation.z = -state.attackPose * 0.6;
      shadows[index].position.x = a.group.position.x; shadows[index].position.z = a.group.position.z;
      shadows[index].scale.setScalar(1 / (1 + a.group.position.y * 0.1));
    });
    boss.group.rotation.z = !reducedMotion && state.impactAge < 0.3 ? Math.sin(state.impactAge * 20) * 0.16 : 0;
    const age = Number.isFinite(state.impactAge) ? state.impactAge : 1;
    burst.visible = !reducedMotion && age >= 0 && age < 0.45;
    burst.position.copy(state.target).y += 1.6;
    sparks.forEach((mesh, i) => {
      const a = i * 2.39996; mesh.position.set(Math.cos(a) * age * 4, Math.sin(i * 1.7) * age * 3, Math.sin(a) * age * 4);
      mesh.scale.setScalar(Math.max(0.1, 1 - age / 0.45));
    });
    wave.visible = !reducedMotion && state.mode === 'landing';
    wave.position.set(state.target.x, 0.04, state.target.z); wave.scale.setScalar(1 + Math.max(0, state.time - 7.8) * 3);
    wave.material.opacity = Math.max(0, 0.8 - Math.max(0, state.time - 7.8) * 0.5);
  }, dispose() {
    const geometries = new Set(), materials = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  } };
}
