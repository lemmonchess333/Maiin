"""Offline regressions for the Storage rules cross-service IAM check. No cloud calls."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import verify_storage_rules_iam as check


PROJECT = "demo-tropos"
NUMBER = "123456789012"
AGENT = f"serviceAccount:service-{NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com"
CROSS_SERVICE_RULES = "function frozen(uid) { return firestore.exists(/databases/(default)/documents/x/$(uid)); }"
PLAIN_RULES = "service firebase.storage { match /b/{bucket}/o { allow read: if false; } }"


class CrossServiceIamTest(unittest.TestCase):
    def setUp(self):
        self.project = {"projectId": PROJECT, "projectNumber": NUMBER}
        self.policy = {"bindings": [{"role": check.ROLE, "members": [AGENT]}]}
        self.calls = []

    def call(self, resource, body=None):
        self.calls.append((resource, body))
        return self.policy if resource.endswith(":getIamPolicy") else self.project

    def run_check(self, source=CROSS_SERVICE_RULES):
        return check.check_cross_service_iam(self.call, PROJECT, source)

    def test_rules_without_firestore_reads_need_nothing_and_call_nothing(self):
        self.assertEqual(self.run_check(PLAIN_RULES), {"status": "not-needed"})
        self.assertEqual(self.calls, [])

    def test_both_cross_service_functions_trigger_the_check(self):
        for source in ["firestore.exists(p)", "firestore.get(p).data.status"]:
            with self.subTest(source=source):
                self.assertEqual(self.run_check(source)["status"], "granted")

    def test_granted_reads_the_project_then_its_version_3_policy(self):
        self.assertEqual(self.run_check(), {"status": "granted", "member": AGENT})
        self.assertEqual(
            self.calls,
            [
                (f"projects/{PROJECT}", None),
                (f"projects/{PROJECT}:getIamPolicy", {"options": {"requestedPolicyVersion": 3}}),
            ],
        )

    def test_missing_when_the_agent_is_not_bound_to_the_role(self):
        other_agent = AGENT.replace(NUMBER, "999999999999")
        for bindings in [
            [],
            [{"role": check.ROLE, "members": [other_agent]}],
            [{"role": "roles/storage.admin", "members": [AGENT]}],
            [{"role": check.ROLE, "members": [AGENT], "condition": {"expression": "false"}}],
            [{"role": check.ROLE}],
        ]:
            with self.subTest(bindings=bindings):
                self.policy = {"bindings": bindings}
                self.assertEqual(self.run_check()["status"], "missing")

    def test_a_policy_with_no_bindings_at_all_is_missing(self):
        self.policy = {}
        self.assertEqual(self.run_check()["status"], "missing")

    def test_an_unconditional_binding_beside_a_conditional_one_is_granted(self):
        self.policy = {
            "bindings": [
                {"role": check.ROLE, "members": [AGENT], "condition": {"expression": "false"}},
                {"role": check.ROLE, "members": ["user:owner@example.com", AGENT]},
            ]
        }
        self.assertEqual(self.run_check()["status"], "granted")

    def test_unexpected_project_response_stops_before_the_policy_read(self):
        for project in [
            {"projectId": "other-project", "projectNumber": NUMBER},
            {"projectId": PROJECT, "projectNumber": 123},
            {"projectId": PROJECT, "projectNumber": "12a"},
            {"projectId": PROJECT},
        ]:
            with self.subTest(project=project):
                self.calls.clear()
                self.project = project
                with self.assertRaisesRegex(check.VerificationError, "^unexpected-project$"):
                    self.run_check()
                self.assertEqual(len(self.calls), 1)

    def test_malformed_bindings_are_not_read_as_a_grant(self):
        self.policy = {"bindings": "roles/firebaserules.firestoreServiceAgent"}
        with self.assertRaisesRegex(check.VerificationError, "^invalid-policy$"):
            self.run_check()

    def test_the_checked_in_storage_rules_need_the_role(self):
        # Anchors the check to the rules it exists for: if storage.rules ever
        # stops reading Firestore, this fails and the check can be retired
        # rather than passing forever as "not-needed".
        self.assertRegex(check.read_storage_rules(), check.CROSS_SERVICE)


class ClientTest(unittest.TestCase):
    def test_only_the_project_and_its_policy_read_are_reachable(self):
        call = check.make_client("token")
        for resource in [
            f"projects/{PROJECT}:setIamPolicy",
            "projects/other/../x",
            f"projects/{PROJECT}?fields=x",
            "https://evil.invalid/projects/demo-tropos",
            f"projects/{PROJECT}:getIamPolicy/extra",
        ]:
            with self.subTest(resource=resource), patch.object(check.urllib.request, "build_opener") as build:
                with self.assertRaisesRegex(check.VerificationError, "^invalid-resource-name$"):
                    check.make_client("token")(resource, {})
                build.return_value.open.assert_not_called()
        with self.assertRaisesRegex(check.VerificationError, "^invalid-request$"):
            call(f"projects/{PROJECT}:getIamPolicy")
        with self.assertRaisesRegex(check.VerificationError, "^invalid-request$"):
            call(f"projects/{PROJECT}", {"options": {}})

    def test_policy_read_is_a_post_and_errors_never_carry_the_body(self):
        secret = "never-print-this-token"
        with patch.object(check.urllib.request, "build_opener") as build:
            build.return_value.open.side_effect = urllib.error.HTTPError(
                check.API, 403, secret, {}, io.BytesIO(secret.encode())
            )
            with self.assertRaisesRegex(check.VerificationError, "^http-403$"):
                check.make_client(secret)(f"projects/{PROJECT}:getIamPolicy", {"options": {"requestedPolicyVersion": 3}})
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.full_url, check.API + f"projects/{PROJECT}:getIamPolicy")
            self.assertEqual(json.loads(request.data), {"options": {"requestedPolicyVersion": 3}})

    def test_a_disabled_api_is_told_apart_from_a_missing_permission(self):
        disabled = b'{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}'
        denied = b'{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"IAM_PERMISSION_DENIED"}]}}'
        for body, reason in [(disabled, "api-disabled"), (denied, "http-403")]:
            with self.subTest(reason=reason), patch.object(check.urllib.request, "build_opener") as build:
                build.return_value.open.side_effect = urllib.error.HTTPError(
                    check.API, 403, "Forbidden", {}, io.BytesIO(body)
                )
                with self.assertRaisesRegex(check.VerificationError, f"^{reason}$"):
                    check.make_client("t")(f"projects/{PROJECT}")

    def test_project_read_is_a_get(self):
        with patch.object(check.urllib.request, "build_opener") as build:
            build.return_value.open.return_value.__enter__.return_value = io.BytesIO(
                json.dumps({"projectId": PROJECT, "projectNumber": NUMBER}).encode()
            )
            self.assertEqual(check.make_client("t")(f"projects/{PROJECT}")["projectNumber"], NUMBER)
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "GET")
            self.assertIsNone(request.data)

    def test_redirects_are_refused(self):
        with self.assertRaisesRegex(check.VerificationError, "unexpected-redirect"):
            check.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.invalid")


class ReadRulesTest(unittest.TestCase):
    def test_source_path_comes_from_firebase_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "firebase.json").write_text('{"storage":{"rules":"custom.rules"}}')
            (root / "custom.rules").write_text(PLAIN_RULES)
            self.assertEqual(check.read_storage_rules(root), PLAIN_RULES)

    def test_a_path_outside_the_checkout_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            root.mkdir()
            (root / "firebase.json").write_text('{"storage":{"rules":"../outside.rules"}}')
            (Path(directory) / "outside.rules").write_text(PLAIN_RULES)
            with self.assertRaisesRegex(check.VerificationError, "source-outside-checkout"):
                check.read_storage_rules(root)


class CliTest(unittest.TestCase):
    def run_main(self, result, source=CROSS_SERVICE_RULES):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary.md"
            with patch.object(check, "read_storage_rules", return_value=source), patch.object(
                check.subprocess, "check_output", return_value="secret-token"
            ) as gcloud, patch.object(check, "check_cross_service_iam", return_value=result), patch.dict(
                check.os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}
            ), contextlib.redirect_stdout(io.StringIO()) as output:
                code = check.main([])
            return code, output.getvalue(), summary.read_text() if summary.exists() else "", gcloud

    def test_exit_codes(self):
        for result, expected in [
            ({"status": "granted", "member": "m"}, 0),
            ({"status": "missing", "member": "m"}, 1),
            ({"status": "unverified", "reason": "http-403"}, 1),
        ]:
            with self.subTest(status=result["status"]):
                code, output, _, _ = self.run_main(result)
                self.assertEqual(code, expected)
                self.assertNotIn("secret-token", output)

    def test_missing_names_the_role_and_the_grant_command(self):
        code, output, summary, _ = self.run_main({"status": "missing", "member": AGENT})
        self.assertEqual(code, 1)
        self.assertIn("::error title=Storage rules cannot read Firestore::", output)
        for text in ["gcloud projects add-iam-policy-binding adaptive-fitness-af8bb", check.ROLE,
                     "gcp-sa-firebasestorage.iam.gserviceaccount.com"]:
            self.assertIn(text, summary)

    def test_unverified_is_a_failure_that_names_the_reason_and_the_read_role(self):
        code, output, summary, _ = self.run_main({"status": "unverified", "reason": "http-403"})
        self.assertEqual(code, 1)
        self.assertIn("::error title=Storage rules permission unconfirmed::", output)
        self.assertIn("http-403", summary)
        self.assertIn("roles/iam.securityReviewer", summary)

    def test_a_disabled_api_gets_the_command_that_enables_it(self):
        code, output, summary, _ = self.run_main({"status": "unverified", "reason": "api-disabled"})
        self.assertEqual(code, 1)
        self.assertIn("Cloud Resource Manager API", output)
        self.assertIn(
            "gcloud services enable cloudresourcemanager.googleapis.com --project adaptive-fitness-af8bb",
            summary,
        )
        self.assertNotIn("securityReviewer", summary)

    def test_rules_without_firestore_reads_skip_credentials(self):
        code, _, summary, gcloud = self.run_main({"status": "granted"}, source=PLAIN_RULES)
        self.assertEqual(code, 0)
        gcloud.assert_not_called()
        self.assertIn("does not read Firestore", summary)

    def test_authentication_failure_is_a_sanitised_failure(self):
        with patch.object(check, "read_storage_rules", return_value=CROSS_SERVICE_RULES), patch.object(
            check.subprocess, "check_output",
            side_effect=check.subprocess.CalledProcessError(1, "gcloud", stderr="secret"),
        ), patch.dict(check.os.environ, {"GITHUB_STEP_SUMMARY": ""}), contextlib.redirect_stdout(
            io.StringIO()
        ) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(check.main([]), 1)
        self.assertIn('"reason": "credentials-unavailable"', output.getvalue())
        self.assertNotIn("secret", output.getvalue() + errors.getvalue())

    def test_bad_local_config_fails_before_any_credentials(self):
        with patch.object(check, "read_storage_rules", side_effect=KeyError("storage")), patch.object(
            check.subprocess, "check_output"
        ) as gcloud, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(check.main([]), 1)
        gcloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
