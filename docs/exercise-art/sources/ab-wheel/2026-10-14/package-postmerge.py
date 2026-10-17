"""Actual Ab Wheel postmerge audit/package; parent executes, not a merge command.

Required inputs are saved actual GitHub current-head CI and actual merge evidence.
All repository access is read-only. Only this external candidate directory and,
with --record-progress, the existing external progress JSON may be written. There
are no image requests, tests, hooks, CI reruns, Git mutations or goal transitions.
"""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from PIL import Image
import argparse
import hashlib
import io
import json
import os
import re
import runpy
import subprocess
import xml.etree.ElementTree as ET
import zipfile
import numpy as np

R = Path(__file__).resolve().parent
WORK = R.parents[1]
REPO = WORK / "Maiin-burpees"
ARCHIVE = REPO / "docs/exercise-art/sources/ab-wheel/2026-10-14"
BASE = "82d6d829ad20ad3c8924933f736ad615b83054f6"
CANONICAL = "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b"
SIZE = (1448, 924)
CROP = (48, 8, 1496, 932)
ORDER = [1, 2, 3, 3, 2, 1]
SETUP = ["Kneel on a pad holding the ab wheel with both hands under your shoulders."]
NODE = Path("C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")
RUNTIME_PROOF = {"unit", "emulator-tests"}


def require(value, why):
    if not value:
        raise RuntimeError("Postmerge audit refused: " + why)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    return digest(Path(path).read_bytes())


def read(path):
    require(Path(path).is_file(), "missing input " + str(path))
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def atomic_write(path, data):
    require(not path.resolve().is_relative_to(REPO.resolve()), "output is inside repository")
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO)


def git_text(*args):
    return git(*args).decode("utf-8").strip()


def tree_map(commit):
    # One batched tree read per commit, not two Git processes for each file.
    result = {}
    for item in git("ls-tree", "-rz", "--full-tree", commit).split(b"\0"):
        if item:
            meta, name = item.split(b"\t", 1)
            mode, kind, oid = meta.decode("ascii").split()
            result[name.decode("utf-8")] = (mode, kind, oid)
    return result


def historical_registry_ids(commit):
    text = git("show", commit + ":src/lib/formArtReleases.data.ts").decode("utf-8")
    ids = re.findall(r'^  "?([\w-]+)"?: \{\s+folder: "[^"]+"', text, re.M)
    require(bool(ids) and len(ids) == len(set(ids)), "historical generated registry parse")
    return set(ids)


def safe_file(root, name):
    path = root / name
    require(not Path(name).is_absolute() and path.resolve().is_relative_to(root.resolve()), "unsafe relative input " + name)
    require(path.is_file(), "missing sealed input " + name)
    return path


def zip_name(name):
    path = Path(name)
    if path.is_absolute():
        require(path.resolve().is_relative_to(R.resolve()), "raw review input outside candidate")
        name = path.resolve().relative_to(R.resolve()).as_posix()
    name = name.replace("\\", "/")
    require(not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts, "unsafe ZIP name")
    return name


def load_zip(name):
    with zipfile.ZipFile(ARCHIVE / name) as archive:
        require(archive.testzip() is None, "corrupt " + name)
        names = archive.namelist()
        require(len(names) == len(set(names)), "duplicate entries in " + name)
        return {zip_name(n): archive.read(n) for n in names}


def bind_raw_zip(raw, report_name):
    require(report_name in raw, "raw accepted report absent: " + report_name)
    report = json.loads(raw[report_name])
    require(report.get("passed") is True and report.get("exerciseId") == "ab-wheel", "accepted actual review pass " + report_name)
    bindings = report.get("reviewedAssetHashes", {})
    require(isinstance(bindings, dict) and len(bindings) > 1, "raw reviewed byte bindings")
    for name, expected in bindings.items():
        relative = zip_name(name)
        require(relative in raw and digest(raw[relative]) == expected, "raw review ZIP binding " + relative)
    # Ordinary text formatting may change byte hashes outside this exact ZIP,
    # but it must not silently change any saved JSON review claim.
    require(read(ARCHIVE / report_name) == report, "formatted accepted report semantics changed")
    return report


def image(path):
    with Image.open(path) as im:
        return im.convert("RGBA")


