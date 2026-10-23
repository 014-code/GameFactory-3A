"""Durable accepted-task checkpoints and process locks (no third-party deps)."""
from __future__ import annotations

from contextlib import contextmanager
import errno
import json
import os
from pathlib import Path
import time

from .cloud_api import CloudAPIError, _atomic_write


class PendingTaskStore:
    """One opaque request/account scope; callers must hold ``lock`` throughout.

    Lock files are intentionally retained: unlinking one while another process
    holds it would let a third process lock a different inode. OS locks are
    released on process exit, including a crash.
    """

    def __init__(self, root: Path, key: str):
        self.key = key
        self.path = root / "pending" / f"{key}.json"
        self.lock_path = self.path.with_suffix(".lock")

    def _error(self, detail: str, *, task_id: str | None = None) -> CloudAPIError:
        return CloudAPIError(
            f"{detail}. Checkpoint: {self.path}. Keep this file to recover the "
            "existing task; remove it only to explicitly allow a new paid task.",
            task_id=task_id,
        )

    @contextmanager
    def lock(self, *, timeout: float):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a+b") as handle:
            # msvcrt locks a byte range; ensure the first byte exists.
            if os.name == "nt":
                import msvcrt

                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()
            else:
                import fcntl

            deadline = time.monotonic() + timeout
            while True:
                try:
                    handle.seek(0)
                    if os.name == "nt":
                        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError as exc:
                    if exc.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                        raise
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise self._error("Timed out waiting for another caller") from exc
                    time.sleep(min(0.05, remaining))
            try:
                yield
            finally:
                handle.seek(0)
                if os.name == "nt":
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def load(self) -> str | None:
        try:
            record = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, ValueError) as exc:
            raise self._error("Cannot read accepted-task checkpoint") from exc
        if (not isinstance(record, dict) or record.get("version") != 1
                or record.get("scope") != self.key
                or not isinstance(record.get("task_id"), str)
                or not record["task_id"].strip()):
            raise self._error("Invalid accepted-task checkpoint")
        return record["task_id"]

    def save(self, task_id: str) -> None:
        record = {"version": 1, "scope": self.key, "task_id": task_id,
                  "created_at": time.time()}
        try:
            _atomic_write(self.path, json.dumps(record).encode("utf-8"))
        except OSError as exc:
            raise self._error(
                f"Task {task_id} was accepted but its checkpoint could not be saved; "
                "preserve this task ID before retrying", task_id=task_id,
            ) from exc

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)
