"""Offline regressions for the real production Rules verifier. No cloud calls."""

from copy import deepcopy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import verify_deployed_rules as verifier


PROJECT = "demo-tropos"
RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"
RULESET = f"projects/{PROJECT}/rulesets/rules-123"
CONTENT = b"rules_version = '2';\nservice cloud.firestore {}\n"


class RulesVerificationTest(unittest.TestCase):
    def setUp(self):
        self.release = {"name": RELEASE, "rulesetName": RULESET, "updateTime": "2026-09-07T09:00:00Z"}
        self.ruleset = {"name": RULESET, "source": {"files": [{"name": "firestore.rules", "content": CONTENT.decode()}]}}
        self.calls = []

    def read(self, name):
        self.calls.append(name)
        return deepcopy(self.ruleset if name == RULESET else self.release)

    def verify(self):
        return verifier.verify_release(self.read, PROJECT, "cloud.firestore", CONTENT)

    def test_exact_source_match_reads_active_release_twice(self):
        result = self.verify()
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["expectedSha256"], result["deployedSha256"])
        self.assertEqual(self.calls, [RELEASE, RULESET, RELEASE])

    def test_different_active_source_fails_even_with_same_name(self):
        self.ruleset["source"]["files"][0]["content"] += "// changed\n"
        result = self.verify()
        self.assertEqual(result["status"], "mismatch")
        self.assertNotEqual(result["expectedSha256"], result["deployedSha256"])

    def test_crlf_difference_is_not_normalised_away(self):
        self.ruleset["source"]["files"][0]["content"] = CONTENT.decode().replace("\n", "\r\n")
        self.assertEqual(self.verify()["status"], "mismatch")

    def test_missing_or_extra_source_file_cannot_pass(self):
        for files in [[], [{"name": "firestore.rules"}], [self.ruleset["source"]["files"][0], {"content": "extra"}], None]:
            with self.subTest(files=files):
                self.ruleset["source"]["files"] = files
                with self.assertRaises(verifier.VerificationError):
                    self.verify()

    def test_foreign_or_malformed_ruleset_never_gets_requested(self):
        for name in ["projects/other/rulesets/123", "https://evil.invalid/token", RULESET + "?token=x", None]:
            with self.subTest(name=name):
                self.calls.clear()
                self.release["rulesetName"] = name
                with self.assertRaisesRegex(verifier.VerificationError, "unexpected-ruleset"):
                    self.verify()
                self.assertEqual(self.calls, [RELEASE])

    def test_response_identity_must_match(self):
        self.ruleset["name"] = "projects/other/rulesets/123"
        with self.assertRaisesRegex(verifier.VerificationError, "unexpected-ruleset"):
            self.verify()

    def test_release_change_during_verification_is_not_a_pass(self):
        def read(name):
            data = self.read(name)
            if len(self.calls) == 3:
                data["rulesetName"] = RULESET + "-new"
            return data
        with self.assertRaisesRegex(verifier.VerificationError, "release-changed-during-check"):
            verifier.verify_release(read, PROJECT, "cloud.firestore", CONTENT)

    def test_one_service_access_failure_still_checks_other_service(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "firebase.json").write_text(json.dumps({k: {"rules": f"{k}.rules"} for k in ["firestore", "storage"]}))
            for kind in ["firestore", "storage"]:
                (root / f"{kind}.rules").write_bytes(CONTENT)
            storage_release = f"projects/{PROJECT}/releases/firebase.storage/demo-tropos.appspot.com"
            def read(name):
                if name == RELEASE:
                    raise verifier.VerificationError("http-403")
                if name == storage_release:
                    return {**self.release, "name": storage_release}
                return self.ruleset
            result = verifier.check_services(read, PROJECT, "all", "demo-tropos.appspot.com", root)
            self.assertEqual([r["status"] for r in result], ["unverified", "match"])
            self.assertEqual(result[0]["reason"], "http-403")

    def test_missing_bucket_does_not_guess_another_bucket(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "firebase.json").write_text('{}')
            result = verifier.check_services(self.read, PROJECT, "storage", "", root)
            self.assertEqual(result[0]["reason"], "missing-or-invalid-storage-bucket")
            self.assertEqual(self.calls, [])

    def test_source_path_comes_from_firebase_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "firebase.json").write_text('{"firestore":{"rules":"custom.rules"}}')
            (root / "custom.rules").write_bytes(CONTENT)
            result = verifier.check_services(self.read, PROJECT, "firestore", "", root)
            self.assertEqual(result[0]["status"], "match")

    def test_http_reader_uses_get_and_does_not_print_server_error_body(self):
        secret = "never-print-this-token"
        with patch.object(verifier.urllib.request, "build_opener") as build:
            build.return_value.open.side_effect = urllib.error.HTTPError(
                verifier.API, 403, secret, {}, io.BytesIO(secret.encode())
            )
            with self.assertRaisesRegex(verifier.VerificationError, "^http-403$"):
                verifier.make_reader(secret)(RELEASE)
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "GET")
            self.assertIsNone(request.data)
            self.assertEqual(request.full_url, verifier.API + RELEASE)

    def test_redirects_are_refused(self):
        with self.assertRaisesRegex(verifier.VerificationError, "unexpected-redirect"):
            verifier.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.invalid")

    def test_cli_failure_exit_for_mismatch_and_unknown_status(self):
        for status, expected in [("match", 0), ("mismatch", 1), ("unverified", 1)]:
            with self.subTest(status=status), patch.object(verifier.subprocess, "check_output", return_value="secret"), patch.object(verifier, "check_services", return_value=[{"service": "firestore", "status": status}]), patch.dict(verifier.os.environ, {"GITHUB_STEP_SUMMARY": ""}), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(verifier.main(["--service", "firestore"]), expected)
                self.assertNotIn("secret", output.getvalue())

    def test_cli_authentication_failure_is_sanitised(self):
        with patch.object(verifier.subprocess, "check_output", side_effect=verifier.subprocess.CalledProcessError(1, "gcloud", stderr="secret")), contextlib.redirect_stderr(io.StringIO()) as output:
            self.assertEqual(verifier.main([]), 1)
            self.assertNotIn("secret", output.getvalue())


if __name__ == "__main__":
    unittest.main()