def reopen_ora(path):
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, "ORA ZIP corruption")
        root = ET.fromstring(archive.read("stack.xml"))
        canvas = Image.new("RGBA", (int(root.attrib["w"]), int(root.attrib["h"])))
        stack = root.find("stack")
        require(stack is not None and len(stack) == 4, "four editable layers")
        for layer in reversed(list(stack)):
            require(layer.tag == "layer" and layer.attrib.get("visibility", "visible") == "visible", "unexpected ORA layer")
            require(float(layer.attrib.get("opacity", "1")) == 1 and layer.attrib.get("composite-op", "svg:src-over") == "svg:src-over", "unsupported ORA blending")
            pixels = image(io.BytesIO(archive.read(layer.attrib["src"])))
            canvas.alpha_composite(pixels, (int(layer.attrib.get("x", "0")), int(layer.attrib.get("y", "0"))))
        embedded = image(io.BytesIO(archive.read("mergedimage.png")))
        require(canvas.size == SIZE and canvas.tobytes() == embedded.tobytes(), "reopened ORA differs from saved merged image")
        return canvas


def validate_publication(args):
    require(args.pr_number > 0 and args.pr_url == f"https://github.com/lemmonchess333/Maiin/pull/{args.pr_number}", "actual target PR URL/number")
    for name, value in [("reviewed head", args.reviewed_head), ("actual merge SHA", args.merge_sha)]:
        require(re.fullmatch(r"[0-9a-f]{40}", value) and value != "0" * 40, name)
        require(git_text("rev-parse", value + "^{commit}") == value, name + " must resolve to exact local commit")
    ci = read(args.ci_proof)
    require(ci.get("repository") == "lemmonchess333/Maiin" and ci.get("prNumber") == args.pr_number and ci.get("prUrl") == args.pr_url, "CI proof target")
    require(ci.get("reviewedHead") == args.reviewed_head and ci.get("observedPR", {}).get("headSha") == args.reviewed_head, "CI proof exact current PR head")
    require(ci.get("requiredGatesGreen") is True and ci.get("currentPRHeadExactlyReviewed") is True and ci.get("latestPRWorkflowRunsCovered") is True, "actual current-head required gates")
    policy = ci.get("policy", {}).get("mergeGateRequirements", [])
    require({p.get("context") for p in policy} >= RUNTIME_PROOF, "both required merge contexts recorded")
    jobs = ci.get("requiredChecks", [])
    require({j.get("name") for j in jobs} >= RUNTIME_PROOF, "missing required successful job")
    for name in RUNTIME_PROOF:
        matches = [j for j in jobs if j.get("name") == name]
        require(len(matches) == 1, "ambiguous required check " + name)
        j = matches[0]
        require(j.get("headSha") == args.reviewed_head and j.get("runHeadSha") == args.reviewed_head and j.get("appId") == 15368, "required check identity/head")
        require(j.get("event") == "pull_request" and j.get("status") == "completed" and j.get("conclusion") == "success", "required check is not successful")
        require(j.get("runAttempt") == j.get("jobRunAttempt") and isinstance(j.get("runAttempt"), int) and j["runAttempt"] > 0, "latest attempt binding")
        require(j.get("runId") in ci.get("latestPRWorkflowRunIds", []) and j.get("jobId") == j.get("checkRunId"), "job/run proof binding")
        require(str(j.get("htmlUrl", "")).startswith("https://github.com/lemmonchess333/Maiin/actions/runs/") and j.get("completedAt"), "actual CI URL/time")
        runs = [run for run in ci.get("verifiedWorkflowRuns", []) if run.get("runId") == j["runId"]]
        require(len(runs) == 1 and runs[0].get("event") == "pull_request" and runs[0].get("headSha") == args.reviewed_head and runs[0].get("runAttempt") == j["runAttempt"], "actual latest PR-event workflow attempt")
        require(any(pr.get("number") == args.pr_number and pr.get("headSha") == args.reviewed_head for pr in runs[0].get("pullRequests", [])), "actual workflow run belongs to this PR")
    pagination = ci.get("pagination", {})
    require(bool(pagination) and all(page.get("complete") is True for page in pagination.values()), "complete current-head CI inventory")
    proof = read(args.merge_proof)
    # Supports an actual connector/REST merge observation or a factual parent
    # evidence wrapper, never just a manually supplied merge SHA success label.
    actual = proof.get("observedPR", proof)
    require(actual.get("merged") is True and actual.get("state", "closed") == "closed", "actual PR merged observation")
    number = actual.get("number", actual.get("pr", proof.get("prNumber", proof.get("pr"))))
    url = actual.get("html_url", actual.get("url", proof.get("prUrl", proof.get("url"))))
    head = actual.get("head", {})
    head = head.get("sha") if isinstance(head, dict) else head
    head = actual.get("headSha", actual.get("reviewedHead", head))
    merged_sha = actual.get("merge_commit_sha", actual.get("mergeSha", actual.get("sha")))
    merged_at = actual.get("merged_at", actual.get("mergedAt"))
    require(number == args.pr_number and url == args.pr_url and head == args.reviewed_head, "actual merge observation PR/head")
    require(merged_sha == args.merge_sha and isinstance(merged_at, str) and merged_at, "actual merge SHA/time success")
    merged_time = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
    require(merged_time.tzinfo is not None, "actual merge timestamp timezone")
    for job in jobs:
        require(datetime.fromisoformat(job["completedAt"].replace("Z", "+00:00")) <= merged_time, "required check did not precede merge")
    require(git_text("branch", "--show-current") == "main" and git_text("rev-parse", "HEAD") == args.merge_sha, "clean actual merged main checkout required")
    require(not git_text("status", "--porcelain"), "repository is not clean")
    subprocess.run(["git", "merge-base", "--is-ancestor", BASE, args.merge_sha], cwd=REPO, check=True)
    return ci, actual, merged_at


