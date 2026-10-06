"""Offline regressions for the deployed-functions read-back's retries. No cloud calls."""

import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
import urllib.error

# The script's name has hyphens, so it is loaded by path.
_SPEC = importlib.util.spec_from_file_location(
    "verify_deployed_functions_source",
    Path(__file__).with_name("verify-deployed-functions-source.py"),
)
verifier = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(verifier)


class _Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.body


def _http(code):
    return urllib.error.HTTPError("https://example.invalid", code, "error", {}, None)


class ReadBackRetryTest(unittest.TestCase):
    def setUp(self):
        self.sleeps = []
        self.calls = 0

    def read(self, outcomes):
        """Runs `read` against an opener that answers with `outcomes` in turn."""
        outcomes = list(outcomes)

        def opener(request, timeout):
            self.calls += 1
            outcome = outcomes.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome
            return _Response(outcome)

        with contextlib.redirect_stdout(io.StringIO()):
            return verifier.read("request", 30, opener=opener, sleep=self.sleeps.append)

    def test_a_brief_503_is_tried_again(self):
        self.assertEqual(self.read([_http(503), b"ok"]), b"ok")
        self.assertEqual(self.calls, 2)
        self.assertEqual(self.sleeps, [5])

    def test_rate_limits_timeouts_and_dropped_connections_are_tried_again(self):
        outcomes = [_http(429), urllib.error.URLError("down"), TimeoutError(), b"ok"]
        self.assertEqual(self.read(outcomes), b"ok")
        self.assertEqual(self.sleeps, [5, 15, 45])

    def test_gives_up_after_the_fourth_try(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.read([_http(503)] * 4)
        self.assertEqual(caught.exception.code, 503)
        self.assertEqual(self.calls, 4)
        self.assertEqual(self.sleeps, [5, 15, 45])

    def test_a_refusal_fails_at_once(self):
        for code in (401, 403, 404):
            with self.subTest(code=code):
                self.setUp()
                with self.assertRaises(urllib.error.HTTPError):
                    self.read([_http(code), b"never read"])
                self.assertEqual(self.calls, 1)
                self.assertEqual(self.sleeps, [])

    def test_what_it_prints_names_no_address(self):
        printed = io.StringIO()

        def opener(request, timeout):
            if not printed.getvalue():
                raise _http(503)
            return _Response(b"ok")

        with contextlib.redirect_stdout(printed):
            verifier.read("https://storage.example/signed?token=secret", 60, opener=opener, sleep=lambda _: None)
        self.assertIn("HTTP 503", printed.getvalue())
        self.assertNotIn("token", printed.getvalue())
        self.assertNotIn("https://", printed.getvalue())


if __name__ == "__main__":
    unittest.main()
