import { describe, expect, it } from 'vitest';
import { createComparison, measure, stepComparison, summarize } from '../comparison.js';

describe('arena camera before/after trace', () => {
  for (const fps of [30, 60, 120]) {
    it(`keeps the moving player framed at ${fps} Hz, with and without optional motion`, () => {
      for (const reducedMotion of [false, true]) {
        const report = measure({ fps, reducedMotion });
        expect(report.before.fullyVisibleFraction).toBeLessThan(0.8);
        expect(report.after.fullyVisibleFraction).toBeGreaterThan(0.99);
        expect(report.after.meanFocusErrorNdc).toBeLessThan(report.before.meanFocusErrorNdc / 5);
        expect(report.impacts).toBe(2);
      }
    });
  }
  it('refuses an empty take and time reversal', () => {
    const state = createComparison();
    expect(() => summarize(state)).toThrow();
    stepComparison(state, 1);
    expect(() => stepComparison(state, 0.5)).toThrow();
    state.feedback.dispose();
  });
});