def audit(args):
    ci, actual_merge, merged_at = validate_publication(args)
    reviewed = tree_map(args.reviewed_head)
    merged = tree_map(args.merge_sha)
    parent_sha = git_text("rev-parse", args.merge_sha + "^1")
    parent = tree_map(parent_sha)
    changed = [p.decode("utf-8") for p in git("diff", "--no-renames", "--name-only", "-z", BASE, args.reviewed_head).split(b"\0") if p]
    require(changed and all(reviewed.get(p) == merged.get(p) for p in changed), "reviewed changed-file mode/type/blob differs from actual merge")
    other_merge_differences = sorted(p for p in set(reviewed) | set(merged) if reviewed.get(p) != merged.get(p))
    require(all(p not in changed and merged.get(p) == parent.get(p) for p in other_merge_differences), "unreviewed change is not inherited from actual main merge parent")
    previous = read(R / "previous-artwork-hashes.json")
    require(len(previous) == 903 and all(sha(safe_file(REPO, p)) == h for p, h in previous.items()), "903 existing public artwork changed")
    require(sha(REPO / "docs/exercise-art/identity/athlete-anatomy-v3.png") == CANONICAL, "canonical FA56 changed")
    provenance = read(ARCHIVE / "provenance.json")
    manifest = provenance.get("sourceHashes", {})
    current_names = {p.relative_to(ARCHIVE).as_posix() for p in ARCHIVE.rglob("*") if p.is_file() and p != ARCHIVE / "provenance.json"}
    require(isinstance(manifest, dict) and set(manifest) == current_names and bool(manifest), "source archive manifest is missing/stale/not exhaustive")
    require(all(re.fullmatch(r"[0-9a-f]{64}", h) and sha(safe_file(ARCHIVE, p)) == h for p, h in manifest.items()), "post-format sealed archive source hash mismatch")
    require(provenance.get("canonicalSha256") == CANONICAL and provenance.get("sourcePoseOrder") == ORDER and provenance.get("physicalPoses") == 3 and provenance.get("newImageRequests") == 3, "archive provenance scope")
    require((ARCHIVE / ".gitattributes").read_bytes() == b"# Preserve archived byte hashes.\n* -text\n", "archive byte preservation")
    raw_staged = load_zip("review-inputs-exact.zip")
    staged = bind_raw_zip(raw_staged, "staged-visual-validation.json")
    raw_integrated = load_zip("integrated-review-inputs-exact.zip")
    integrated = bind_raw_zip(raw_integrated, "integrated-visual-validation.json")
    correction = None
    if sha(REPO / "src/lib/releasedFormPlacards.ts") != integrated["reviewedPublicAssetHashes"]["src/lib/releasedFormPlacards.ts"]:
        correction = runpy.run_path(str(R / "review-beat-position-correction.py"), run_name="postmerge_readonly_position_correction")["verify_saved_correction"]()
    for report in [staged, integrated]:
        require(report.get("sourcePoseOrder") == ORDER and report.get("physicalPoses") == 3 and report.get("nativeDimensions") == list(SIZE), "exact reviewed exercise scope")
    for theme in ["light", "dark"]:
        mobile = integrated.get("mobile", {}).get(theme, {})
        require(mobile.get("viewport") == [390, 844] and mobile.get("frames") == [1, 2, 3, 4, 5, 6] and mobile.get("loop6to1") is True, "actual integrated mobile " + theme)
    require(integrated.get("controls", {}).get("consoleErrors") == [] and integrated.get("publicCardByteExactToReviewed") is True, "actual integrated review/card")
    controls = integrated["controls"]
    require(controls.get("pauseObserved") is True and controls.get("slowerPressed") == "true" and SETUP[0] in controls.get("preparation", ""), "actual integrated preparation/controls")
    require(controls.get("selectSix", "").endswith("/6.webp") and controls.get("nextWrap", "").endswith("/1.webp") and controls.get("previousWrap", "").endswith("/6.webp"), "actual integrated wrap controls")
    require(1.8 < integrated.get("timing", {}).get("ratio", 0) < 2.2, "actual integrated slower timing")
    for path, expected in integrated["reviewedPublicAssetHashes"].items():
        current = sha(safe_file(REPO, path))
        if current != expected:
            require(path == "src/lib/releasedFormPlacards.ts" and correction is not None and correction["originalCodeSha256"] == expected and correction["currentCodeSha256"] == current, "actual merged public/code bytes differ without exact reviewed t-only correction: " + path)
    prompts = load_zip("original-prompts-exact.zip")
    calls = provenance.get("sourceGenerations", [])
    require(len(calls) == 3 and set(prompts) == {c["prompt"] for c in calls}, "three exact original prompts")
    for call in calls:
        require(digest(prompts[call["prompt"]]) == call["promptSha256"] and prompts[call["prompt"]] == (R / call["prompt"]).read_bytes(), "exact original prompt hash/bytes")
        require(sha(safe_file(ARCHIVE, call["workspaceSource"])) == call["sourceSha256"], "actual original source pixels")
    static = json.loads(raw_staged["static-finishing-review-independent.json"])
    card_review = json.loads(raw_staged["prepared-card-review-independent.json"])
    require(static.get("status") == "passed-static-finishing-only" and static.get("allStaticChecksPassed") is True, "actual static finishing review")
    require(card_review.get("status") == "passed-prepared-card-static-review-only" and card_review.get("allStaticChecksPassed") is True and all(card_review["preservationChecks"].values()), "actual alpha-only card review")
    require(read(ARCHIVE / "static-finishing-review-independent.json") == static and read(ARCHIVE / "prepared-card-review-independent.json") == card_review, "formatted static/card review semantics changed")
    for name, expected in card_review["reviewedInputs"].items():
        require(name in raw_staged and digest(raw_staged[name]) == expected, "raw prepared-card reviewed input")
    poses = {}
    for index, pose in enumerate(static["poses"], 1):
        require(pose["pose"] == index and all(pose.get(k) is True for k in ["allNeutralPixelsOutsideExistingColourFieldsExact", "originalAlphaExact", "commonCropMatchesNativeFinished", "reopenedOraMatchesFramed"]), "per-pose preservation/static checks")
        for name, key in [(pose["source"], "sourceSha256"), (f"{index}-native-finished.png", "nativeFinishedSha256"), (f"{index}-framed.png", "framedSha256"), (f"{index}-framed.ora", "oraSha256")]:
            require(sha(ARCHIVE / name) == pose[key], "actual merged reviewed pose hash " + name)
        source = np.asarray(image(ARCHIVE / pose["source"]))
        finished = np.asarray(image(ARCHIVE / f"{index}-native-finished.png"))
        fields = (np.asarray(image(ARCHIVE / f"{index}-primary-core.png"))[:, :, 3] > 0) | (np.asarray(image(ARCHIVE / f"{index}-secondary-lats-deltoids.png"))[:, :, 3] > 0)
        require(source.shape == finished.shape and np.array_equal(source[~fields], finished[~fields]) and np.array_equal(source[:, :, 3], finished[:, :, 3]), "actual finished neutral human/alpha pixels")
        framed = image(ARCHIVE / f"{index}-framed.png")
        require(framed.size == SIZE and framed.tobytes() == image(ARCHIVE / f"{index}-native-finished.png").crop(CROP).tobytes(), "actual common unscaled crop")
        poses[index] = reopen_ora(ARCHIVE / f"{index}-framed.ora")
        require(poses[index].tobytes() == framed.tobytes(), "actual ORA layers differ from framed pixels")
    exports = json.loads(subprocess.check_output([str(NODE), "--import", str(REPO / "node_modules/tsx/dist/loader.mjs"), str(R / "postmerge-export-data.mjs"), str(REPO)], cwd=R))
    registry = exports["releases"]
    base_ids = historical_registry_ids(BASE)
    parent_ids = historical_registry_ids(parent_sha)
    require(len(base_ids) == 120 and "ab-wheel" not in parent_ids and base_ids <= parent_ids, "approved base sets preserved in actual merge parent")
    require(set(registry) == parent_ids | {"ab-wheel"}, "actual merge adds exactly Ab Wheel to approved sets inherited from main")
    approved_hashes = 0
    for eid, entry in registry.items():
        record = read(REPO / f"docs/exercise-art/releases/{entry['folder']}/{eid}.json")
        require(record.get("exerciseId") == eid and record.get("decision") == "approved" and len(record.get("frames", [])) == 6, "actual approved release " + eid)
        require(record["version"] == entry["version"] and [record["width"], record["height"]] == [entry["width"], entry["height"]], "registry release dimensions/version")
        for f in record["frames"]:
            require(sha(safe_file(REPO / "public", f["path"])) == f["sha256"], "all approved public frame hashes")
            approved_hashes += 1
    record = read(REPO / "docs/exercise-art/releases/2026-10-14/ab-wheel.json")
    require(record["version"] == "anatomy-v3-2026-10-14-intact-ab-wheel-cycle-v1" and [record["width"], record["height"]] == list(SIZE), "actual Ab Wheel release version/dimensions")
    require(record["sourcePoseOrder"] == ORDER and record["physicalPoses"] == 3 and record["newImageRequests"] == 3 and record["authoredSetupInstructions"] == SETUP, "actual Ab Wheel release scope/setup")
    placard = exports["abWheelPlacard"]
    require(placard["key"] == {"primary": ["Core"], "secondary": ["Lats", "Shoulders"], "secondaryFill": "solid"} and placard["authoredSetupInstructions"] == SETUP, "actual Ab Wheel muscle/setup placard")
    beats = placard["beats"]
    expected_beats = [{**b, "image": f"form-frames/ab-wheel/{i}.webp"} for i, b in enumerate(json.loads(raw_integrated["draft-beats.json"]), 1)]
    if correction is not None:
        require([b["t"] for b in expected_beats] == correction["beforeT"], "historical pre-correction positions preserved")
        expected_beats = [{**b, "t": correction["afterT"][i]} for i, b in enumerate(expected_beats)]
    require(len(beats) == 6 and beats == expected_beats, "actual six cues/images and separately reviewed corrected pose coordinates")
    cue_sha = digest(json.dumps([{k: b[k] for k in ["label", "cue"]} for b in beats], ensure_ascii=False, separators=(",", ":")).encode())
    require(cue_sha == record["cueSha256"] == staged["cueSha256"] == integrated["cueSha256"], "actual cue hash")
    require(exports["releases"]["ab-wheel"]["reference"] == 1 and record["reference"] == {"path": "form-frames/ab-wheel/1.webp", "sha256": record["frames"][0]["sha256"]}, "actual reference1")
    for number, source_pose in enumerate(ORDER, 1):
        path = REPO / f"public/form-frames/ab-wheel/{number}.webp"
        require(record["frames"][number - 1]["path"] == f"form-frames/ab-wheel/{number}.webp" and image(path).size == SIZE and image(path).tobytes() == poses[source_pose].tobytes(), "six distinct native source paths")
    require(image(REPO / "masters/ab-wheel/1.png").tobytes() == poses[1].tobytes() and sha(REPO / "masters/ab-wheel/1.png") == static["poses"][0]["framedSha256"], "master exact reference1")
    prepared = REPO / "docs/exercise-art/cutout-sources/ab-wheel.png"
    card = REPO / "public/form-art/ab-wheel.webp"
    require(sha(prepared) == card_review["reviewedInputs"]["prepared-card-source.png"] and sha(card) == card_review["reviewedInputs"]["card-cutout.webp"] and image(card).size == (480, 479), "final reviewed card/prepared source/dimensions")
    prepared_pixels = np.asarray(image(prepared))
    framed_pixels = np.asarray(poses[1])
    require(np.array_equal(prepared_pixels[:, :, :3], framed_pixels[:, :, :3]) and np.all(prepared_pixels[:, :, 3][np.max(framed_pixels[:, :, :3], axis=2) > 110] == 255), "alpha-only prepared RGB/bright athlete opacity")
    cutout = exports["cutouts"]["ab-wheel"]
    require(cutout["src"] == "form-art/ab-wheel.webp" and cutout["source"] == record["reference"]["path"] and cutout["sourceSha256"] == record["reference"]["sha256"] and cutout["sha256"] == sha(card) and cutout["keyed"] is False and [cutout["width"], cutout["height"]] == [480, 479], "actual generated cutout metadata")
    cutout_source = read(REPO / "docs/exercise-art/cutout-sources/ab-wheel.json")
    require(cutout_source["imageSha256"] == sha(prepared) and cutout_source["referenceSha256"] == record["reference"]["sha256"], "actual reviewed cutout source metadata")
    public_paths = {p.relative_to(REPO).as_posix() for folder in ["public/form-frames", "public/form-art"] for p in (REPO / folder).rglob("*") if p.is_file()}
    expected_new = {f"public/form-frames/ab-wheel/{n}.webp" for n in range(1, 7)} | {"public/form-art/ab-wheel.webp"}
    extras = public_paths - set(previous) - expected_new
    require(set(previous) | expected_new <= public_paths, "old/new artwork file missing")
    require(all(p in parent and merged.get(p) == parent.get(p) for p in extras), "extra artwork not inherited from actual merge parent")
    require(len(registry) >= 121 and approved_hashes == len(registry) * 6 and len(public_paths) == 910 + len(extras), "actual approved/artwork counts")
    checks = read(ARCHIVE / "project-checks.json")
    require(checks.get("baselineHead") == BASE and all(checks.get(k) is True for k in ["allNormalVerifyStagesPresent", "comparisonComplete", "inputStatePreserved"]) and checks.get("unresolvedAdditionalFailureIdentities") == [], "actual completed branch/baseline comparison")
    require(checks.get("overallVerifyExitCode") in [0, 1] and checks.get("fullWindowsNonGreen") == (checks["overallVerifyExitCode"] != 0), "honest non-green Windows ledger")
    for name, expected in checks["evidenceHashes"].items():
        require(sha(safe_file(ARCHIVE, name)) == expected, "branch check raw evidence changed")
    # No repo state changes occurred during this audit.
    require(not git_text("status", "--porcelain") and git_text("rev-parse", "HEAD") == args.merge_sha, "repository changed during audit")
    result = {
        "passed": True, "auditedAt": datetime.now(timezone.utc).isoformat(),
        "exerciseId": "ab-wheel", "pr": args.pr_number, "url": args.pr_url,
        "head": args.reviewed_head, "mergeSha": args.merge_sha, "mergedAt": merged_at,
        "merged": True, "status": "merged", "requiredCiConclusion": "success",
        "requiredChecks": ci["requiredChecks"], "cleanCheckout": True,
        "localMainHead": args.merge_sha, "reviewedBaseline": BASE,
        "changedFileBlobsMatchMergedCommit": len(changed), "changedPaths": changed,
        "wholeReviewedTreeMatchesMerge": reviewed == merged,
        "inheritedMainDifferences": other_merge_differences,
        "actualMergeParent": parent_sha, "approvedSets": len(registry),
        "baseApprovedSets": len(base_ids), "mergeParentApprovedSets": len(parent_ids),
        "legitimateInheritedAdditionalApprovedSets": sorted(parent_ids - base_ids),
        "approvedFrameHashesVerified": approved_hashes, "publicArtworkFiles": len(public_paths),
        "legitimateInheritedAdditionalArtwork": sorted(extras), "priorArtworkPreserved": 903,
        "canonicalSha256": CANONICAL, "sourceArchiveHashesVerified": len(manifest),
        "sourceArchiveProvenanceSha256": sha(ARCHIVE / "provenance.json"),
        "exactPromptBytesVerified": 3, "exactReviewedStagedAndIntegratedZipBindings": True,
        "editablesReopenedExact": 3, "publicFramesPixelExact": 6,
        "masterMatchesReferenceFrame1": True, "cardByteExact": True,
        "physicalPoses": 3, "sourcePoseOrder": ORDER, "newImageRequests": 3,
        "cueSha256": cue_sha, "authoredSetupInstructions": SETUP,
        "separatePositionMetadataCorrection": None if correction is None else {"review": "checks/corrected-beat-metadata-review.json", "beforeT": correction["beforeT"], "afterT": correction["afterT"], "currentCodeSha256": correction["currentCodeSha256"], "historicalReviewRewritten": False},
        "fullWindowsVerifyExitCode": checks["overallVerifyExitCode"],
        "fullWindowsNonGreen": checks["fullWindowsNonGreen"],
        "minorFindings": record["minorFindings"],
        "inputProofHashes": {"ci": sha(args.ci_proof), "actualMerge": sha(args.merge_proof)},
        "completionCredit": True, "fullObjectiveComplete": False,
        "noGoalTransition": True,
    }
    return result, beats, provenance


