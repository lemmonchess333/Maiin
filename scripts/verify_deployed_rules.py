"""Compare active Firebase Rules source with this checkout using GET requests only.

Uses the existing gcloud identity; never enables APIs, grants permissions, deploys
rules, reads user documents, or prints credentials / source / HTTP error bodies.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request


API = "https://firebaserules.googleapis.com/v1/"
ROOT = Path(__file__).resolve().parent.parent


class VerificationError(Exception):
    """Messages are fixed, safe diagnostic codes, never remote content."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise VerificationError("unexpected-redirect")


def make_reader(token):
    opener = urllib.request.build_opener(NoRedirect())

    def read(resource):
        # No query strings, cross-project URLs or path traversal from metadata.
        if not re.fullmatch(r"projects/[a-z0-9-]+/(releases/[a-zA-Z0-9._/-]+|rulesets/[a-zA-Z0-9-]+)", resource):
            raise VerificationError("invalid-resource-name")
        request = urllib.request.Request(
            API + resource, headers={"Authorization": f"Bearer {token}"}, method="GET"
        )
        try:
            with opener.open(request, timeout=30) as response:
                data = json.load(response)
        except urllib.error.HTTPError as error:
            raise VerificationError(f"http-{error.code}") from None
        except (urllib.error.URLError, TimeoutError):
            raise VerificationError("network-unavailable") from None
        except (ValueError, UnicodeError):
            raise VerificationError("invalid-json") from None
        if not isinstance(data, dict):
            raise VerificationError("invalid-response")
        return data

    return read


def verify_release(read, project, release_id, expected):
    release_name = f"projects/{project}/releases/{release_id}"
    release = read(release_name)
    if release.get("name") != release_name:
        raise VerificationError("unexpected-release")
    ruleset_name = release.get("rulesetName", "")
    if not isinstance(ruleset_name, str) or not re.fullmatch(
        rf"projects/{re.escape(project)}/rulesets/[a-zA-Z0-9-]+", ruleset_name
    ):
        raise VerificationError("unexpected-ruleset")
    ruleset = read(ruleset_name)
    if ruleset.get("name") != ruleset_name:
        raise VerificationError("unexpected-ruleset")
    source = ruleset.get("source")
    files = source.get("files") if isinstance(source, dict) else None
    # Tropos deploys one source file per service. Do not accept a matching
    # fragment alongside an unexpected second source file.
    if not isinstance(files, list) or len(files) != 1 or not isinstance(files[0], dict):
        raise VerificationError("unexpected-source-files")
    content = files[0].get("content")
    if not isinstance(content, str):
        raise VerificationError("missing-source-content")
    actual = content.encode("utf-8")
    # Read again so a concurrent release change cannot produce a false pass.
    current = read(release_name)
    if (current.get("name"), current.get("rulesetName"), current.get("updateTime")) != (
        release_name, ruleset_name, release.get("updateTime")
    ):
        raise VerificationError("release-changed-during-check")
    return {
        "status": "match" if actual == expected else "mismatch",
        "ruleset": ruleset_name,
        "expectedSha256": hashlib.sha256(expected).hexdigest(),
        "deployedSha256": hashlib.sha256(actual).hexdigest(),
    }


def check_services(read, project, service, bucket, root=ROOT):
    config = json.loads((root / "firebase.json").read_text())
    results = []
    for kind in ("firestore", "storage"):
        if service != "all" and service != kind:
            continue
        result = {"service": kind}
        try:
            release_id = "cloud.firestore"
            if kind == "storage":
                if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]", bucket):
                    raise VerificationError("missing-or-invalid-storage-bucket")
                release_id = f"firebase.storage/{bucket}"
            # Follow the CLI's source path, not a separately maintained copy.
            path = (root / config[kind]["rules"]).resolve()
            if not path.is_relative_to(root.resolve()):
                raise VerificationError("source-outside-checkout")
            result.update(verify_release(read, project, release_id, path.read_bytes()))
        except VerificationError as error:
            result.update(status="unverified", reason=str(error))
        except (OSError, KeyError, TypeError, ValueError):
            result.update(status="unverified", reason="invalid-local-rules-config")
        results.append(result)
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="adaptive-fitness-af8bb")
    parser.add_argument("--service", choices=["all", "firestore", "storage"], default="all")
    parser.add_argument("--bucket", default=os.environ.get("TROPOS_STORAGE_BUCKET", ""))
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", args.project):
        print("Rules verification failed: invalid-project", file=sys.stderr)
        return 1
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"], text=True,
            stderr=subprocess.PIPE, timeout=30,
        ).strip()
        if not token:
            raise VerificationError("missing-credentials")
        results = check_services(make_reader(token), args.project, args.service, args.bucket)
    except (OSError, subprocess.SubprocessError, VerificationError, ValueError):
        print("Rules verification failed: credentials-or-local-config-unavailable", file=sys.stderr)
        return 1
    for result in results:
        print(json.dumps(result, sort_keys=True))
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as summary:
            summary.write("\n### Active production Rules source\n\n```json\n")
            summary.write(json.dumps(results, indent=2))
            summary.write("\n```\n\nRead-only source comparison. This does not prove cross-service IAM approval or App Check enforcement.\n")
    return 0 if results and all(r["status"] == "match" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
