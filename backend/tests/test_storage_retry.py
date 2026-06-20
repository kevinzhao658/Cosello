"""Unit tests for the transient-retry logic in services/storage.py.

Covers mint_signed_upload_url and upload_image via _with_transient_retry.
All tests monkeypatch time.sleep to a no-op so backoff delays don't slow
the suite. No network traffic is made; _get_client() is also patched out.
"""
from __future__ import annotations

import errno
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import httpx
import pytest

# Ensure the backend root is on sys.path (mirrors conftest.py pattern).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services import storage
from services.storage import _with_transient_retry, _is_transient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _eagain_error() -> BlockingIOError:
    return BlockingIOError(errno.EAGAIN, "Resource temporarily unavailable")


def _make_storage_bucket_mock(side_effects: list):
    """Return a mock _get_client() whose .storage.from_().create_signed_upload_url()
    raises/returns each element of side_effects in order.
    """
    bucket_mock = MagicMock()
    bucket_mock.create_signed_upload_url.side_effect = side_effects
    storage_mock = MagicMock()
    storage_mock.from_.return_value = bucket_mock
    client_mock = MagicMock()
    client_mock.storage = storage_mock
    return client_mock, bucket_mock


def _make_upload_bucket_mock(side_effects: list):
    """Like _make_storage_bucket_mock but targeting the .upload() method."""
    bucket_mock = MagicMock()
    bucket_mock.upload.side_effect = side_effects
    storage_mock = MagicMock()
    storage_mock.from_.return_value = bucket_mock
    client_mock = MagicMock()
    client_mock.storage = storage_mock
    return client_mock, bucket_mock


# ---------------------------------------------------------------------------
# _is_transient unit tests
# ---------------------------------------------------------------------------

class TestIsTransient:
    def test_eagain_blocking_io_error(self):
        assert _is_transient(BlockingIOError(errno.EAGAIN, "would block"))

    def test_eagain_os_error(self):
        assert _is_transient(OSError(errno.EAGAIN, "would block"))

    def test_non_eagain_os_error(self):
        assert not _is_transient(OSError(errno.ENOENT, "no such file"))

    def test_httpx_connect_error(self):
        assert _is_transient(httpx.ConnectError("conn refused"))

    def test_httpx_read_error(self):
        assert _is_transient(httpx.ReadError("read failed"))

    def test_httpx_pool_timeout(self):
        assert _is_transient(httpx.PoolTimeout("pool full"))

    def test_httpx_connect_timeout(self):
        assert _is_transient(httpx.ConnectTimeout("timeout"))

    def test_value_error_not_transient(self):
        assert not _is_transient(ValueError("bad input"))

    def test_runtime_error_not_transient(self):
        assert not _is_transient(RuntimeError("env not set"))

    def test_http_status_error_not_transient(self):
        resp = MagicMock()
        resp.status_code = 401
        assert not _is_transient(httpx.HTTPStatusError("401", request=MagicMock(), response=resp))


# ---------------------------------------------------------------------------
# _with_transient_retry unit tests
# ---------------------------------------------------------------------------

class TestWithTransientRetry:
    def test_succeeds_on_first_attempt(self, monkeypatch):
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        fn = MagicMock(return_value="ok")
        result = _with_transient_retry(fn)
        assert result == "ok"
        fn.assert_called_once()

    def test_retries_eagain_once_then_succeeds(self, monkeypatch):
        """EAGAIN on the first call; second call succeeds. Returns the success value."""
        sleep_calls: list[float] = []
        monkeypatch.setattr(storage.time, "sleep", lambda d: sleep_calls.append(d))

        call_count = 0
        def _fn():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise _eagain_error()
            return "success"

        result = _with_transient_retry(_fn)
        assert result == "success"
        assert call_count == 2
        assert sleep_calls == [0.1]  # first retry delay

    def test_exhausts_all_retries_raises_last_transient(self, monkeypatch):
        """Persistent EAGAIN exhausts all retries and re-raises the last exception."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)

        def _fn():
            raise _eagain_error()

        with pytest.raises(BlockingIOError) as exc_info:
            _with_transient_retry(_fn)
        assert exc_info.value.errno == errno.EAGAIN

    def test_total_attempt_count_on_exhaustion(self, monkeypatch):
        """Exactly 4 attempts are made before giving up (1 + 3 retries)."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        call_count = 0

        def _fn():
            nonlocal call_count
            call_count += 1
            raise _eagain_error()

        with pytest.raises(BlockingIOError):
            _with_transient_retry(_fn)
        assert call_count == 4

    def test_non_transient_error_not_retried(self, monkeypatch):
        """A ValueError is immediately re-raised; fn() is called exactly once."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        call_count = 0

        def _fn():
            nonlocal call_count
            call_count += 1
            raise ValueError("bad input — do not retry")

        with pytest.raises(ValueError, match="bad input"):
            _with_transient_retry(_fn)
        assert call_count == 1

    def test_httpx_connect_error_retried(self, monkeypatch):
        """httpx.ConnectError is treated as transient; succeeds on second attempt."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        call_count = 0

        def _fn():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("transient TCP error")
            return "done"

        result = _with_transient_retry(_fn)
        assert result == "done"
        assert call_count == 2

    def test_sleep_delays_are_correct_sequence(self, monkeypatch):
        """sleep is called with 0.1, 0.2, 0.4 before the final exhausted raise."""
        sleep_calls: list[float] = []
        monkeypatch.setattr(storage.time, "sleep", lambda d: sleep_calls.append(d))

        def _fn():
            raise _eagain_error()

        with pytest.raises(BlockingIOError):
            _with_transient_retry(_fn)
        assert sleep_calls == [0.1, 0.2, 0.4]


