import * as THREE from 'three';

/** Arena presentation defaults; each consumer receives independent vectors. */
export function createArenaCameraProfile() {
  return { offset: new THREE.Vector3(2.5, 4, -7), fov: 55, response: 8 };
}
