#!/usr/bin/env python3
"""Prepare a reviewable, isolated media-staging patch. Never deploy or mutate source.

Only the existing project/bucket allowlists and the dedicated staging copy's
Firebase default project change. Production source, credentials, data and cloud
resources are not touched. The generated files are preparation, not proof that
an isolated project exists or that Firebase behavior has been verified.
"""

import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import sys

PRODUCTION_PROJECT = "adaptive-fitness-af8bb"
# Fail closed on drift: each production-bound surface needs deliberate review.
EXPECTED_PROJECT_REFERENCES = {
    ".firebaserc": 1,
    "firestore.rules": 4,
    "functions/lib/activityMedia.js": 2,
    "functions/lib/postPhotos.js": 1,
    "functions/lib/publicPhotoUrl.js": 1,
    "src/lib/activityMedia.ts": 1,
}


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def validate_destination(project, bucket=None):
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
        raise ValueError("Supply a canonical 6–30 character Firebase project ID.")
    if project == PRODUCTION_PROJECT:
        raise ValueError("Production is not a staging destination.")
    chosen = bucket or f"{project}.firebasestorage.app"
    if chosen not in {f"{project}.firebasestorage.app", f"{project}.appspot.com"}:
        raise ValueError("The bucket must be one of the supplied project's standard buckets.")
    return chosen


def plan(root, project, bucket=None):
    """Return proposed contents only; no source or output writes."""
    chosen = validate_destination(project, bucket)
    root = Path(root).resolve(strict=True)
    changes = []
    for name, expected in EXPECTED_PROJECT_REFERENCES.items():
        path = root / name
        if not path.is_file() or path.is_symlink() or root not in path.resolve().parents:
            raise ValueError(f"Missing or non-local source file: {name}")
        before = path.read_text(encoding="utf-8")
        if before.count(PRODUCTION_PROJECT) != expected:
            raise ValueError(f"Project-reference drift in {name}; review it before preparing staging.")
        if name == ".firebaserc":
            if json.loads(before) != {"projects": {"default": PRODUCTION_PROJECT}}:
                raise ValueError("Unexpected Firebase aliases or targets; do not carry them into staging.")
            after = json.dumps({"projects": {"default": project}}, indent=2) + "\n"
        else:
            after = before.replace(PRODUCTION_PROJECT, project)
        changes.append({"path": name, "before": before, "after": after})
    return chosen, changes


def prepare(root, output, project, bucket=None):
    root = Path(root).resolve(strict=True)
    requested_output = Path(output)
    if requested_output.is_symlink():
        raise ValueError("Output already exists as a symlink; refusing to overwrite it.")
    output = requested_output.resolve()
    if output == root or root in output.parents:
        raise ValueError("Choose a new output directory outside the source checkout.")
    if output.exists():
        raise ValueError("Output already exists; refusing to overwrite it.")
    chosen, changes = plan(root, project, bucket)
    patch = "".join(
        "".join(difflib.unified_diff(
            change["before"].splitlines(keepends=True),
            change["after"].splitlines(keepends=True),
            fromfile=f"a/{change['path']}", tofile=f"b/{change['path']}",
        )) for change in changes
    )
    manifest = {
        "projectId": project,
        "storageBucket": chosen,
        "deploysOrChangesCloudState": False,
        "patchSha256": digest(patch),
        "sources": [
            {"path": c["path"], "beforeSha256": digest(c["before"]),
             "afterSha256": digest(c["after"])} for c in changes
        ],
    }
    env = (
        "# Only this isolated project's WEB app configuration. No production credentials.\n"
        f"VITE_FIREBASE_PROJECT_ID={project}\n"
        f"VITE_FIREBASE_STORAGE_BUCKET={chosen}\n"
        f"VITE_FIREBASE_AUTH_DOMAIN={project}.firebaseapp.com\n"
        "VITE_FIREBASE_API_KEY=\nVITE_FIREBASE_APP_ID=\n"
        "VITE_FIREBASE_MESSAGING_SENDER_ID=\n"
        "# Configure App Check separately for the authorized staging application.\n"
        "# Keep analytics disabled for synthetic tests; never copy production .env files.\n"
    )
    checklist = f"""# Isolated activity-media staging preparation

Target project: {project}
Target SDK bucket: {chosen}

This directory contains a proposed patch and an incomplete web configuration
template. Nothing was deployed, no credentials were read, and no cloud data was
accessed. A project ID does not prove ownership or isolation.

Before using this material:

1. Verify that this is an authorized, separate Firebase project with synthetic
   accounts and data only. Verify its actual bucket, Auth setup, App Check, APIs,
   billing/cost limits and operator permissions. Obtain any required approval.
2. Use a clean dedicated staging worktree of the recorded source version. Review
   staging.patch and its manifest hashes, run git apply --check, then apply there
   only. Never apply this patch to the production release branch.
3. Fill the web template from that staging project's own app configuration. Check
   the built client's project and bucket, the Admin SDK's project/bucket and the
   patched rules all agree. No production credentials, aliases, data or env files.
4. Do not run the repository's production deployment workflows. Any staging
   deployment is a separate, explicitly scoped operation against this project.
   This generator supplies no deployment command and no persistent access.
5. Re-run the applicable contracts/rules and synthetic end-to-end checks against
   the staging identities. Existing fixture URLs remain production-shaped and
   require a deliberate staging fixture variant; this patch does not claim those
   original fixtures prove the alternate project's integration.
6. Follow docs/agents/activity-media-privacy-rollout.md. Verify authorized reads,
   removed followers and both blocks, private/deleted/removed content, account
   changes, report-scoped moderation, bounded bytes and no bearer fallback. At
   the final writer/cutover stage also prove actual tokenless upload, no-cache
   responses and revocation of a synthetic legacy token. A reader-only stage
   must retain its legacy rules/writers and does not close the existing exposure.

The patch preserves the shape of the strict bucket/path allowlists, replacing
only their project ID in a staging copy. It also includes existing public-photo
and report-photo validators so they cannot silently refer back to production.
"""
    output.mkdir(parents=True, exist_ok=False)
    for name, contents in {
        "staging.patch": patch,
        "manifest.json": json.dumps(manifest, indent=2) + "\n",
        ".env.staging.example": env,
        "CHECKLIST.md": checklist,
    }.items():
        with (output / name).open("x", encoding="utf-8") as handle:
            handle.write(contents)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Verified isolated Firebase project ID")
    parser.add_argument("--bucket", help="That project's standard Firebase bucket")
    parser.add_argument("--output", required=True, type=Path, help="New directory outside the checkout")
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args(argv)
    try:
        manifest = prepare(args.source_root, args.output, args.project, args.bucket)
    except (ValueError, OSError) as error:
        print(f"Preparation refused: {error}", file=sys.stderr)
        return 1
    print(f"Prepared {len(manifest['sources'])} file changes for review. Nothing deployed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
