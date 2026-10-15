import { measure } from './comparison.js';
console.log(JSON.stringify([30, 60, 120].flatMap(fps =>
  [false, true].map(reducedMotion => measure({ fps, reducedMotion }))), null, 2));
