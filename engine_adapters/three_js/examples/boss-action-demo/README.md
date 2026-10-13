# Forge Sentinel: action camera prototype

An original procedural arena, two articulated primitive characters and swords,
contact sparks/ring/recoil, static hit/health cues, and a public-runtime action
camera. No author models, textures, animations or footage are copied; no Tripo API
or paid asset generation is used. This is a small prototype, not a full AAA game.

The latest screenshot feedback said the earlier horizontal-box comparison did
not show complex camera movement, flying characters or hit feel. The reference
[Xiaohongshu note](https://xhslink.cn/o/1wGj8oyL8LZ) was played in the user's Chrome.
Observed frames/segments: around 00:22–00:24, a low combat view, a lifted large
target, bright contact effect and damage number; 00:57, target and multiple airborne
objects; 01:24, high target/low player framing; 01:53, airborne player and large
target crossing above. Some reference target geometry crosses the screen edge.
These are visual observations, not verification of its advertised generation
workflow, real input responsiveness or subjective comfort.

## Run and review

From `engine_adapters/three_js/plugin/A3GamePlayable/`:

```bash
npm ci
npm test
node node_modules/vite/bin/vite.js --config ../../examples/boss-action-demo/vite.config.mjs
```

Open `http://127.0.0.1:5182/`. The same encounter state and original effects are
rendered in both panes. BASE reconstructs main's static host camera at `41445aa`;
UPDATED uses `A3GameActionCameraDirector` plus confirmed-event `A3GameFeedback`.
This is an authored runtime comparison, not another independent generation A/B.
The earlier generated-camera-study prompts/outputs remain unchanged.

The 16-second replay shows approach, wind-up, confirmed strike, both characters
launching, an aerial strike, landing, a boss telegraph/sweep and recovery. Camera
modes change from confirmed encounter state; bounded same-side arcs, fitted
distance and FOV transitions keep vertical action readable and return to a stable
view. The replay's launch trajectory is authored, not rigid-body ragdoll physics.

`Play live` enables WASD movement, Space jump and J attack. The small mechanic
confirms damage only within range and outside cooldown, then presentation consumes
that outcome. Input does not rotate with the cinematic camera. Pause, blur and
exit clear impulses/input; resume/replay restores feedback. Reduced motion keeps
essential movement, hit numbers and health while suppressing optional camera arcs,
FOV pulses, particles and recoil. Hardware vibration and audio are not evaluated.

## Real recording

Open with `?revision=<tested-git-head>` to label the updated source, then click
`Record action comparison`. The 24-second canvas recording contains the complete
16-second action replay and the first eight seconds repeated with reduced motion.
It captures only game canvases and captions, not browser chrome or desktop data.
Wait for `Saved boss-action-comparison.mp4` (or WebM fallback). The local-only
receiver is limited to 25 MiB; recordings and builds are ignored.

Export MP4 with H.264 Baseline, yuv420p, 30 fps and faststart for mobile playback.
Check full decode and actual frames during wind-up/impact, launch, landing and
reduced motion. Do not substitute screenshots or passing framing metrics for
watching the action. A camera distance cap or center-ray blocker test cannot
guarantee volume clearance in an arbitrary imported world.

Native tests cover the vertical replay, all procedural actor bounds in frame,
30/60/120 Hz endpoints, repeated mode handling, reduced-motion FOV, disposal and
live hit-range/cooldown/jump input. Chrome verifies actual rendering and interaction.
Full game generation, repeated statistical skill effects, final assets, physical
haptics, volumetric collision and human comfort remain outside this small demo.
