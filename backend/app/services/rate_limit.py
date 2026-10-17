"""Tiny in-process sliding-window rate limiter.

Suitable for a single-process deployment. For multi-worker deployments swap the
backing store for Redis while keeping the same interface.
"""
import time
from collections import defaultdict, deque
from threading import Lock

_lock = Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, max_events: int, window_seconds: int = 60) -> bool:
    """Return True if the action is allowed, False if the limit is exceeded."""
    now = time.monotonic()
    with _lock:
        bucket = _buckets[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_events:
            return False
        bucket.append(now)
        return True


def reset(key: str) -> None:
    with _lock:
        _buckets.pop(key, None)
