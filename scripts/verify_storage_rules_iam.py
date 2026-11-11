"""Confirm Cloud Storage for Firebase can read Firestore before its rules do.

storage.rules calls firestore.exists() and firestore.get() for the
account-deletion write freeze. Those calls work only once the Storage
service agent holds roles/firebaserules.firestoreServiceAgent on the
project; without it every upload and delete the freeze guards is refused.
firebase-tools checks and grants that role only in an interactive session,
so a CI deploy publishes cross-service rules without it and still reports
success. This check runs before that deploy and fails it instead.

Read-only: reads the project's number and IAM policy with the existing
gcloud identity (getIamPolicy is a POST, but it changes nothing). Never
grants a role, and never prints credentials or HTTP error bodies.
"""

import argparse
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request


API = "https://cloudresourcemanager.googleapis.com/v1/"
ROOT = Path(__file__).resolve().parent.parent
ROLE = "roles/firebaserules.firestoreServiceAgent"
PROJECT_ID = r"[a-z][a-z0-9-]{4,61}[a-z0-9]"
# The test firebase-tools applies before it offers to grant the role
# (CROSS_SERVICE_FUNCTIONS in its rulesDeploy.js), so this check guards
# exactly the rules the CLI would have prompted for.
CROSS_SERVICE = re.compile(r"firestore\.(get|exists)")

GRANT_COMMAND = (
    "gcloud projects add-iam-policy-binding {project} \\\n"
    '  --member="serviceAccount:service-$(gcloud projects describe {project} '
    "--format='value(projectNumber)')@gcp-sa-firebasestorage.iam.gserviceaccount.com\" \\\n"
    '  --role="' + ROLE + '"'
)

# Failures a later run can clear: the request did not complete, or Google
# was busy or failing. No role or setting change fixes them.
TRANSIENT = re.compile(r"network-unavailable|token-timeout|http-(408|429|5\d\d)")

# `gcloud auth print-access-token` that does not answer is the runner's
# network or Google's token endpoint being slow, not a bad key: run 675 of
# Deploy production lost its release to one 30 s wait, with the Firestore
# job of the same run authenticated a minute earlier. A timed-out request
# is tried again; one that fails outright is not, since a bad key stays bad.
TOKEN_ATTEMPTS = 3
TOKEN_TIMEOUT_S = 45
TOKEN_PAUSES_S = (5, 15)
# gcloud gave no token, or Google refused the one it gave.
CREDENTIALS = ("credentials-unavailable", "missing-credentials", "http-401")


