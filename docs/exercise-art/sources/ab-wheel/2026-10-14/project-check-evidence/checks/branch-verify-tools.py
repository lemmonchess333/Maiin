"""Normal full verification plus a truthful comparison to the captured baseline.

This file does not run verification when imported. Execution requires the explicit
`run` command. Only the known test-written snapshot is restored, from current
pre-run bytes; every other unexpected working-tree change is reported untouched.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import time
import subprocess
import sys

CHECKS = Path(__file__).resolve().parent
REPO = Path("C:/Users/myles/Documents/Codex/2026-10-04/lg/work/Maiin-burpees")
NODE = Path("C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")
NPM = Path("C:/Users/myles/Documents/Codex/2026-10-04/lg/work/merge-reviewed-20261012/runtime/node_modules/npm/bin/npm-cli.js")
GIT = Path("C:/Program Files/Git/bin/git.exe")
SNAPSHOT = "src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap"
BASELINE_HEAD = "82d6d829ad20ad3c8924933f736ad615b83054f6"
BASELINE_DIR = CHECKS.parent / "baseline"
BASELINE_LOG_SHA256 = "9bed359f766e07164ac82a46a1d1719ff54b1b88bfa659152258e1ba0b01ba41"
BASELINE_FAILURE_IDENTITIES_SHA256 = "1d645e87095129e908e33067abfe3cc17ed8e548a630aa7569a0b9cc54fbb71a"
REQUIRED_VERIFY_STAGES = ["lint", "check:form-art", "check:form-drafts", "check:cycles", "build", "check:dist-size", "test"]


def stamp():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def git(*args):
    return subprocess.check_output([str(GIT), *args], cwd=REPO).decode("utf-8", errors="strict")


def status():
    return git("status", "--porcelain=v1").splitlines()


def working_manifest():
    # Tracked files and non-ignored new files: also detects mutation of an already
    # dirty file which a before/after status-only comparison would miss.
    names = set(git("ls-files", "-z").split("\0"))
    names.update(git("ls-files", "--others", "--exclude-standard", "-z").split("\0"))
    rows = {}
    for name in sorted(names - {""}):
        path = REPO / name
        rows[name] = digest(path.read_bytes()) if path.is_file() else None
    return rows


def parse_log(path):
    log = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", path.read_text(encoding="utf-8-sig", errors="replace"))
    lines = log.splitlines()

    def last(pattern):
        return next((line.strip() for line in reversed(lines) if re.match(pattern, line)), None)

    def counts(line):
        if line is None:
            return None
        values = {"failed": 0, "passed": 0, "skipped": 0}
        values.update({kind: int(n) for n, kind in re.findall(r"(\d+)\s+(failed|passed|skipped)", line)})
        total = re.search(r"\((\d+)\)", line)
        values["total"] = int(total.group(1)) if total else None
        return values

    file_summary = last(r"\s*Test Files\s")
    test_summary = last(r"\s*Tests\s+\d")
    failures = []
    for index, line in enumerate(lines):
        if not re.match(r"\s*FAIL\s", line):
            continue
        heading = line.strip()
        project = re.search(r"\|([^|]+)\|", heading)
        file_match = re.search(r"(\S+\.test\.[cm]?[jt]sx?)", heading)
        detail = []
        for following in lines[index + 1:index + 9]:
            if following.strip():
                detail.append(following.strip())
            if len(detail) == 3:
                break
        failures.append({"identity": heading, "project": project.group(1) if project else None,
                         "file": file_match.group(1) if file_match else None,
                         "suiteImportFailure": " > " not in heading, "firstDetailLines": detail})
    return {"testFiles": counts(file_summary), "tests": counts(test_summary),
            "verbatimSummary": [value for value in [file_summary, test_summary, last(r"\s*Duration\s")] if value],
            "failures": failures, "failureHeaderCount": len(failures),
            "stagesInvoked": re.findall(r"^> tropos@\S+ (lint|check:form-art|check:form-drafts|check:cycles|build|check:dist-size|test)\s*$", log, re.MULTILINE),
            "logSha256": digest(path.read_bytes())}


def load_baseline():
    identity_bytes = (BASELINE_DIR / "baseline-failure-identities.json").read_bytes()
    if digest(identity_bytes) != BASELINE_FAILURE_IDENTITIES_SHA256:
        raise RuntimeError("Fresh baseline identity evidence changed; do not compare unsealed inputs.")
    baseline = json.loads(identity_bytes.decode("utf-8-sig"))
    if baseline["logSha256"] != BASELINE_LOG_SHA256:
        raise RuntimeError("Fresh baseline log hash is not the pinned current-main capture.")
    if baseline["head"] != BASELINE_HEAD:
        raise RuntimeError("Unexpected baseline head.")
    if digest((BASELINE_DIR / "baseline-verify.log").read_bytes()) != baseline["logSha256"]:
        raise RuntimeError("Captured baseline log changed; do not compare unsealed evidence.")
    return baseline


def compare(prefix):
    baseline = load_baseline()
    meta = json.loads((CHECKS / f"{prefix}-verify-result.json").read_text(encoding="utf-8-sig"))
    if meta["status"] != "terminal":
        raise RuntimeError("Verification is not terminal; comparison cannot be declared complete.")
    parsed = parse_log(CHECKS / f"{prefix}-verify.log")
    summaries_present = parsed["testFiles"] is not None and parsed["tests"] is not None
    totals_valid = (summaries_present and all(row["total"] == sum(row[kind] for kind in ["failed", "passed", "skipped"])
                                            for row in [parsed["testFiles"], parsed["tests"]]))
    all_stages_present = parsed["stagesInvoked"] == REQUIRED_VERIFY_STAGES
    header_files = {row["file"] for row in parsed["failures"]}
    failure_accounting = (summaries_present and None not in header_files
                          and len(header_files) == parsed["testFiles"]["failed"]
                          and (parsed["tests"]["failed"] == 0 or bool(parsed["failures"])))
    complete = summaries_present and totals_valid and all_stages_present and failure_accounting
    old = {row["identity"]: row for row in baseline["failures"]}
    new = {row["identity"]: row for row in parsed["failures"]}
    added = sorted(new.keys() - old.keys())
    common = sorted(new.keys() & old.keys())
    resolved = sorted(old.keys() - new.keys()) if complete else None
    changed_detail = [{"identity": identity, "baseline": old[identity]["firstDetailLines"],
                       "branch": new[identity]["firstDetailLines"]}
                      for identity in common if old[identity]["firstDetailLines"] != new[identity]["firstDetailLines"]]
    intact = (meta.get("inputBytesUnchanged", False) and meta.get("finalHead") == meta["head"]
              and sorted(meta.get("initialStatus", [])) == sorted(meta.get("finalStatus", [])))
    valid = complete and intact and meta.get("exitCode") is not None
    failed_counts_match = (complete and parsed["tests"]["failed"] == baseline["tests"]["failed"]
                           and parsed["testFiles"]["failed"] == baseline["testFiles"]["failed"])
    green = meta.get("exitCode") == 0 and complete and parsed["tests"]["failed"] == 0 and parsed["testFiles"]["failed"] == 0 and intact
    report = {"phase": "branch-full-verify-versus-fresh-baseline", "prefix": prefix,
              "baselineHead": BASELINE_HEAD, "branchHead": meta["head"],
              "overallGreen": green, "exitCode": meta.get("exitCode"),
              "comparisonComplete": complete, "comparisonValid": valid,
              "unitSummariesPresent": summaries_present, "summaryTotalsValid": totals_valid,
              "allNormalVerifyStagesPresent": all_stages_present, "failureHeaderFileAccountingComplete": failure_accounting,
              "noAdditionalFailureIdentities": valid and not added,
              "failedCountsMatchBaseline": failed_counts_match,
              "sameFailureIdentitySet": valid and not added and not resolved,
              "baselineEquivalentFailures": valid and not added and not resolved and failed_counts_match and not changed_detail,
              "newFailureIdentities": added, "resolvedFailureIdentities": resolved,
              "unchangedFailureIdentities": common, "changedDetailsForExistingFailures": changed_detail,
              "baselineTestFiles": baseline["testFiles"], "baselineTests": baseline["tests"],
              "branchResult": parsed, "inputBytesUnchanged": meta.get("inputBytesUnchanged", False),
              "inputStatePreserved": intact,
              "snapshotRestoredFromExactCurrentBytes": meta.get("snapshotRestoredFromExactBytes", False),
              "meaning": "An exit1run remains non-green even with identical baseline failures. No summary means unit comparison incomplete, not resolved baseline failures. Changed error details need review."}
    save_json(CHECKS / f"{prefix}-failure-comparison.json", report)
    (CHECKS / f"{prefix}-failure-identities.txt").write_text("\n".join(new) + ("\n" if new else ""), encoding="utf-8")
    summary = [f"# {prefix}: full verification comparison", "", f"Overall green: **{green}**. Normal verify exit: **{meta.get('exitCode')}**.",
               f"Baseline: `{BASELINE_HEAD}`; tested working-tree HEAD: `{meta['head']}`.", "",
               *parsed["verbatimSummary"], "", f"Complete unit summary: {complete}.",
               f"New failure identities: {len(added)}. Resolved identities: {len(resolved) if resolved is not None else 'not established'}.",
               f"Existing failure identities with changed first detail lines: {len(changed_detail)}.",
               f"Failed counts match baseline: {failed_counts_match}. Comparison valid: {valid}.",
               f"Input bytes, status and HEAD preserved: {intact}. Only known snapshot restoration is authorized.", "",
               "A baseline-equivalent failing run is still non-green. Review added identities and changed details; commit hooks and current required CI still apply.", ""]
    (CHECKS / f"{prefix}-comparison-summary.md").write_text("\n".join(summary), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ["overallGreen", "exitCode", "comparisonComplete", "comparisonValid", "noAdditionalFailureIdentities", "failedCountsMatchBaseline", "newFailureIdentities", "inputStatePreserved"]}, indent=2))
    return report


def run(prefix):
    load_baseline()
    # Never overwrite actual check evidence, or accidentally rerun the baseline.
    for suffix in ["verify.log", "verify-result.json", "input-manifest.json", "planSweep-before.snap"]:
        if (CHECKS / f"{prefix}-{suffix}").exists():
            raise RuntimeError("Run prefix already exists; preserve evidence. A rerun needs a new prefix and a new concern.")
    for path in [NODE, NPM, GIT]:
        if not path.is_file():
            raise RuntimeError(f"Required bundled/prepared executable missing: {path}")
    head = git("rev-parse", "HEAD").strip()
    subprocess.run([str(GIT), "merge-base", "--is-ancestor", BASELINE_HEAD, head], cwd=REPO, check=True)
    snapshot_path = REPO / SNAPSHOT
    if snapshot_path.is_symlink() or not snapshot_path.is_file():
        raise RuntimeError("Known snapshot is absent or a symlink; no restoration target inferred.")
    original = snapshot_path.read_bytes()
    (CHECKS / f"{prefix}-planSweep-before.snap").write_bytes(original)
    before = working_manifest()
    if before.get(SNAPSHOT) != digest(original):
        raise RuntimeError("Snapshot changed during capture; freeze integration before verification.")
    save_json(CHECKS / f"{prefix}-input-manifest.json", before)
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join([str(NODE.parent), str(NPM.parents[2] / ".bin"), "C:/Program Files/Git/bin", env.get("PATH", "")])
    resolved = {name: shutil.which(name, path=env["PATH"]) for name in ["node", "npm", "npm.cmd", "git", "bash"]}
    if not resolved["bash"] or not Path(resolved["bash"]).samefile(Path("C:/Program Files/Git/bin/bash.exe")):
        raise RuntimeError("Known correct prepared Git Bash PATH is not active.")
    meta = {"phase": "branch", "status": "running", "startedAt": stamp(), "head": head,
            "branch": git("branch", "--show-current").strip(), "initialStatus": status(),
            "command": "npm run verify", "node": str(NODE), "npmCli": str(NPM),
            "nodeVersion": subprocess.check_output([str(NODE), "--version"]).decode().strip(),
            "npmVersion": subprocess.check_output([str(NODE), str(NPM), "--version"], env=env).decode().strip(),
            "savedSnapshot": SNAPSHOT, "savedSnapshotSha256": digest(original),
            "baselineHead": BASELINE_HEAD, "baselineLogSha256": load_baseline()["logSha256"],
            "pathPrefixes": [str(NODE.parent), str(NPM.parents[2] / ".bin"), "C:/Program Files/Git/bin"],
            "resolvedExecutables": resolved}
    result_path = CHECKS / f"{prefix}-verify-result.json"
    save_json(result_path, meta)
    print(json.dumps(meta, indent=2), flush=True)
    verify_exit = None
    started = time.perf_counter()
    try:
        with (CHECKS / f"{prefix}-verify.log").open("wb") as output:
            verify_exit = subprocess.run([str(NODE), str(NPM), "run", "verify"], cwd=REPO, env=env,
                                         stdout=output, stderr=subprocess.STDOUT).returncode
    finally:
        meta["elapsedSeconds"] = round(time.perf_counter() - started, 3)
        meta["afterRunStatus"] = status()
        after = snapshot_path.read_bytes() if snapshot_path.is_file() else None
        meta["snapshotAfterRunSha256"] = digest(after) if after is not None else None
        meta["snapshotRestoredFromExactBytes"] = after != original
        if after != original:
            if after is not None:
                (CHECKS / f"{prefix}-planSweep-after-run.snap").write_bytes(after)
            snapshot_path.write_bytes(original)
        meta["snapshotFinalSha256"] = digest(snapshot_path.read_bytes())
        final = working_manifest()
        changes = [name for name in sorted(set(before) | set(final)) if before.get(name) != final.get(name)]
        meta.update({"status": "terminal", "finishedAt": stamp(), "exitCode": verify_exit,
                     "finalStatus": status(), "finalHead": git("rev-parse", "HEAD").strip(),
                     "unexpectedFileByteChanges": changes, "inputBytesUnchanged": not changes})
        save_json(result_path, meta)
    report = compare(prefix)
    if not report["inputStatePreserved"] or verify_exit is None:
        return 2
    return verify_exit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["run", "compare"])
    parser.add_argument("--prefix", default="branch")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]*", args.prefix) or args.prefix == "baseline":
        parser.error("Use a safe non-baseline run prefix.")
    if args.mode == "run":
        return run(args.prefix)
    compare(args.prefix)
    return 0


if __name__ == "__main__":
    sys.exit(main())
