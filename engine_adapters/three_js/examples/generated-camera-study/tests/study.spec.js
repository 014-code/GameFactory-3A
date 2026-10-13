import { describe, it, expect } from 'vitest';
import { factories, measure, lifecycle, study } from '../evaluate.js';

describe('unchanged independent generated camera pair', () => {
  it('keeps both actors in frame with finite poses at 30/60/120 Hz', () => {
    for (const factory of Object.values(factories)) for (const fps of [30, 60, 120]) {
      const { report } = measure(factory, { fps });
      expect(report.allPosesFinite).toBe(true);
      expect(report.bothFullyInFrameFraction).toBeGreaterThan(0.99);
    }
  });
  it('has frame-rate independent final framing within 0.1 mm', () => {
    for (const factory of Object.values(factories)) {
      const a = measure(factory, { fps: 30 }).report.finalPosition;
      const b = measure(factory, { fps: 120 }).report.finalPosition;
      expect(Math.hypot(...a.map((x, i) => x - b[i]))).toBeLessThan(0.0001);
    }
  });
  it('suppresses optional impact motion and honors pause/disposal', () => {
    for (const factory of Object.values(factories)) {
      expect(measure(factory, { reducedMotion: true }).samples)
        .toEqual(measure(factory, { reducedMotion: true, impacts: false }).samples);
      expect(lifecycle(factory)).toEqual({ pausePreventsWrites: true, resumeMoves: true, disposePreventsWrites: true });
    }
  });
  it('clears treatment impulses immediately on pause and feedback-off', () => {
    const report = study();
    expect(report.conditions.treatment.pauseClearsImpact.clearsImmediately).toBe(true);
    expect(report.conditions.treatment.preferencesClearImpact.clearsImmediately).toBe(true);
    // Control failures are recorded in measurements, not silently patched or accepted as production behavior.
  });
});