# ---------------------------------------------------------------------------
# mint_signed_upload_url integration tests (mocked _get_client)
# ---------------------------------------------------------------------------

class TestMintSignedUploadUrl:
    def test_eagain_once_then_returns_url(self, monkeypatch):
        """One EAGAIN then a valid result returns the expected dict without raising."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        monkeypatch.setattr(storage, "SUPABASE_URL" if hasattr(storage, "SUPABASE_URL") else "_client",
                            None, raising=False)

        client_mock, bucket_mock = _make_storage_bucket_mock([
            _eagain_error(),
            {"signed_url": "https://supabase.fake/signed/abc123"},
        ])
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        result = storage.mint_signed_upload_url("listings", "user-1", "jpg")
        assert result["upload_url"] == "https://supabase.fake/signed/abc123"
        assert "public_url" in result
        assert "path" in result
        assert bucket_mock.create_signed_upload_url.call_count == 2

    def test_persistent_eagain_raises_http_502(self, monkeypatch):
        """Persistent EAGAIN across all retries raises HTTPException 502 with the
        expected message prefix."""
        from fastapi import HTTPException

        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock, bucket_mock = _make_storage_bucket_mock(
            [_eagain_error()] * 10  # more than enough for all attempts
        )
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        with pytest.raises(HTTPException) as exc_info:
            storage.mint_signed_upload_url("listings", "user-1", "jpg")
        assert exc_info.value.status_code == 502
        assert "Failed to mint signed upload URL" in exc_info.value.detail
        # Exactly 4 total attempts
        assert bucket_mock.create_signed_upload_url.call_count == 4

    def test_non_transient_error_surfaces_immediately_as_502(self, monkeypatch):
        """A non-transient exception (e.g. RuntimeError from auth failure) is NOT
        retried and is wrapped in HTTPException 502 immediately."""
        from fastapi import HTTPException

        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock, bucket_mock = _make_storage_bucket_mock(
            [RuntimeError("supabase: invalid api key")]
        )
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        with pytest.raises(HTTPException) as exc_info:
            storage.mint_signed_upload_url("listings", "user-1", "jpg")
        assert exc_info.value.status_code == 502
        # Called exactly once — no retries for non-transient errors
        assert bucket_mock.create_signed_upload_url.call_count == 1

    def test_invalid_category_raises_value_error_immediately(self, monkeypatch):
        """ValueError from category validation propagates before any storage call."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock = MagicMock()
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)

        with pytest.raises(ValueError, match="category must be one of"):
            storage.mint_signed_upload_url("invalid_category", "user-1", "jpg")
        client_mock.storage.from_.assert_not_called()


# ---------------------------------------------------------------------------
# upload_image integration tests (mocked _get_client)
# ---------------------------------------------------------------------------

