"""Offline recovery regressions: python test/test_tripo_recovery.py."""
from __future__ import annotations

from contextlib import contextmanager
import json
import multiprocessing
import os
from pathlib import Path
import queue
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_api_3d_object import (FakeClient, TRIPO_SCRIPT, make_tripo, stubs,
                                cloud_api)
from models.common.task_recovery import PendingTaskStore


class RecoveryClient(FakeClient):
    def __init__(self, *, state="success", download_error=False):
        super().__init__(TRIPO_SCRIPT, stubs.make_minimal_glb(triangles=3))
        self.state = state
        self.download_error = download_error

    def request(self, method, path, **kwargs):
        response = super().request(method, path, **kwargs)
        if path.startswith("/tasks/"):
            if self.state == "missing":
                raise cloud_api.CloudAPIRequestError("missing", status=404)
            if self.state == "network":
                raise cloud_api.CloudAPIServerError("connection lost")
            response = {**response, "data": {**response["data"], "status": self.state}}
        return response

    def download(self, url, **kwargs):
        if self.download_error:
            raise cloud_api.CloudAPIServerError("download failed")
        return super().download(url, **kwargs)


def build(root, **kwargs):
    state = kwargs.pop("state", "success")
    download_error = kwargs.pop("download_error", False)
    model = make_tripo(cache_dir=root, timeout=0, **kwargs)
    model._client = RecoveryClient(state=state, download_error=download_error)
    return model


def checkpoints(root):
    return list(Path(root).glob("tripo/pending/*.json"))


def concurrent_worker(root, attempted, downloading, release, calls, results):
    """Spawn-safe worker using real filesystem locks and a fake provider."""
    original = PendingTaskStore.lock

    @contextmanager
    def observed_lock(self, **kwargs):
        attempted.set()
        with original(self, **kwargs):
            yield

    model = build(root)
    model.timeout = 10
    original_request = model._client.request
    original_download = model._client.download

    def request(method, path, **kwargs):
        calls.put((method, path))
        return original_request(method, path, **kwargs)

    def download(url, **kwargs):
        downloading.set()
        if not release.wait(10):
            raise RuntimeError("test release timeout")
        return original_download(url, **kwargs)

    model._client.request = request
    model._client.download = download
    try:
        with patch.object(PendingTaskStore, "lock", observed_lock):
            data = model.infer(prompt="a chair")
        results.put((len(data), model.last_call_info["cached"]))
    except Exception as exc:
        results.put(("error", repr(exc)))


def hold_lock(root, ready):
    store = PendingTaskStore(Path(root), "crash")
    with store.lock(timeout=2):
        ready.set()
        # Parent terminates us to exercise kernel cleanup, not normal finally.
        multiprocessing.Event().wait(30)


def crash_after_checkpoint(root):
    model = build(root)
    original = model._client.request

    def request(method, path, **kwargs):
        with (Path(root) / "requests.log").open("a", encoding="utf-8") as handle:
            handle.write(f"{method} {path}\n")
        if path.startswith("/tasks/"):
            os._exit(17)
        return original(method, path, **kwargs)

    model._client.request = request
    model.infer(prompt="a chair")


