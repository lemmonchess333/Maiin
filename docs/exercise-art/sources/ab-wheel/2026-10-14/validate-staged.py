"""Candidate acceptance gate. Prepare only until actual reviews are complete.

Reads original/staged inputs and actual review evidence. Writes a sidecar only
when run explicitly; never writes production, edits images, or runs tests.
"""
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
import hashlib
import io
import json
import math
import re
import statistics
import subprocess
import zipfile

R = Path(__file__).resolve().parent
REPO = R.parents[1] / "Maiin-burpees"
EID = "ab-wheel"
BASE = "82d6d829ad20ad3c8924933f736ad615b83054f6"
BRANCH = "art/ab-wheel-intact-cycle-20261014"
CANONICAL = "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b"
CROP = [48, 8, 1496, 932]
SIZE = [1448, 924]
ORDER = [1, 2, 3, 3, 2, 1]
SOURCES = ["master-brace-original.png", "roll-original.png", "reach-original.png"]
STAGES = ["lint", "check:form-art", "check:form-drafts", "check:cycles", "build", "check:dist-size", "test"]
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def require(condition, message):
    if not condition:
        raise RuntimeError("Missing or failed prerequisite: " + message)

def read(name):
    path = R / name
    require(path.is_file(), name)
    return json.loads(path.read_text(encoding="utf-8-sig"))

def local(name):
    path = Path(name)
    path = path.resolve() if path.is_absolute() else (R / path).resolve()
    require(path.is_relative_to(R.resolve()), "review input outside this draft: " + str(name))
    require(path.is_file(), "reviewed input absent: " + str(name))
    return path

def verify_hashes(mapping, where):
    require(isinstance(mapping, dict) and bool(mapping), where + " must pin reviewed bytes")
    normalized = {}
    for name, digest in mapping.items():
        path = local(name)
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) is not None, where + ": invalid hash " + name)
        require(sha(path) == digest, where + ": changed reviewed bytes " + name)
        normalized[path.relative_to(R).as_posix()] = digest
    return normalized

def check_visual(mapping, where, required=None):
    require(isinstance(mapping, dict) and bool(mapping), where)
    if required:
        require(set(required).issubset(mapping), where + ": missing named visual checks")
    for name, result in mapping.items():
        require(isinstance(result, dict) and result.get("passed") is True, where + ": " + name)
        require(bool(str(result.get("evidence", "")).strip()), where + ": evidence absent for " + name)

def pixels(path):
    with Image.open(path) as im:
        return im.size, im.convert("RGBA").tobytes()

def frame_number(row):
    match = re.search(r"/([1-6])\.webp$", row.get("src", ""))
    require(match is not None, "unexpected frame source " + str(row.get("src")))
    return int(match.group(1))

def collapsed(rows):
    result = []
    for row in rows:
        number = frame_number(row)
        if not result or result[-1] != number:
            result.append(number)
    return result

def complete_forward_cycle(rows, where):
    ids = collapsed(rows)
    require(set(ids) == set(range(1, 7)), where + ": all six decoded paths")
    require(any(ids[i:i+7] == [1, 2, 3, 4, 5, 6, 1] for i in range(max(0, len(ids)-6))), where + ": actual sequential 1-to-6-to-1 loop")

def cadence(rows):
    changes = [float(b["ms"])-float(a["ms"]) for a, b in zip(rows, rows[1:])
               if a["src"] != b["src"] and 100 < float(b["ms"])-float(a["ms"]) < 5000]
    require(len(changes) >= 6, "not enough visible timed frame transitions")
    return statistics.median(changes)

def baseline_gate():
    baseline = read("baseline/baseline-verify-result.json")
    require(baseline.get("status") == "terminal" and baseline.get("head") == BASE and baseline.get("branch") == "main", "fresh full baseline on exact current main")
    require(baseline.get("initialStatus") == [] and baseline.get("oldResultDataImported") is False, "clean, freshly measured baseline")
    for key in ["inputStatePreserved", "snapshotBytesExactAfterRestoration", "allNormalVerifyStagesInvoked", "fullResultSummariesPresentAndTotalsConsistent"]:
        require(baseline.get(key) is True, "baseline " + key)
    require(baseline.get("runError") is None and baseline.get("exitCode") in [0, 1], "completed normal baseline command")
    measured = baseline["actualMeasuredLog"]
    require(measured.get("stagesInvoked") == STAGES, "all normal verify stages in baseline log")
    require(sha(R / "baseline/baseline-verify.log") == measured["logSha256"], "fresh baseline log hash")
    require(sha(R / "baseline/baseline-input-manifest.json") == baseline["inputManifestSha256"], "fresh baseline input manifest")
    require(sha(R / "baseline/baseline-planSweep-before.snap") == baseline["snapshotBeforeSha256"], "exact saved baseline snapshot")
    require(sha(REPO / baseline["snapshotPath"]) == baseline["snapshotBeforeSha256"] == baseline["snapshotFinalSha256"], "current snapshot exactly preserved")
    return baseline

