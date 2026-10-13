# Independent generated camera-module pair

One native-agent generation per condition, without inherited conversation history
or model overrides. Both receive `common-prompt.txt`; treatment additionally gets
the complete game-feel skill from `afa1de1`. Neither receives the other output,
arena camera profile or desired measurement results. The prompts instruct agents
to read only their own prompt and write only their output; the filesystem itself
is shared. Condition labels and output paths necessarily differ. The interface
does not expose seed, temperature or backend model identity; repeated sampling
would be needed to distinguish skill effects from generation variance.

`control.js` and `treatment.js` are byte-for-byte copies of those independent
outputs, without fixes. `provenance.json` retains hashes, generation conditions,
rationales and limits. This is a bounded camera-module study, not a full generated
game through the UI/Mechanic pipeline. Local CLI failure did not block native
agents: the CLI 0.154.0 default-model READY probe failed HTTP400; no replacement
model, credential or global configuration was changed.

From `engine_adapters/three_js/plugin/A3GamePlayable/`:

```bash
npm ci
npm test
node_modules/.bin/vite-node --config vitest.config.js ../../examples/generated-camera-study/measure.js
node node_modules/vite/bin/vite.js --config ../../examples/generated-camera-study/vite.config.mjs
```

Open `http://127.0.0.1:5181/`, Replay the shared eight-second trace, inspect a
fixed time, then repeat with reduced motion. Both WebGL panes share geometry,
world transforms and time. `rendered-t2.jpg` shows the observed Chrome rendering
at 2.000004 seconds; full replay, seek and reduced motion had no console errors.
The generated modules can be rerun; regenerating them requires two independent
agents with the preserved prompts and matched model settings.

## Actual comparison video

With the local Vite server running, `Record 18-second comparison` records only
the rendered canvases and version/stage captions, then saves into ignored
`captures/`. It prefers MP4/H.264 when MediaRecorder supports it, otherwise WebM.
The local development-only POST receiver accepts MP4/WebM up to 25 MiB; it is
bound to localhost and does not accept a filesystem path from the browser.

The three phases are the same eight-second movement/impact trace, two seconds
paused at a freshly replayed active impulse at simulation t=3.05, and eight
seconds of the same trace with reduced motion. The middle phase intentionally
holds the paused runtime pose; the clip is a real canvas recording, not still
images edited into a slideshow. Captions identify the unchanged source modules
at `5878ca7` and treatment skill context at `afa1de1`. These modules remain
byte-for-byte identical in the final PR revision.

The delivered `GameFactory3A-camera-skill-before-after.mp4` is a 17.97-second,
1280x480, 30 fps H.264 Constrained Baseline / yuv420p export with faststart. Full
decode and frames at 2/9/14 seconds were checked. Video is delivered separately,
not committed as a binary. The earlier `camera_comparison.md` was removed at
reviewer's request; its path survives only inside the immutable historical
treatment prompt, which represents actual generation context at `afa1de1`.

| 60 Hz, motion enabled | Control | Skill context |
|---|---:|---:|
| Both projected actor boxes fully in frame | 100% | 100% |
| Mean projected actor-box overlap IoU | 0.084325 | 0 |
| Mean player-center error, NDC | 0.171621 | 0.173858 |
| Immediately clears impact on pause | No | Yes |
| Immediately clears impact on feedback-off | No | Yes |

All poses are finite at 30/60/120 Hz. The 30-to-120 Hz final camera-position
difference is 0.00004204 world units for control and 0.00003519 for treatment.
Both suppress impact motion in reduced-motion mode and prevent further writes
while paused/disposed. Control nonetheless freezes its residual pulse on pause
or feedback-off: at t=3.05 its position differs by 0.009932 world units and FOV
by 0.178771 degrees from the same no-impact take. Treatment clears both immediately.
The evaluator deliberately captures this failure without repairing the raw control.
The skill's acceptance guidance now distinguishes immediate clearing from merely
stopping updates.

IoU uses projected axis-aligned bounds, not rendered pixel masks or depth-buffer
occlusion. Full-frame fraction likewise measures frustum containment. Player-center
error slightly worsens despite improved separation: neither metric alone rates
camera quality. The screenshot supports separation in this scene; it is not a
blinded operator rating or subjective comfort score. No hardware vibration,
camera-volume collision, final assets or broad gameplay coverage is evaluated.