class TestUploadImage:
    def test_eagain_once_then_succeeds(self, monkeypatch):
        """One EAGAIN on .upload() is retried; the public URL is returned on success."""
        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock, bucket_mock = _make_upload_bucket_mock([
            _eagain_error(),
            None,  # success (upload returns None on success in supabase-py)
        ])
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        url = storage.upload_image("listings", "user-1", b"\x89PNG\r\n", "png")
        assert url.startswith("https://supabase.fake/storage/v1/object/public/cosello-images/")
        assert bucket_mock.upload.call_count == 2

    def test_persistent_eagain_raises_http_502(self, monkeypatch):
        """Persistent EAGAIN exhausts retries and raises HTTPException 502."""
        from fastapi import HTTPException

        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock, bucket_mock = _make_upload_bucket_mock([_eagain_error()] * 10)
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        with pytest.raises(HTTPException) as exc_info:
            storage.upload_image("listings", "user-1", b"bytes", "jpg")
        assert exc_info.value.status_code == 502
        assert "Supabase Storage upload failed" in exc_info.value.detail
        assert bucket_mock.upload.call_count == 4

    def test_non_transient_error_not_retried(self, monkeypatch):
        """A non-transient exception on upload is not retried (call_count == 1)."""
        from fastapi import HTTPException

        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        client_mock, bucket_mock = _make_upload_bucket_mock([RuntimeError("forbidden")])
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        with pytest.raises(HTTPException) as exc_info:
            storage.upload_image("listings", "user-1", b"bytes", "jpg")
        assert exc_info.value.status_code == 502
        assert bucket_mock.upload.call_count == 1


# ---------------------------------------------------------------------------
# Semaphore concurrency-cap tests
# ---------------------------------------------------------------------------

class TestMintSemaphoreCap:
    """Assert that _mint_semaphore bounds observed in-flight concurrency to
    _MINT_CONCURRENCY even when more threads call mint_signed_upload_url
    simultaneously.

    Strategy: monkeypatch create_signed_upload_url to record the peak
    concurrent count (incrementing before a short real sleep, decrementing
    after). Spin up THREAD_COUNT > _MINT_CONCURRENCY threads all calling
    mint_signed_upload_url at once, then assert peak <= _MINT_CONCURRENCY.

    We use a real threading.Event for a starting-gun so threads are as
    simultaneous as possible. The sleep inside the mock is intentionally
    small (10 ms) to keep the test fast while still giving concurrent
    threads time to overlap.
    """

    THREAD_COUNT = storage._MINT_CONCURRENCY * 3  # e.g. 15 threads vs cap of 5

    def test_mint_peak_concurrency_bounded(self, monkeypatch):
        from services.storage import _MINT_CONCURRENCY as CAP

        monkeypatch.setattr(storage.time, "sleep", lambda _: None)
        monkeypatch.setenv("SUPABASE_URL", "https://supabase.fake")

        # Shared counters (GIL-safe int reads/writes are atomic enough here;
        # we use a Lock for correctness on the peak check).
        counter_lock = threading.Lock()
        in_flight = 0
        peak = 0

        def _fake_create_signed_upload_url(_path):
            nonlocal in_flight, peak
            with counter_lock:
                in_flight += 1
                if in_flight > peak:
                    peak = in_flight
            time.sleep(0.01)  # real sleep so threads actually overlap
            with counter_lock:
                in_flight -= 1
            return {"signed_url": "https://supabase.fake/signed/fake"}

        # Build a client mock whose create_signed_upload_url uses our counter.
        bucket_mock = MagicMock()
        bucket_mock.create_signed_upload_url.side_effect = _fake_create_signed_upload_url
        storage_mock = MagicMock()
        storage_mock.from_.return_value = bucket_mock
        client_mock = MagicMock()
        client_mock.storage = storage_mock
        monkeypatch.setattr(storage, "_get_client", lambda: client_mock)

        # Reset the module-level semaphore to a fresh instance so any
        # leftover state from other tests doesn't influence this one.
        monkeypatch.setattr(
            storage,
            "_mint_semaphore",
            threading.BoundedSemaphore(CAP),
        )

        errors: list[Exception] = []
        start_gun = threading.Event()

        def _worker():
            start_gun.wait()  # block until all threads are ready
            try:
                storage.mint_signed_upload_url("listings", "user-1", "jpg")
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=_worker) for _ in range(self.THREAD_COUNT)]
        for t in threads:
            t.start()
        start_gun.set()  # release all threads simultaneously
        for t in threads:
            t.join(timeout=10)

        assert not errors, f"Worker threads raised exceptions: {errors}"
        assert peak <= CAP, (
            f"Peak concurrent in-flight ({peak}) exceeded semaphore cap ({CAP})"
        )
        # Sanity: we actually had more threads than the cap — otherwise the
        # test wouldn't exercise the bounding logic at all.
        assert self.THREAD_COUNT > CAP