def record_progress(report, package_report):
    path = WORK / "revised-conversion-progress-20261009.json"
    progress = read(path)
    completed = progress["completedThisContinuation"]
    remaining = progress["remaining"]
    ids = [row["id"] for row in remaining]
    already_done = "ab-wheel" in completed
    if already_done:
        require(len(completed) == 33 and len(remaining) == 22 and "ab-wheel" not in ids, "unexpected already-completed progress")
        require(progress.get("latestMergedConversion", {}).get("mergeSha") == report["mergeSha"], "idempotent progress merge identity")
        return False
    require(len(completed) == 32 and len(set(completed)) == 32 and len(remaining) == 23 and ids.count("ab-wheel") == 1 and progress["remainingNeedsArtwork"] == 23, "progress precondition32/23")
    require(sum(row["state"] == "image-service-blocked" for row in remaining) == 21 and "spin-bike" in ids, "preserved21 service holds and Spin Bike")
    completed.append("ab-wheel")
    progress["remaining"] = [row for row in remaining if row["id"] != "ab-wheel"]
    require(len(completed) == 33 and len(progress["remaining"]) == 22, "new completion counts")
    progress.update({
        "date": datetime.now(timezone.utc).date().isoformat(),
        "remainingNeedsArtwork": 22, "serviceRejected": 21, "otherHeld": 1,
        "existingCompletedPreserved": True, "latestCompleted": ["ab-wheel"],
        "latestInProgress": None, "activeDraft": None, "pendingPublication": None,
        "preparedDraftsAwaitingPublication": [], "nextDraft": None,
        "goalStatus": "Incomplete;33 continuation conversions actually merged,22 unfinished. No goal transition by postmerge audit.",
        "blockReason": "22 unfinished:21 documented historical moderation/safety refusals remain untouched; Spin Bike remains mechanically held after its permitted correction. Ab Wheel is now actually merged after its independent no-shorts source route and all release gates.",
        "nextWork": "Preserve all finished artwork and the no-shorts model.21 documented service refusals remain untouched; Spin Bike remains mechanically held. No accepted conversion is left unpublished by this audit; the complete objective remains unfinished.",
        "latestPreservationAudit": "ab-wheel/intact-whole-athlete-production-20261014/merged-preservation-audit.json",
        "latestDraftChecks": f"Actual merged main {report['mergeSha']}: {report['approvedSets']} approved sets/{report['approvedFrameHashesVerified']} frame hashes, all903 prior public artwork/FA56 unchanged, {report['sourceArchiveHashesVerified']} source hashes and3 pixel-exact reopened ORAs. Full Windows exit{report['fullWindowsVerifyExitCode']} remains disclosed; actual current-head required CI passed.",
        "latestMergedConversion": {k: report[k] for k in ["pr", "url", "merged", "mergedAt", "head", "mergeSha", "requiredCiConclusion", "approvedSets", "approvedFrameHashesVerified", "sourceArchiveHashesVerified", "priorArtworkPreserved", "newImageRequests"]},
        "publication": {**{k: report[k] for k in ["exerciseId", "pr", "url", "head", "mergeSha", "merged", "mergedAt", "status", "requiredCiConclusion"]}, "completionCredit": True, "evidence": "ab-wheel/intact-whole-athlete-production-20261014/MERGED.json", "editablePackage": "ab-wheel/intact-whole-athlete-production-20261014/ab-wheel-editables-merged.zip", "packageBytes": package_report["packageBytes"], "packageSha256": package_report["packageSha256"]},
    })
    progress["projectChecks"] = [
        f"PR{report['pr']} required current-head unit/emulator-tests passed before actual merge {report['mergeSha']}.",
        "Native1448x924 and actual registered390x844 light/dark/all6/loop/card/setup/controls passed; three editable stacks reopened pixel-exact.",
        f"Normal full Windows exit{report['fullWindowsVerifyExitCode']} is disclosed with fresh82d6 baseline and completed additional-failure comparison; no false full-green claim.",
        f"Actual merge audit verifies{report['changedFileBlobsMatchMergedCommit']} changed-file blobs,903 prior public files/FA56, {report['approvedSets']} approved sets/{report['approvedFrameHashesVerified']} frame hashes, {report['sourceArchiveHashesVerified']} current source hashes and exact prompt/staged/integrated ZIP bindings.",
    ]
    atomic_write(path, json_bytes(progress))
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pr-number", type=int, required=True)
    parser.add_argument("--pr-url", required=True)
    parser.add_argument("--reviewed-head", required=True)
    parser.add_argument("--merge-sha", required=True)
    parser.add_argument("--ci-proof", type=Path, required=True)
    parser.add_argument("--merge-proof", type=Path, required=True)
    parser.add_argument("--record-progress", action="store_true", help="Only after all audit/package gates pass, atomically record33 merged/22 unfinished in existing external progress JSON")
    args = parser.parse_args()
    report, beats, provenance = audit(args)
    merged = {**report, "preservationAuditPassed": True, "preservationAudit": "merged-preservation-audit.json", "ciEvidence": "required-ci-current-head.json", "actualMergeEvidence": "actual-merge-observation.json", "editablePackage": "ab-wheel-editables-merged.zip"}
    entries = {"sources/" + p.relative_to(ARCHIVE).as_posix(): p.read_bytes() for p in sorted(ARCHIVE.rglob("*")) if p.is_file()}
    for n in range(1, 7):
        entries[f"frames/{n}.webp"] = (REPO / f"public/form-frames/ab-wheel/{n}.webp").read_bytes()
    entries.update({
        "master/1.png": (REPO / "masters/ab-wheel/1.png").read_bytes(),
        "reference/1.webp": (REPO / "public/form-frames/ab-wheel/1.webp").read_bytes(),
        "card/ab-wheel.webp": (REPO / "public/form-art/ab-wheel.webp").read_bytes(),
        "card/prepared-card-source.png": (REPO / "docs/exercise-art/cutout-sources/ab-wheel.png").read_bytes(),
        "card/reviewed-source.json": (REPO / "docs/exercise-art/cutout-sources/ab-wheel.json").read_bytes(),
        "release/ab-wheel.json": (REPO / "docs/exercise-art/releases/2026-10-14/ab-wheel.json").read_bytes(),
        "release/actual-merged-cues.json": json_bytes({"beats": beats, "authoredSetupInstructions": SETUP}),
        "evidence/MERGED.json": json_bytes(merged),
        "evidence/merged-preservation-audit.json": json_bytes(report),
        "evidence/required-ci-current-head.json": args.ci_proof.read_bytes(),
        "evidence/actual-merge-observation.json": args.merge_proof.read_bytes(),
        "evidence/postmerge-audit-script.py": Path(__file__).read_bytes(),
        "evidence/postmerge-export-data.mjs": (R / "postmerge-export-data.mjs").read_bytes(),
    })
    package = R / "ab-wheel-editables-merged.zip"
    temporary = R / "ab-wheel-editables-merged.zip.tmp"
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(entries.items()):
            z.writestr(name, data)
    with zipfile.ZipFile(temporary) as z:
        require(z.testzip() is None and set(z.namelist()) == set(entries) and all(digest(z.read(n)) == digest(data) for n, data in entries.items()), "postmerge package readback/bytes")
    os.replace(temporary, package)
    package_report = {"exerciseId": "ab-wheel", "merged": True, "pr": args.pr_number, "mergeSha": args.merge_sha, "package": str(package), "packageBytes": package.stat().st_size, "packageSha256": sha(package), "packageEntryCount": len(entries), "allPackageBytesReadbackExact": True, "fullObjectiveComplete": False, "noGoalTransition": True}
    atomic_write(R / "MERGED.json", json_bytes(merged))
    atomic_write(R / "merged-preservation-audit.json", json_bytes(report))
    # Copy exact proof bytes with stable evidence names without rewriting their contents.
    atomic_write(R / "required-ci-current-head.json", args.ci_proof.read_bytes())
    atomic_write(R / "actual-merge-observation.json", args.merge_proof.read_bytes())
    package_report["progressUpdated"] = record_progress(report, package_report) if args.record_progress else False
    package_report["completionProgressCounts"] = {"merged": 33, "unfinished": 22} if args.record_progress else "Not changed; --record-progress not supplied"
    atomic_write(R / "completion-package.json", json_bytes(package_report))
    print(json.dumps(package_report, indent=2))


if __name__ == "__main__":
    main()
