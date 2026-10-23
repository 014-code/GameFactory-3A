# Recovering Tripo generation tasks

Pass a stable `cache_dir` to `TripoModel` to retain accepted generation tasks
across timeouts and process restarts:

```python
from models.gen_3d_object.tripo_model import TripoModel

model = TripoModel(cache_dir=".tmp/tripo-cache", timeout=300)
data = model.infer(prompt="a wooden chair", seed=42)
# If polling or downloading fails, rerun the same input with the same cache_dir.
print(model.last_call_info)  # task_id, cached, resumed, etc.
```

The wrapper saves the accepted task ID before polling or downloading. A retry
queries that task instead of uploading the image and creating another task.
Downloads use a fresh task lookup, so expired download URLs are not persisted.
After the artifact and metadata are atomically published to the completed cache,
the pending checkpoint is removed. Existing completed-cache keys and public
`infer` / `infer_and_save` signatures are unchanged. `cache_dir=None` disables
both caching and recovery.

## Files and concurrency

Checkpoints live under `<cache_dir>/tripo/pending/<scope>.json`. The opaque scope
hash covers the existing request fingerprint, API base URL, and a digest of the
credential actually used by the HTTP client. A checkpoint contains only its
version, scope hash, task ID and creation time, not credentials, prompts, image
bytes, upload tokens, or download URLs. Rotating credentials or changing the API
base creates a separate pending-task scope; it cannot resume an old scope.
Completed artifacts retain the previous shared cache behavior.

Callers for the same pending-task scope hold an OS file lock through generation,
download and cache publication, then recheck the completed cache after acquiring
the lock. Lock waiting is bounded by `timeout`; polling has its own `timeout`
budget. Locks are released by the OS if a process exits. Empty `.lock` files (one
byte on Windows) remain intentionally: do not delete them while callers run.
Use a local filesystem that supports OS file locking and atomic file replacement;
this is not a distributed coordination mechanism.

## Errors and deliberate reset

Polling timeouts, temporary network errors and failed downloads preserve the task
checkpoint. Provider failures, expired/missing tasks, and malformed checkpoints
also do **not** silently create a replacement paid task. Errors identify the
checkpoint path; accepted-task errors retain `task_id` where available.

To deliberately submit a replacement, stop all callers for this request, inspect
the task with the provider, then remove **only the indicated pending JSON file**
and rerun. This may spend credits again. Do not remove lock files. If saving a
checkpoint itself fails (for example, a full disk), the exception carries the
accepted task ID; preserve it and query the provider before retrying.

## Scope and limits

Recovery starts once an accepted task ID has been successfully checkpointed.
A lost creation response or a crash before checkpoint publication remains an
ambiguous submission. The existing HTTP client's creation-POST retries are
unchanged; provider idempotency support needs separate investigation. This change
does not guarantee exactly-once billing, recover Meshy multi-stage tasks, or add
budget limits. Power-loss durability of directory entries is filesystem-dependent.

Offline validation (no credentials, network, GPU, or paid generation):

```sh
python test/test_tripo_recovery.py
python test/test_api_3d_object.py
```

The existing operator integration tests additionally need `trimesh`, alongside
the harness's Pillow, NumPy and SciPy dependencies.