class TestTripoRecovery(unittest.TestCase):
    def create_pending(self, root, **kwargs):
        model = build(root, state="running", **kwargs)
        with self.assertRaises(cloud_api.CloudTaskTimeout):
            model.infer(image=stubs.make_ref_image())
        self.assertEqual(len(checkpoints(root)), 1)
        return model

    def test_timeout_new_instance_resumes_without_post_or_upload(self):
        with tempfile.TemporaryDirectory() as root:
            first = self.create_pending(root)
            record = json.loads(checkpoints(root)[0].read_text())
            self.assertEqual(record["task_id"], "tripo_task_1")
            second = build(root)
            data = second.infer(image=stubs.make_ref_image())
            self.assertTrue(data)
            self.assertEqual(second._client.requests, ["GET /tasks/tripo_task_1"])
            self.assertEqual(sum(r.startswith("POST /generation")
                                 for r in first._client.requests + second._client.requests), 1)
            self.assertTrue(second.last_call_info["resumed"])
            self.assertFalse(second.last_call_info["cached"])
            self.assertEqual(checkpoints(root), [])
            third = build(root)
            self.assertEqual(third.infer(image=stubs.make_ref_image()), data)
            self.assertEqual(third._client.requests, [])
            self.assertEqual(third._client.downloads, [])

    def test_download_failure_resumes_task_and_fetches_fresh_url(self):
        with tempfile.TemporaryDirectory() as root:
            first = build(root, download_error=True)
            with self.assertRaises(cloud_api.CloudAPIServerError) as ctx:
                first.infer(prompt="a chair")
            self.assertEqual(ctx.exception.task_id, "tripo_task_1")
            second = build(root)
            second._client.script = {**TRIPO_SCRIPT, "/tasks/": {
                "data": {"status": "success", "output": {"model_url": "https://fresh.example/a.glb"}}
            }}
            second.infer(prompt="a chair")
            self.assertEqual(second._client.requests, ["GET /tasks/tripo_task_1"])
            self.assertEqual(second._client.downloads, ["https://fresh.example/a.glb"])

    def test_same_instance_uses_the_credentials_held_by_its_client(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root, state="running")
            model._client._api_key = "original-client-key"
            with self.assertRaises(cloud_api.CloudTaskTimeout):
                model.infer(prompt="a chair")
            model.api_key = "changed-key-not-used-by-client"
            model._client.state = "success"
            model._client.requests.clear()
            model.infer(prompt="a chair")
            self.assertEqual(model._client.requests, ["GET /tasks/tripo_task_1"])

    def test_completed_submit_response_is_checkpointed_before_download(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            task = TRIPO_SCRIPT["/tasks/"]
            model._client.script = {"/generation/text-to-model": task}
            original_download = model._client.download

            def download(url, **kwargs):
                self.assertEqual(len(checkpoints(root)), 1)
                return original_download(url, **kwargs)

            model._client.download = download
            model.infer(prompt="a chair")
            self.assertEqual(model._client.requests, ["POST /generation/text-to-model"])
            self.assertEqual(checkpoints(root), [])

    def test_terminal_missing_and_network_errors_never_resubmit(self):
        for state, error in (("failed", cloud_api.CloudTaskFailed),
                             ("missing", cloud_api.CloudAPIRequestError),
                             ("network", cloud_api.CloudAPIServerError)):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as root:
                self.create_pending(root)
                for _ in range(2):
                    model = build(root, state=state)
                    with self.assertRaises(error) as ctx:
                        model.infer(image=stubs.make_ref_image())
                    self.assertEqual(ctx.exception.task_id, "tripo_task_1")
                    self.assertIn(str(checkpoints(root)[0]), str(ctx.exception))
                    self.assertEqual(model._client.requests, ["GET /tasks/tripo_task_1"])

    def test_invalid_checkpoint_blocks_submission(self):
        for contents in ("{", "[]", '{"version": 1, "scope": "other", "task_id": "id"}'):
            with self.subTest(contents=contents), tempfile.TemporaryDirectory() as root:
                self.create_pending(root)
                checkpoints(root)[0].write_text(contents)
                model = build(root)
                with self.assertRaises(cloud_api.CloudAPIError):
                    model.infer(image=stubs.make_ref_image())
                self.assertEqual(model._client.requests, [])

    def test_scope_separates_account_and_api_base_and_parameters(self):
        with tempfile.TemporaryDirectory() as root:
            self.create_pending(root)
            original = checkpoints(root)[0]
            for kwargs in ({"api_key": "another-account"},
                           {"api_base": "https://different.example/v3"}):
                # Construct directly since make_tripo supplies its own api_key.
                from models.gen_3d_object.tripo_model import TripoModel
                model = TripoModel(cache_dir=root, timeout=0,
                                   **{"api_key": "test-key", **kwargs})
                model._client = RecoveryClient(state="running")
                with self.assertRaises(cloud_api.CloudTaskTimeout):
                    model.infer(image=stubs.make_ref_image())
                self.assertTrue(any(r.startswith("POST /generation") for r in model._client.requests))
            model = build(root, state="running")
            with self.assertRaises(cloud_api.CloudTaskTimeout):
                model.infer(image=stubs.make_ref_image(), seed=43)
            self.assertEqual(len(checkpoints(root)), 4)
            self.assertTrue(original.exists())
            for path in checkpoints(root):
                content = path.read_text()
                self.assertNotIn("test-key", content)
                self.assertNotIn("another-account", content)
                self.assertNotIn("https://", content)
                self.assertEqual(set(json.loads(content)), {"version", "scope", "task_id", "created_at"})

    def test_disabled_cache_keeps_no_recovery_behavior(self):
        first = build(None, state="running")
        with self.assertRaises(cloud_api.CloudTaskTimeout):
            first.infer(prompt="a chair")
        second = build(None)
        second.infer(prompt="a chair")
        self.assertTrue(any(r.startswith("POST /generation") for r in second._client.requests))
        self.assertFalse(second.last_call_info["resumed"])

    def test_checkpoint_write_error_preserves_accepted_id(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            with patch("models.common.task_recovery._atomic_write", side_effect=OSError("disk full")):
                with self.assertRaises(cloud_api.CloudAPIError) as ctx:
                    model.infer(prompt="a chair")
            self.assertEqual(ctx.exception.task_id, "tripo_task_1")
            self.assertNotIn("GET /tasks/tripo_task_1", model._client.requests)

    def test_cache_write_failure_keeps_recoverable_checkpoint(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            with patch.object(model._cache, "put", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    model.infer(prompt="a chair")
            self.assertEqual(len(checkpoints(root)), 1)
            second = build(root)
            second.infer(prompt="a chair")
            self.assertEqual(second._client.requests, ["GET /tasks/tripo_task_1"])

    def test_two_processes_create_one_task_and_one_completed_cache(self):
        ctx = multiprocessing.get_context("spawn")
        with tempfile.TemporaryDirectory() as root:
            attempted1, attempted2 = ctx.Event(), ctx.Event()
            downloading, release = ctx.Event(), ctx.Event()
            calls, results = ctx.Queue(), ctx.Queue()
            processes = [ctx.Process(target=concurrent_worker, args=(
                root, attempted, downloading, release, calls, results))
                for attempted in (attempted1, attempted2)]
            try:
                processes[0].start()
                self.assertTrue(downloading.wait(10))
                requests = [calls.get(timeout=2), calls.get(timeout=2)]
                processes[1].start()
                self.assertTrue(attempted2.wait(10))
                # The first worker is deliberately held in download. The other
                # must issue no provider request and cannot return until release.
                with self.assertRaises(queue.Empty):
                    calls.get(timeout=0.3)
                with self.assertRaises(queue.Empty):
                    results.get(timeout=0.3)
                release.set()
                for process in processes:
                    process.join(15)
                    self.assertEqual(process.exitcode, 0)
                responses = [results.get(timeout=2), results.get(timeout=2)]
                self.assertTrue(all(isinstance(r[0], int) and r[0] > 0 for r in responses), responses)
                self.assertEqual(sorted(r[1] for r in responses), [False, True])
                self.assertEqual(requests, [("POST", "/generation/text-to-model"),
                                            ("GET", "/tasks/tripo_task_1")])
                with self.assertRaises(queue.Empty):
                    calls.get(timeout=0.1)
                self.assertEqual(checkpoints(root), [])
            finally:
                release.set()
                for process in processes:
                    if process.is_alive():
                        process.terminate()
                        process.join(5)
                calls.close()
                results.close()

    def test_crashed_generation_process_is_resumed_by_new_process_owner(self):
        ctx = multiprocessing.get_context("spawn")
        with tempfile.TemporaryDirectory() as root:
            process = ctx.Process(target=crash_after_checkpoint, args=(root,))
            process.start()
            try:
                process.join(15)
                self.assertEqual(process.exitcode, 17)
                self.assertEqual(len(checkpoints(root)), 1)
                second = build(root)
                second.infer(prompt="a chair")
                self.assertEqual(second._client.requests, ["GET /tasks/tripo_task_1"])
                self.assertTrue(second.last_call_info["resumed"])
                self.assertEqual((Path(root) / "requests.log").read_text().splitlines(),
                                 ["POST /generation/text-to-model", "GET /tasks/tripo_task_1"])
            finally:
                if process.is_alive():
                    process.terminate()
                    process.join(5)

    def test_lock_times_out_then_releases_on_process_crash(self):
        ctx = multiprocessing.get_context("spawn")
        with tempfile.TemporaryDirectory() as root:
            ready = ctx.Event()
            process = ctx.Process(target=hold_lock, args=(root, ready))
            process.start()
            try:
                self.assertTrue(ready.wait(10))
                store = PendingTaskStore(Path(root), "crash")
                with self.assertRaises(cloud_api.CloudAPIError):
                    with store.lock(timeout=0):
                        self.fail("acquired a held lock")
                process.terminate()
                process.join(5)
                with store.lock(timeout=1):
                    store.save("survived")
                    self.assertEqual(store.load(), "survived")
            finally:
                if process.is_alive():
                    process.terminate()
                    process.join(5)


class TestAtomicCache(unittest.TestCase):
    def test_checkpoint_cleanup_failure_does_not_lose_completed_cache(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            with patch.object(PendingTaskStore, "clear", side_effect=OSError("busy")):
                data = model.infer(prompt="a chair")
            self.assertEqual(len(checkpoints(root)), 1)
            second = build(root)
            self.assertEqual(second.infer(prompt="a chair"), data)
            self.assertEqual(second._client.requests, [])

    def test_failed_publication_cannot_expose_partial_blob_and_task_can_resume(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            original = os.replace

            def replace(source, destination):
                if Path(destination).suffix == ".glb":
                    raise OSError("interrupted publication")
                return original(source, destination)

            with patch.object(cloud_api.os, "replace", side_effect=replace):
                with self.assertRaises(OSError):
                    model.infer(prompt="a chair")
            self.assertEqual(list(Path(root).glob("tripo/*.glb")), [])
            self.assertEqual(len(checkpoints(root)), 1)
            self.assertEqual(list(Path(root).glob("tripo/tmp*")), [])
            second = build(root)
            second.infer(prompt="a chair")
            self.assertEqual(second._client.requests, ["GET /tasks/tripo_task_1"])

    def test_legacy_completed_cache_remains_a_zero_network_hit(self):
        with tempfile.TemporaryDirectory() as root:
            model = build(root)
            data = model.infer(prompt="a chair")
            # Recreate the legacy direct-write blob layout without a checkpoint.
            key = model.last_call_info["cache_key"]
            blob = Path(root) / "tripo" / f"{key}.glb"
            blob.write_bytes(data)
            (blob.parent / f"{key}.meta.json").unlink()
            other = build(root)
            other.api_key = None
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(other.infer(prompt="a chair"), data)
            self.assertEqual(other._client.requests, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
