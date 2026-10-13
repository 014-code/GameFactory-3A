# Arena Camera Before / After

This fixture compares main's static Orbit framing to the actual arena chase
profile, using identical whitebox actors, aspect, eight-second world-space trace
and impact times. It isolates presentation from the changed input mapping.
The baseline is `41445aaf3f66d1e5dabde079c9b5eaf04884f68c`; it reconstructs the
camera state from the arena boot and host defaults, rather than loading a second
engine dependency. After imports `createArenaCameraProfile` from the arena example
and uses the real `A3GameCameraRig` / `A3GameFeedback` public components.

From `engine_adapters/three_js/plugin/A3GamePlayable/`:

```bash
npm ci
npm test
node_modules/.bin/vite-node --config vitest.config.js ../../examples/game-feel-comparison/measure.js
node node_modules/vite/bin/vite.js --config ../../examples/game-feel-comparison/vite.config.mjs
```

Open `http://127.0.0.1:5180/`. Both panes share one scene and actor transforms.
Replay and reduced-motion controls restart the same trace. Inspect time pauses
at a reproducible point. Record captures both panes as an eight-second WebM
when the browser supports MediaRecorder; keep the page visible during capture.
Replay/seek interrupt the recording and produce a partial clip, which must not
be presented as the full take. The page shows measured
framing results; `measurements.json` saves the deterministic 30/60/120 Hz results.
The plugin's existing Vitest configuration includes this example's tests.

`fullyVisibleFraction` is the fraction of samples whose eight player bounding-box
corners lie within the camera frustum. `meanFocusErrorNdc` is the mean distance of
the player focus point from the viewport center in normalized device coordinates.
Neither is a depth-buffer visibility test or a comfort score. Browser replay uses
actual rendering timestamps, so its sample count and averages can differ from the
deterministic fixed-rate measurements. The regression gates apply to this trace.

Use `agent_skills/game-feel/SKILL.md` for controlled recordings and tuning.
This is evidence for a
reference camera change, not an end-to-end generated-skill effectiveness claim.
No physical vibration or volumetric collision is evaluated here.
