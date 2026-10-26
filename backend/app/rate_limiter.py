import os
import time


class InMemoryRateLimiter:
    """
    In-memory sliding-window rate limiter per user.
    Configurable via RATE_LIMIT_MESSAGES and RATE_LIMIT_WINDOW_SECONDS env variables.
    Defaults to 20 messages per 60 seconds.
    """

    def __init__(
        self,
        max_messages: int | None = None,
        window_seconds: float | None = None,
    ) -> None:
        self._custom_max = max_messages
        self._custom_window = window_seconds
        self._user_timestamps: dict[int, list[float]] = {}

    @property
    def max_messages(self) -> int:
        if self._custom_max is not None:
            return self._custom_max
        try:
            return int(os.getenv("RATE_LIMIT_MESSAGES", "20"))
        except ValueError:
            return 20

    @property
    def window_seconds(self) -> float:
        if self._custom_window is not None:
            return self._custom_window
        try:
            return float(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
        except ValueError:
            return 60.0

    def is_rate_limited(self, user_id: int) -> bool:
        """
        Checks whether user has reached the message rate limit.
        If under limit, records the current timestamp and returns False.
        If at or over limit, returns True without processing.
        """
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = self._user_timestamps.get(user_id, [])

        # Filter out timestamps outside the sliding window
        valid_timestamps = [t for t in timestamps if t > cutoff]

        if len(valid_timestamps) >= self.max_messages:
            self._user_timestamps[user_id] = valid_timestamps
            return True

        valid_timestamps.append(now)
        self._user_timestamps[user_id] = valid_timestamps
        return False

    def reset(self) -> None:
        """Clears all tracked user timestamps (for test isolation)."""
        self._user_timestamps.clear()


limiter = InMemoryRateLimiter()