class VerificationError(Exception):
    """Messages are fixed, safe diagnostic codes, never remote content."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise VerificationError("unexpected-redirect")


def _body(error):
    try:
        return error.read(65536) or b""
    except (OSError, ValueError, AttributeError, http.client.HTTPException):
        return b""


# A read Google did not answer, or answered 408, 429 or 5xx, is tried again,
# as verify_deployed_rules.py's are: one such read otherwise fails the release.
# Both calls only read (getIamPolicy is a POST that changes nothing), so a
# second try is safe. A refusal fails at once; no wait changes it.
READ_PAUSES_S = (5, 15)
TRANSIENT_STATUS = frozenset({408, 429, *range(500, 600)})


def make_client(token, sleep=None):
    # Looked up when called, so a test that patches time.sleep reaches it.
    sleep = sleep or (lambda seconds: time.sleep(seconds))
    opener = urllib.request.build_opener(NoRedirect())

    def call(resource, body=None):
        # The project itself or its policy read, nothing else: no
        # setIamPolicy, no query strings, no other project's path.
        if not re.fullmatch(rf"projects/{PROJECT_ID}(:getIamPolicy)?", resource):
            raise VerificationError("invalid-resource-name")
        if (body is None) == resource.endswith(":getIamPolicy"):
            raise VerificationError("invalid-request")
        request = urllib.request.Request(
            API + resource,
            data=None if body is None else json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="GET" if body is None else "POST",
        )
        for pause in (*READ_PAUSES_S, None):
            try:
                with opener.open(request, timeout=30) as response:
                    data = json.load(response)
                break
            except urllib.error.HTTPError as error:
                # A disabled API and a missing permission are both 403s and need
                # different fixes. Google marks the first with this fixed reason
                # code; only the code is looked for, and the body is never printed.
                if error.code == 403 and b"SERVICE_DISABLED" in _body(error):
                    raise VerificationError("api-disabled") from None
                if error.code not in TRANSIENT_STATUS or pause is None:
                    raise VerificationError(f"http-{error.code}") from None
            except (OSError, http.client.HTTPException):
                # No connection, a timeout, or the connection lost while the body
                # was being read (a reset, or a body cut short).
                if pause is None:
                    raise VerificationError("network-unavailable") from None
            except (ValueError, UnicodeError):
                raise VerificationError("invalid-json") from None
            sleep(pause)
        if not isinstance(data, dict):
            raise VerificationError("invalid-response")
        return data

    return call


def storage_agent(project_number):
    return f"serviceAccount:service-{project_number}@gcp-sa-firebasestorage.iam.gserviceaccount.com"


def check_cross_service_iam(call, project, rules_source):
    if not CROSS_SERVICE.search(rules_source):
        return {"status": "not-needed"}
    info = call(f"projects/{project}")
    number = info.get("projectNumber")
    if info.get("projectId") != project or not isinstance(number, str) or not number.isdigit():
        raise VerificationError("unexpected-project")
    # Version 3 returns conditional bindings as they are instead of
    # refusing, so a conditional grant can be told apart from a plain one.
    policy = call(f"projects/{project}:getIamPolicy", {"options": {"requestedPolicyVersion": 3}})
    bindings = policy.get("bindings", [])
    if not isinstance(bindings, list):
        raise VerificationError("invalid-policy")
    member = storage_agent(number)
    # Only an unconditional binding counts: a condition may not cover the
    # Rules service's reads, and the fix below adds a plain binding.
    granted = any(
        isinstance(binding, dict)
        and binding.get("role") == ROLE
        and not binding.get("condition")
        and isinstance(binding.get("members"), list)
        and member in binding["members"]
        for binding in bindings
    )
    return {"status": "granted" if granted else "missing", "member": member}


def read_storage_rules(root=ROOT):
    config = json.loads((root / "firebase.json").read_text())
    # Follow the CLI's source path, not a separately maintained copy.
    path = (root / config["storage"]["rules"]).resolve()
    if not path.is_relative_to(root.resolve()):
        raise VerificationError("source-outside-checkout")
    return path.read_text()


def report(result, project):
    status = result["status"]
    lines = ["", "### Storage rules: Firestore access", ""]
    if status == "not-needed":
        lines.append("storage.rules does not read Firestore, so no extra permission is needed.")
    elif status == "granted":
        lines.append(f"The Storage service agent holds `{ROLE}`, so storage.rules can read Firestore.")
    elif status == "missing":
        print(
            "::error title=Storage rules cannot read Firestore::The Storage service agent lacks "
            f"{ROLE}, so the uploads and deletes storage.rules guards are refused. Grant the role; "
            "the command is in the job summary."
        )
        lines += [
            f"storage.rules reads Firestore, but the Storage service agent lacks `{ROLE}`.",
            "The uploads and deletes these rules guard are refused until it has it.",
            "",
            "Grant the role as a project owner:",
            "",
            "```bash",
            GRANT_COMMAND.format(project=project),
            "```",
            "",
            "If this stopped a release, re-run Deploy production afterwards.",
        ]
    else:
        reason = result.get("reason", "unknown")
        command = None
        rerun = "If this stopped a release, re-run Deploy production afterwards."
        if reason == "api-disabled":
            fix = "Enable the Cloud Resource Manager API, which serves the policy read"
            command = f"gcloud services enable cloudresourcemanager.googleapis.com --project {project}"
        elif reason == "http-403":
            fix = (
                "Give the deploy service account read access to IAM policies, for example "
                "`roles/iam.securityReviewer`"
            )
        elif TRANSIENT.fullmatch(reason):
            fix = "This is usually temporary and needs no change. Re-run the check"
            rerun = "If this stopped a release, re-run Deploy production."
        elif reason in CREDENTIALS:
            fix = (
                "gcloud gave no access token that Google accepts. Check the authentication step "
                "before this one and the `FIREBASE_SERVICE_ACCOUNT` key it uses"
            )
        else:
            fix = "This is not a missing permission, so look into the reason before changing any role"
        print(
            "::error title=Storage rules permission unconfirmed::Could not read the project's IAM "
            f"policy ({reason}). {fix.replace('`', '')}."
        )
        lines += [
            f"Could not read the project's IAM policy (`{reason}`), so this run cannot",
            f"confirm the Storage service agent holds `{ROLE}`. Unconfirmed counts as a failure.",
            "",
            f"{fix}:" if command else f"{fix}.",
        ]
        if command:
            lines += ["", "```bash", command, "```"]
        lines += ["", rerun]
    for line in lines[3:]:
        print(line)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as summary:
            summary.write("\n".join(lines) + "\n")


def access_token():
    """gcloud's access token, trying again when a request times out.

    Raises VerificationError("token-timeout") once every attempt has timed
    out. A gcloud that exits with an error, or is missing, raises as it does
    (CalledProcessError, OSError): that is the credentials, not the network.
    """
    for attempt in range(TOKEN_ATTEMPTS):
        try:
            return subprocess.check_output(
                ["gcloud", "auth", "print-access-token"], text=True,
                stderr=subprocess.PIPE, timeout=TOKEN_TIMEOUT_S,
            ).strip()
        except subprocess.TimeoutExpired:
            if attempt + 1 == TOKEN_ATTEMPTS:
                raise VerificationError("token-timeout") from None
            time.sleep(TOKEN_PAUSES_S[attempt])
    raise VerificationError("token-timeout")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="adaptive-fitness-af8bb")
    args = parser.parse_args(argv)
    if not re.fullmatch(PROJECT_ID, args.project):
        print("Storage IAM check failed: invalid-project", file=sys.stderr)
        return 1
    try:
        source = read_storage_rules()
    except (OSError, KeyError, TypeError, ValueError, VerificationError):
        print("Storage IAM check failed: invalid-local-rules-config", file=sys.stderr)
        return 1
    if not CROSS_SERVICE.search(source):
        result = {"status": "not-needed"}
    else:
        try:
            token = access_token()
            if not token:
                raise VerificationError("missing-credentials")
            result = check_cross_service_iam(make_client(token), args.project, source)
        except (OSError, subprocess.SubprocessError):
            result = {"status": "unverified", "reason": "credentials-unavailable"}
        except VerificationError as error:
            result = {"status": "unverified", "reason": str(error)}
    print(json.dumps(result, sort_keys=True))
    report(result, args.project)
    return 0 if result["status"] in ("granted", "not-needed") else 1


if __name__ == "__main__":
    sys.exit(main())
