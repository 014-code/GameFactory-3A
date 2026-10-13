# Compare Camera Outcomes and Tune the Skill

Use this when evaluating a camera change, rather than treating implementation,
compilation or a playtest integrity score as evidence of better camera experience.

## Controlled comparison in a generated game

The repo has no implemented gameplay/UI ops operator. Use the existing
`pipeline/code_gen/playtest/run.py` recorder and `pipeline/code_gen/playtest/eval.py`
for capture integrity, then have the operator/reviewer compare the actual takes.
The evaluator's `authoritative_validation=false` does not rate camera comfort.

Keep a baseline game revision and a candidate generated with the changed skill.
Use the same brief, model/settings (and seed if supported), assets, world, viewport,
action plan, FPS and duration. Preserve both code revisions and raw recordings in
the game's workspace. If generation cannot be controlled, label the confounders;
a camera-component comparison alone is not a skill-effectiveness experiment.

Record using the selected engine's documented public path. For an already running
Three.js game, the existing pipeline accepts:

```bash
python pipeline/code_gen/playtest/run.py --engine three_js \
  --project <baseline-project> --url <baseline-url> \
  --action-plan <shared-plan.json> --out-dir <baseline-takes> --duration 12 --fps 30
python pipeline/code_gen/playtest/run.py --engine three_js \
  --project <candidate-project> --url <candidate-url> \
  --action-plan <shared-plan.json> --out-dir <candidate-takes> --duration 12 --fps 30
```

Supply the existing recorder/browser prerequisites from the engine API; never
pretend these commands ran when the prerequisites or actual generated games are
missing. Use distinct output directories and inspect each take's executed actions,
console errors, capture completion and source hash. Repeat key motion at 60/120 Hz
in native tests or game replay; recording FPS is not necessarily simulation FPS.

## Operator review and adjustment

Store a comparison report alongside the takes with: baseline/candidate revisions,
skill revision, scene/asset IDs, viewport, action-plan hash, FPS/duration, measured
results, recording paths, reviewer observations, confounders and remaining gaps.

| Review | Evidence to compare | Adjustment owned by presentation/design |
|---|---|---|
| Player/action readability | Time fully in frame, focus error, target overlap in both takes | Offset, distance, target weights or framing bounds |
| Follow response | Lag during movement/reversal at several frame rates | Response rate; compare lag against acceleration/discomfort |
| Shot changes | Spawn, teleport, action transitions and interrupted transitions | Cut/blend policy and shot priority |
| Obstruction | Wall, corner, ceiling and slope footage; near-plane clearance | Engine collision sweep and safe distance, not just a center ray |
| Optional motion | Confirmed impacts, overlap, pause, reduced-motion and feedback-off takes | Pulse magnitude/duration; retain static outcome cues |
| Comfort | Watched recordings and player/operator observations | Remove roll/bob/FOV pulses or lower intensity as needed |

Change one profile dimension at a time, rerun the identical plan, and record
symptom -> adjustment -> new measurement/observation. Do not optimize framing
metrics while ignoring discomfort or hidden-information leaks. Accept a change
only for the measured scenario; do not announce a universal skill improvement.

When evidence repeatedly supports a design choice, update the relevant skill
instruction with its applicability and limitation. Game-specific numeric tuning
stays in the game's camera profile rather than becoming a universal skill default.

## Included reference evidence

`engine_adapters/three_js/examples/game-feel-comparison/` provides a reproducible
side-by-side browser fixture, a deterministic eight-second trace, native regression
tests and raw measurements. It reconstructs main's idle Orbit framing at commit
`41445aaf3f66d1e5dabde079c9b5eaf04884f68c` and consumes the same arena chase profile
as the example startup. Movement, geometry, aspect and duration are held equal.

At 60 Hz, this trace changes the projected player bounding box's fully-in-frame
fraction from 48.02% to 100%, and mean focus error from 0.8538 to 0.0744 NDC.
Across 30/60/120 Hz, the candidate remains fully in frame; reduced-motion mode
also remains fully in frame with optional impulses suppressed. Projection metrics
are not rendered-occlusion or comfort ratings.

The reference demonstrates a concrete framing improvement and lets an operator
inspect/tune the actual profile. It does not prove that invoking the skill improves
every generated game. The bounded independent camera-module pair below adds
generation evidence; full game-pipeline trials, final-art comfort review,
physical haptics and volumetric camera collision remain unverified.

The observed centered chase view put the collinear opponent behind the player;
the arena's lateral offset improves separation in the whitebox. Accordingly,
choose a lateral composition when actors obscure the action, then inspect both
actors during the game's own action trace. Do not prescribe that offset for every
genre, and prefer an already stable/readable shot when the comparison shows no gain.

## Bounded independent generation evidence

`engine_adapters/three_js/examples/generated-camera-study/` preserves one raw
camera-module output per condition, both full prompts, hashes and measurements.
Two native agents used the same inherited model with no model override and no
conversation history; neither was supplied the other output. They received the
same task, API, assets and trace. Treatment alone received this skill's text at
`afa1de1`; the unique output paths and condition labels are also recorded. Seed,
temperature and backend model identifier are not exported by that interface.
Isolation was instructed, not an OS filesystem boundary.

Both outputs keep both actors fully in frame. At 60 Hz, treatment lowers mean
projected actor-bounds IoU from 0.0843 to zero, while mean player-center error
increases from 0.1716 to 0.1739 NDC. Report both tradeoffs. Raw control leaves
an active impulse frozen on pause/feedback-off; treatment clears immediately.
This observation prompted the explicit immediate-base-pose acceptance check in
the skill. Preserve the original outputs; do not silently repair the baseline.

This is a single pair of generated camera modules, not a complete game generated
through the pipeline, repeated statistical study, blinded operator rating or
comfort/hardware test. Common task requirements already mention reduced motion
and cleanup; only the added skill context differs. Do not generalize one favorable
separation result to every game or describe every metric as improved.