def preservation_gate():
    require(sha(REPO / "docs/exercise-art/identity/athlete-anatomy-v3.png") == CANONICAL, "public canonical FA56 unchanged")
    previous = read("previous-artwork-hashes.json")
    require(isinstance(previous, dict) and bool(previous), "fresh previous public artwork hash map")
    paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASE, "--", "public/form-frames", "public/form-art"], cwd=REPO, text=True).splitlines()
    expected = {p for p in paths if Path(p).suffix.lower() in [".png", ".webp", ".jpg", ".jpeg"]}
    require(expected.issubset(previous), "previous artwork map covers every baseline public frame/card")
    for name, digest in previous.items():
        path = (REPO / name).resolve()
        require(path.is_relative_to(REPO.resolve()) and path.is_file(), "previous artwork path " + name)
        require(sha(path) == digest, "previous artwork changed " + name)
    return previous

def validate(write_report=True):
    baseline = baseline_gate()
    previous = preservation_gate()
    plan = read("plan.json")
    framing = read("framing.json")
    beats = read("draft-beats.json")
    require(plan["canonicalSha256"] == CANONICAL and plan["muscles"]["primary"] == ["Core"] and plan["muscles"]["secondary"] == ["Lats", "Shoulders"], "exact canonical and catalogue muscle roles")
    require(plan["muscles"]["primaryHex"] == "#7B72E9" and plan["muscles"]["secondaryHex"] == "#9590E0", "exact palette")
    require(framing["commonCrop"] == CROP and framing["nativeDimensions"] == SIZE and framing["sourcePoseOrder"] == ORDER and framing["physicalPoses"] == 3 and framing["anatomyTransforms"] is False and framing["equipmentEdits"] is False, "unchanged shared crop and honest physical pose count")
    require(len(beats) == 6 and [b["label"] for b in beats] == ["Brace", "Roll", "Reach", "Hold", "Return", "Reset"] and all(0 < len(b["cue"].split()) <= 7 for b in beats), "six truthful short beat cues")
    setup = ["Kneel on a pad holding the ab wheel with both hands under your shoulders."]
    require(plan["authoredSetupInstructions"] == setup and read("catalogue.json")["instructions"][0] == setup[0], "exact written catalogue preparation")
    cue_hash = hashlib.sha256(json.dumps([{k: b[k] for k in ["label", "cue"]} for b in beats], separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    calls = read("provenance.json")
    require(calls["canonicalSha256"] == CANONICAL and len(calls["calls"]) == 3 and calls["newImageRequests"] == 3, "actual three fresh source calls")
    for entry, name in zip(calls["calls"], SOURCES):
        require(entry["workspaceSource"] == name and sha(R/name) == entry["sourceSha256"] and sha(R/entry["prompt"]) == entry["promptSha256"], "original source/prompt unchanged " + name)
        require(list(Image.open(R/name).size) == [1536, 1024], "decoded original dimensions " + name)
    static = read("static-finishing-review-independent.json")
    require(static.get("status") == "passed-static-finishing-only" and static.get("allStaticChecksPassed") is True, "actual independent static finishing pass")
    require(len(static.get("poses", [])) == 3, "independent review covers all three poses")
    check_visual(static.get("visualChecks"), "independent static visual checks")
    finish = read("finishing-audit.json")
    require(len(finish) == 3, "three finishing audits")
    for pose, (audit, review, source) in enumerate(zip(finish, static["poses"], SOURCES), 1):
        for key in ["allNeutralPixelsOutsideExistingColourFieldsExact", "reopenedOraExact"]:
            require(audit.get(key) is True, "pose finishing " + key)
        require(audit.get("anatomyGeometryTransform") is False and audit.get("equipmentPixelsChanged") is False and audit.get("newGradient") is False, "colour/inherited contour finishing only")
        for key, file in [("sourceSha256", source), ("nativeFinishedSha256", f"{pose}-native-finished.png"), ("framedSha256", f"{pose}-framed.png"), ("oraSha256", f"{pose}-framed.ora")]:
            require(review.get(key) == sha(R/file), "independent pose hash " + key)
        with Image.open(R/f"{pose}-native-finished.png") as native:
            require(native.crop(CROP).convert("RGBA").tobytes() == pixels(R/f"{pose}-framed.png")[1], "exact crop from native finished pose")
        require(list(pixels(R/f"{pose}-framed.png")[0]) == SIZE, "decoded framed size")
        with zipfile.ZipFile(R/f"{pose}-framed.ora") as archive:
            with Image.open(io.BytesIO(archive.read("mergedimage.png"))) as merged:
                require(merged.convert("RGBA").tobytes() == pixels(R/f"{pose}-framed.png")[1], "reopened ORA merged raster exact")
    for beat, pose in enumerate(ORDER, 1):
        require(pixels(R/f"final-frames/{beat}.webp") == pixels(R/f"{pose}-framed.png"), "decoded frame exact to real pose " + str(beat))
    card = read("prepared-card-review-independent.json")
    require(card.get("status") == "passed-prepared-card-static-review-only" and card.get("allStaticChecksPassed") is True, "actual independent final prepared card pass; initial held card is insufficient")
    card_inputs = verify_hashes(card.get("reviewedInputs"), "independent card inputs")
    require({"final-frames/1.webp", "1-framed.png", "prepared-card-source.png", "card-cutout.webp", "prepared-card-alpha-proof.json", "staged-card-provenance.json"}.issubset(card_inputs), "card reference/prepared/proof/provenance byte bindings")
    for key in ["originalRgbExact", "allBrightNativePixelsOpaque", "darkGearPadKeyedAlphaPreserved", "bottomFloorBandTransparent", "standardGeneratorCoreExact", "finalCardReproducesFromPreparedSource", "provenanceHashesMatch"]:
        require(card.get("preservationChecks", {}).get(key) is True, "independent alpha-only card proof " + key)
    check_visual(card.get("visualChecks"), "independent card visual checks", ["light", "dark", "card160Light", "card160Dark"])
    require(len(card.get("proofFiles", [])) >= 2, "actual independent light/dark proof files")
    for proof in card["proofFiles"]:
        require(sha(local(proof["path"])) == proof["sha256"], "card proof changed " + proof["path"])
    require(Image.open(R/"prepared-card-source.png").convert("RGB").tobytes() == Image.open(R/"final-frames/1.webp").convert("RGB").tobytes(), "prepared native RGB exactly reference frame1")
    card_provenance = read("staged-card-provenance.json")
    require(card_provenance["reference"] == "form-frames/ab-wheel/1.webp" and card_provenance["sha256"] == sha(R/"card-cutout.webp"), "current final card provenance")
    require([card_provenance["width"], card_provenance["height"]] == list(Image.open(R/"card-cutout.webp").size), "decoded card dimensions")
    measurements = read("measurements-independent.json")
    require(len(measurements["proposedReleaseFixedAnchors"]) == 2 and len(measurements["proposedReleaseInvariantDimensions"]) == 2, "two real observed anchors/dimensions")
    require(all(a["pass"] is True and a["maxPairwiseEuclideanDriftPx"] <= 1 for a in measurements["proposedReleaseFixedAnchors"]), "actual exposed pad anchors")
    require(all(d["pass"] is True and d["maxDeviationFromBracePercent"] <= 1 for d in measurements["proposedReleaseInvariantDimensions"]), "actual pad and projected tyre contour dimensions")
    require(measurements["proposedCommonCrop"]["boxXYXY"] == CROP, "measurement crop conversion")
    for source in measurements["sources"]:
        require(sha(local(source["path"])) == source["sha256"], "measured native source byte binding")
    manual = read("native-manual-trace.json")
    timed = read("native-timed-trace.json")
    require(len(manual) == 6 and [frame_number(x) for x in manual] == list(range(1, 7)), "manual review all six distinct native paths")
    for row, beat in zip(manual, beats):
        require(row.get("complete") is True and row.get("natural") == SIZE and row.get("display") == SIZE and beat["cue"] in row.get("cue", ""), "manual native decoded dimensions/cue agreement")
    require(all(x.get("complete") is True and x.get("natural") == SIZE and x.get("display") == SIZE for x in timed), "timed native decoded dimensions")
    complete_forward_cycle(timed, "native timed playback")
    mobile = {}
    theme_rows = {}
    for theme in ["light", "dark"]:
        rows = read(f"staged-{theme}-trace.json")
        good = [x for x in rows if x.get("playing") and not x.get("documentHidden") and x.get("theme") == theme and x.get("viewport") == [390, 844]]
        require(good and all([x.get("naturalWidth"), x.get("naturalHeight")] == SIZE for x in good), "actual decoded mobile " + theme)
        require(all(beats[frame_number(x)-1]["label"] in x.get("alt", "") for x in good), "mobile " + theme + " actual cue labels")
        complete_forward_cycle(good, "mobile " + theme)
        theme_rows[theme] = good
        mobile[theme] = {"viewport": [390,844], "decodedDimensions": SIZE, "frames": list(range(1,7)), "sequential6to1": True, "visiblePlayingObservations": len(good)}
    controls = read("staged-controls.json")
    require(controls.get("selectSix", "").endswith("/6.webp") and controls.get("nextWrap", "").endswith("/1.webp") and controls.get("previousWrap", "").endswith("/6.webp"), "select and next/previous wrap controls")
    require(controls.get("slowerPressed") == "true" and controls.get("consoleErrors") == [], "actual slower button and no console errors")
    slower = [x for x in read("staged-slower-trace.json") if x.get("playing") and not x.get("documentHidden") and x.get("viewport") == [390,844]]
    require(slower and all([x.get("naturalWidth"), x.get("naturalHeight")] == SIZE for x in slower), "decoded slower mobile dimensions")
    complete_forward_cycle(slower, "slower mobile playback")
    normal_ms, slower_ms = cadence(theme_rows["dark"]), cadence(slower)
    require(1.8 < slower_ms/normal_ms < 2.2, "actual slower playback cadence approximately2x")
    signoff = read("staged-parent-visual-signoff.json")
    require(signoff.get("status") == "actual-staged-native-mobile-visual-review-passed", "parent actual visual review signoff, not an automatic screenshot claim")
    check_visual(signoff.get("checks"), "actual staged visual signoff", ["nativeManual", "nativeTimed", "mobileLight", "mobileDark", "pauseSelectWrapSlower", "cueAgreement", "cardAndPreparation"])
    bindings = verify_hashes(signoff.get("reviewedAssetHashes"), "actual staged reviewed inputs")
    required_names = SOURCES + [f"final-frames/{n}.webp" for n in range(1,7)] + [f"{p}-{suffix}" for p in [1,2,3] for suffix in ["framed.png", "framed.ora", "native-finished.png", "primary-core.png", "secondary-lats-deltoids.png"]]
    required_names += ["plan.json", "catalogue.json", "draft-beats.json", "provenance.json", "framing.json", "finishing-audit.json", "finish-colour.py", "prepared-card-source.png", "card-cutout.webp", "prepared-card-alpha-proof.json", "staged-card-provenance.json", "prepare-card-floor-matte.py", "stage-prepared-card.mts", "measurements-independent.json", "static-finishing-review-independent.json", "prepared-card-review-independent.json", "mobile-review.tsx", "mobile-review.html", "native-review.html", "review-vite.config.mjs", "native-manual-trace.json", "native-timed-trace.json", "staged-light-trace.json", "staged-dark-trace.json", "staged-slower-trace.json", "staged-controls.json", "previous-artwork-hashes.json", "baseline/baseline-verify-result.json", "baseline/baseline-failure-identities.json"]
    require(set(required_names).issubset(bindings), "actual visual signoff binds all source/frame/card/cue/review inputs")
    proof_bindings = verify_hashes(signoff.get("proofHashes"), "actual native/mobile visual proof files")
    require(any("native" in n for n in proof_bindings) and any("light" in n for n in proof_bindings) and any("dark" in n for n in proof_bindings), "native/light/dark actual visual proof bindings")
    result = {"exerciseId": EID, "passed": True, "reviewedAt": datetime.now(timezone.utc).isoformat(), "status": "Actual staged native/mobile/static/card accepted; registration/integrated checks/current-head CI/merge pending", "baselineHead": BASE, "baselineExitCode": baseline["exitCode"], "baselineFullWindowsNonGreen": baseline["exitCode"] != 0, "canonicalSha256": CANONICAL, "physicalPoses": 3, "sourcePoseOrder": ORDER, "newImageRequests": 3, "nativeDimensions": SIZE, "commonCrop": CROP, "reference": 1, "cueSha256": cue_hash, "authoredSetupInstructions": setup, "mobile": mobile, "controls": {**controls, "measuredTiming": {"normalMedianMs": normal_ms, "slowerMedianMs": slower_ms, "ratio": slower_ms/normal_ms}}, "cardDimensions": list(Image.open(R/"card-cutout.webp").size), "reviewedAssetHashes": {**bindings, **proof_bindings, "staged-parent-visual-signoff.json": sha(R/"staged-parent-visual-signoff.json")}, "previousArtworkHashCount": len(previous), "fixedAnchors": measurements["proposedReleaseFixedAnchors"], "invariantDimensions": measurements["proposedReleaseInvariantDimensions"], "minorFindings": ["Controlled Reach retains residual hip flexion; no fully horizontal/perfectly straight claim.", "Small knee/trainer contour redraws are disclosed; failed shoe brightness metrics are not represented as passing.", "Projected exposed axle-tip span289/277/260px varies10.035%; no calibrated3D shaft, radius, grip-width or invented yaw claim.", "Three real poses reused honestly across six separate paths."], "completionCredit": False}
    if write_report:
        (R/"staged-visual-validation.json").write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    return result

if __name__ == "__main__":
    report = validate()
    print(json.dumps({k:report[k] for k in ["exerciseId","passed","physicalPoses","sourcePoseOrder","nativeDimensions","baselineExitCode","baselineFullWindowsNonGreen","completionCredit"]},indent=2))
