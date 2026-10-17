"""Candidate local registration. DO NOT RUN until actual staged gates pass.

No generation, code poses, tests, push, PR, merge, quota or completion update.
All preflight gates precede the first repository write. Parent owns execution.
"""
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
import hashlib
import json
import runpy
import shutil
import subprocess
import zipfile

R = Path(__file__).resolve().parent
gate = runpy.run_path(str(R/"validate-staged.py"), run_name="ab_wheel_registration_gates")
REPO, EID, BASE, BRANCH = (gate[k] for k in ["REPO", "EID", "BASE", "BRANCH"])
require, read, sha = (gate[k] for k in ["require", "read", "sha"])
ORDER, SIZE, CROP, CANONICAL = (gate[k] for k in ["ORDER", "SIZE", "CROP", "CANONICAL"])

def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")

def main():
    current = lambda *args: subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()
    require(current("branch", "--show-current") == BRANCH and current("rev-parse", "HEAD") == BASE, "exact target branch based on reviewed current main")
    require(not current("status", "--porcelain=v1"), "clean repository immediately before local registration")
    reviewed = read("staged-visual-validation.json")
    require(reviewed.get("passed") is True, "completed actual staged acceptance")
    actual = gate["validate"](write_report=False)
    for key in ["baselineHead", "canonicalSha256", "physicalPoses", "sourcePoseOrder", "nativeDimensions", "commonCrop", "reference", "cueSha256", "authoredSetupInstructions", "reviewedAssetHashes"]:
        require(reviewed.get(key) == actual[key], "accepted staged report no longer matches current inputs: " + key)
    require(actual["completionCredit"] is False, "staged acceptance makes no completion claim")
    beats, measurements, calls = (read(name) for name in ["draft-beats.json", "measurements-independent.json", "provenance.json"])
    public = REPO/f"public/form-frames/{EID}"
    record_path = REPO/f"docs/exercise-art/releases/2026-10-14/{EID}.json"
    master = REPO/f"masters/{EID}/1.png"
    archive = REPO/f"docs/exercise-art/sources/{EID}/2026-10-14"
    cutouts = REPO/"docs/exercise-art/cutout-sources"
    outputs = [public, record_path, master, archive, cutouts/f"{EID}.png", cutouts/f"{EID}.json"]
    require(not any(p.exists() for p in outputs), "new target paths must not replace existing artwork")
    placards = REPO/"src/lib/releasedFormPlacards.ts"
    code = placards.read_text(encoding="utf-8")
    needle = "export const RELEASED_FORM_PLACARDS = {\n"
    require(needle in code and "authoredSetupInstructions?: string[]" in code and f'"{EID}": placard(' not in code, "existing placard API and unique insertion")
    require(actual["authoredSetupInstructions"][0] in (REPO/"src/lib/exercises.ts").read_text(encoding="utf-8"), "unchanged catalogue preparation")
    fixed = measurements["proposedReleaseFixedAnchors"]
    dims = measurements["proposedReleaseInvariantDimensions"]
    frame_records = []
    for n, pose in enumerate(ORDER, 1):
        index = pose-1
        upper, lower = (a["expectedCropPoints"][index] for a in fixed)
        frame_records.append({"path": f"form-frames/{EID}/{n}.webp", "sha256": sha(R/f"final-frames/{n}.webp"), "sourcePose": pose,
                              "anchors": {"padUpperRightOuterEdge": {"x": upper[0], "y": upper[1]}, "padFrontLowerPlateauMidpoint": {"x": lower[0], "y": lower[1]}},
                              "invariantDimensions": {"padProjectedHorizontalSpan": dims[0]["valuesPx"][index], "tyreBrightNeutralVerticalContourSpan": dims[1]["valuesPx"][index]}})
    timing = actual["controls"]["measuredTiming"]
    signoff = read("staged-parent-visual-signoff.json")
    evidence = {
        "identity": "Native FA56 and all three originals/finished poses were actually reviewed: same bald faceless lean pale anatomy athlete, white trainers, smooth neutral featureless pelvis, no shorts/waistband, inherited fine neutral shading. Three original sources and exact prompts/tool-output provenance are preserved; no unavailable raw request ID is invented.",
        "camera": "All originals1536x1024 use the same oblique kneeling scene. One whole-scene scale1 crop[48,8,1496,932] gives1448x924; no resampling, body translation, warping, limb fitting or grafting. Measured exposed pad anchors are actual native features converted by subtracting48,8.",
        "anatomy": "Three genuine intact Brace/Roll/Reach sources and all six native paths were reviewed. Adult proportions and no-shorts identity remain coherent during articulation. Small knee/trainer contours redraw; these are disclosed, not fitted. Reach retains residual hip flexion and is not represented as fully horizontal or perfectly straight.",
        "equipment": "One dark ordinary broad tyre, transverse axle and two closed grips persist. Projected bright-neutral tyre contour span193px in all3 at common threshold30 with10-pixel contiguous runs; threshold35 gives192/193/193px. Exposed axle-tip span289/277/260px changes10.035% in projection, judged minor tip/contour variation without gross hub or grip failure; no calibrated3D radius, shaft-length, grip-width or invented yaw justification.",
        "contact": "Both knees remain supported by the fixed pad and both rear trainers rest behind. Both hands remain connected around one wheel axle/hub. Actual cropped pad anchors: upper-right(540,802) all3 and lower-front(335,855)/(335.5,855)/(335.5,855), max0.5px. Pad x span352/351/352px, max0.284%. Failed shoe brightness-span/toe metrics and small knee redraws are separately archived, not claimed to pass strict1px/1%.",
        "physics": "Complete controlled-range kneeling rollout: braced wheel-under-shoulders start, genuine outward shoulder/hip travel, longer neutral-braced reach/hold, then controlled reverse return to brace without sitting back onto heels. Reach is visibly clear of floor without lumbar sag or chest collapse; it retains some hip flexion. Wheel ground-path y travel follows the oblique scene.",
        "muscles": "Catalogue Core primary#7B72E9 and Lats/Shoulders secondary#9590E0, solid inherited source colour fields and source-derived fine contours. Independent native finishing review binds all3 source/finished/framed/ORA hashes and preservation checks; no new gradient, anatomy reconstruction or gear change.",
        "cueAgreement": signoff["checks"]["cueAgreement"]["evidence"] + " Exact catalogue initial kneeling setup remains written Preparation. Six short cues describe actual Brace/Roll/Reach/Hold/Return/Reset states; three physical sources reused honestly in order[1,2,3,3,2,1].",
        "sequenceAndLoop": signoff["checks"]["nativeManual"]["evidence"] + " " + signoff["checks"]["nativeTimed"]["evidence"] + " Six distinct1448x924 decoded paths match three self-contained reopened ORA/framed poses exactly. Actual sequential6-to-1 observed.",
        "mobileLight": signoff["checks"]["mobileLight"]["evidence"] + " " + signoff["checks"]["cardAndPreparation"]["evidence"],
        "mobileDark": signoff["checks"]["mobileDark"]["evidence"] + " " + signoff["checks"]["pauseSelectWrapSlower"]["evidence"] + f" Measured normal{timing['normalMedianMs']}ms/slower{timing['slowerMedianMs']}ms."
    }
    record = {"exerciseId": EID, "version": "anatomy-v3-2026-10-14-intact-ab-wheel-cycle-v1", "width": SIZE[0], "height": SIZE[1], "decision": "approved", "reviewer": "Codex native, independent static/card and actual staged mobile review", "reviewedAt": actual["reviewedAt"], "reference": {"path": f"form-frames/{EID}/1.webp", "sha256": frame_records[0]["sha256"]}, "cueSha256": actual["cueSha256"], "checks": {k: {"passed": True, "evidence": v} for k,v in evidence.items()}, "frames": frame_records, "physicalPoses": 3, "sourcePoseOrder": ORDER, "newImageRequests": 3, "authoredSetupInstructions": actual["authoredSetupInstructions"], "sourceRoute": "Three fresh intact whole-athlete FA56 sources; colour/inherited-contour finishing, one common scale1 crop and reviewed alpha-only card floor cleanup. No old clothing inputs, anatomical transforms or reconstructed body parts.", "measurementMethods": {"fixedAnchors": fixed, "invariantDimensions": dims, "scope": "Visible projected raster features, not calibrated3D dimensions."}, "minorFindings": actual["minorFindings"], "baseline": {"head": BASE, "exitCode": actual["baselineExitCode"], "fullWindowsNonGreen": actual["baselineFullWindowsNonGreen"], "evidence": "Fresh normal verify completed with exact snapshot/input preservation; result/log/failures archived. Non-green baseline is not a green branch claim."}, "integrationValidation": "Actual staged native/static/card/mobile accepted. Registered public paths, normal branch verification, source seal, required current-head CI and actual merge remain pending before completion credit."}
    # Capture accepted raw review bytes before archive formatting can change text.
    archive_inputs = {p.relative_to(R).as_posix(): p for p in R.iterdir() if p.is_file() and p.suffix.lower() in [".png", ".webp", ".ora", ".npy", ".json", ".py", ".txt", ".md", ".mts", ".mjs", ".html", ".tsx"]}
    for subdir in ["final-frames", "baseline"]:
        archive_inputs.update({p.relative_to(R).as_posix(): p for p in (R/subdir).rglob("*") if p.is_file()})
    require("staged-visual-validation.json" in archive_inputs and "staged-parent-visual-signoff.json" in archive_inputs, "raw accepted review evidence to archive")
    for name in actual["reviewedAssetHashes"]:
        require(name in archive_inputs, "accepted input omitted from archive " + name)
    rows = "\n".join("      [" + str(b["t"]) + ", " + json.dumps(b["label"]) + ", " + json.dumps(b["cue"]) + "]," for b in beats)
    block = f'  "{EID}": placard(\n    "{EID}",\n    ["Core"],\n    ["Lats", "Shoulders"],\n    [\n{rows}\n    ],\n    ' + json.dumps(actual["authoredSetupInstructions"]) + "\n  ),\n"
    # First repository write follows all acceptance/target/preservation checks.
    placards.write_text(code.replace(needle, needle+block), encoding="utf-8")
    public.mkdir(parents=True)
    for n in range(1,7):
        shutil.copy2(R/f"final-frames/{n}.webp", public/f"{n}.webp")
    master.parent.mkdir(parents=True)
    shutil.copy2(R/"1-framed.png", master)
    require(Image.open(master).convert("RGBA").tobytes() == Image.open(public/"1.webp").convert("RGBA").tobytes(), "registered reference exactly master")
    record_path.parent.mkdir(parents=True, exist_ok=True)
    save(record_path, record)
    cutouts.mkdir(parents=True, exist_ok=True)
    shutil.copy2(R/"prepared-card-source.png", cutouts/f"{EID}.png")
    save(cutouts/f"{EID}.json", {"reviewStatus": "reviewed", "image": f"{EID}.png", "imageSha256": sha(cutouts/f"{EID}.png"), "reference": record["reference"]["path"], "referenceSha256": record["reference"]["sha256"], "method": "Exact native frame1 RGB; reviewed alpha-only floor/background cleanup preserving bright body/trainers and dark wheel/axle/pad, followed by unchanged standard card generator.", "reviewEvidence": "Independent prepared-card proofs/light/dark/160px passes and actual staged390x844 light/dark card; registered card review pending."})
    archive.mkdir(parents=True)
    (archive/".gitattributes").write_bytes(b"# Preserve archived byte hashes.\n* -text\n")
    with zipfile.ZipFile(archive/"review-inputs-exact.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for name, path in sorted(archive_inputs.items()):
            z.writestr(name, path.read_bytes())
    with zipfile.ZipFile(archive/"original-prompts-exact.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for entry in calls["calls"]:
            z.writestr(entry["prompt"], (R/entry["prompt"]).read_bytes())
    for name, path in sorted(archive_inputs.items()):
        destination_name = "source-call-provenance.json" if name == "provenance.json" else name + ".txt" if name.endswith(".tsx") else name
        destination = archive/destination_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    (archive/"README.md").write_text("Ab Wheel Rollout source archive\n\nThree original intact no-shorts canonical sources and their actual prompt/tool-output provenance are preserved. Six separate paths reuse three physical poses in [1,2,3,3,2,1]. Source/cue/card/static/native/mobile byte bindings are preserved in review-inputs-exact.zip; exact original prompt bytes are also in original-prompts-exact.zip.\n\nReach is controlled range with residual hip flexion, not a fully horizontal endpoint. Minor knee/trainer contour redraws and projected exposed axle-tip variation are disclosed in independent measurements and release findings; no3D calibration is claimed. Source image pixels were not warped, grafted or independently fitted.\n\nArchived React review fixtures end in .tsx.txt because they are historical standalone browser evidence, not application modules. Restore their original .tsx name outside the repository to run the historical harness; do not treat archived HTML as an integrated app test. All .mts/.mjs/.html/.json copies must receive ordinary formatting before seal-source.py computes final archive sourceHashes. The exact pre-format review bytes remain in the ZIP. .gitattributes keeps committed archive bytes unchanged.\n\nStaged acceptance is not merge/completion credit. Actual integrated review, normal full branch verification/comparison, source sealing, required current-head CI and merge evidence remain separate.\n", encoding="utf-8")
    save(archive/"provenance.json", {"exerciseId": EID, "canonicalSha256": CANONICAL, "sourceGenerations": calls["calls"], "sourcePoseOrder": ORDER, "physicalPoses": 3, "newImageRequests": 3, "method": record["sourceRoute"], "originalPromptBytesArchive": "original-prompts-exact.zip", "acceptedReviewBytesArchive": "review-inputs-exact.zip", "sourceHashes": {}, "archiveStatus": "Copied accepted source/review bytes; integrated review, normal branch checks, formatting and source seal pending."})
    print(json.dumps({"locallyRegistered": EID, "frames": 6, "physicalPoses": 3, "newImageRequests": 3, "baselineExitCode": actual["baselineExitCode"], "completionCredit": False, "sourceArchive": str(archive), "next": "Normal generators/formatting, actual registered-path native/mobile/card review, one normal full branch verify and fresh failure comparison, seal, required current-head CI, then actual merge."}, indent=2))

if __name__ == "__main__":
    main()
