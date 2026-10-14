"""Candidate final archive seal; prepare only, parent executes after formatting.

Requires actual registered-path review and an honest completed normal-check
ledger. Does not run checks, bypass hooks/CI, publish, merge or grant completion.
"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import runpy
import subprocess
import zipfile

R = Path(__file__).resolve().parent
REPO = R.parents[1]/"Maiin-burpees"
A = REPO/"docs/exercise-art/sources/ab-wheel/2026-10-14"
BASE = "82d6d829ad20ad3c8924933f736ad615b83054f6"
CANONICAL = "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b"
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def require(condition, message):
    if not condition:
        raise RuntimeError("Missing or failed prerequisite: " + message)

def read(path):
    require(path.is_file(), str(path))
    return json.loads(path.read_text(encoding="utf-8-sig"))

def member_name(name):
    require(isinstance(name, str) and bool(name), "empty/non-string ZIP member")
    require("\\" not in name and ":" not in name and "\x00" not in name, "unsafe ZIP member " + repr(name))
    path = PurePosixPath(name)
    require(not path.is_absolute() and not any(part in [".", ".."] for part in path.parts), "ZIP traversal " + name)
    require(path.as_posix() == name and not name.endswith("/"), "non-canonical ZIP file member " + name)
    return name

def zip_name(name):
    path = Path(name)
    if path.is_absolute():
        require(path.resolve().is_relative_to(R.resolve()), "review byte input outside draft")
        name = path.resolve().relative_to(R.resolve()).as_posix()
    else:
        name = path.as_posix()
    return member_name(name)

def preserve_integrated_zip(integrated, integrated_inputs, correction=None):
    """Retain only exactly bound raw members; never truncate accepted evidence."""
    expected = {member_name(name): path.read_bytes() for name, path in integrated_inputs.items()}
    public = integrated.get("reviewedPublicAssetHashes", {})
    require(isinstance(public, dict) and bool(public), "actual reviewed public byte bindings")
    for name, digest in public.items():
        relative = member_name(name)
        path = (REPO/relative).resolve()
        require(path.is_relative_to(REPO.resolve()) and path.is_file(), "reviewed public input path " + relative)
        data = path.read_bytes()
        require(re.fullmatch(r"[0-9a-f]{64}", str(digest)) is not None, "reviewed public hash " + relative)
        if hashlib.sha256(data).hexdigest() != digest:
            require(relative == "src/lib/releasedFormPlacards.ts" and correction is not None, "unreviewed public input changed " + relative)
            require(correction["originalCodeSha256"] == digest and correction["currentCodeSha256"] == hashlib.sha256(data).hexdigest(), "exact separate t-only correction binding")
            # Preserve the old code as historical accepted evidence. The new
            # code is independently bound in corrected-beat-metadata-inputs-exact.zip.
            with zipfile.ZipFile(A/"integrated-review-inputs-exact.zip") as historical:
                data = historical.read("repo/"+relative)
            require(hashlib.sha256(data).hexdigest() == digest, "historical code bytes changed")
        expected[member_name("repo/"+relative)] = data
    # The evidence-copy helper was intentionally included alongside the accepted
    # report. It is auxiliary provenance, not an invented visual-review binding.
    # Retain that one named extra only when both current/readable copies agree.
    helper = R/"validate-integrated.py"
    helper_copy = A/"validate-integrated.py"
    require(helper.is_file() and helper_copy.is_file() and helper.read_bytes() == helper_copy.read_bytes(), "exact auxiliary integrated-copy helper")
    expected["validate-integrated.py"] = helper.read_bytes()
    target = A/"integrated-review-inputs-exact.zip"
    require(target.is_file(), "copy exact integrated evidence before sealing")
    with zipfile.ZipFile(target) as z:
        require(z.testzip() is None, "integrated review ZIP corruption")
        names = z.namelist()
        require(len(names) == len(set(names)), "duplicate integrated ZIP members")
        for name in names:
            canonical = member_name(name)
            require(canonical in expected, "unchecked extra integrated ZIP member " + canonical)
            require(z.read(name) == expected[canonical], "accepted integrated ZIP member bytes changed " + canonical)
    missing = sorted(set(expected)-set(names))
    if missing:
        # Existing matching members/container stay intact. Only missing required
        # members, already checked against the same accepted bytes, are appended.
        with zipfile.ZipFile(target, "a", zipfile.ZIP_DEFLATED) as z:
            for name in missing:
                z.writestr(name, expected[name])
    with zipfile.ZipFile(target) as z:
        require(len(z.namelist()) == len(set(z.namelist())) and set(z.namelist()) == set(expected), "final integrated ZIP member accounting")
        require(all(z.read(name) == data for name, data in expected.items()), "final integrated ZIP exact byte bindings")
    return {"membersVerified": len(expected), "existingMembersRetained": len(names), "missingBoundMembersAppended": len(missing), "publicMembersVerified": len(public), "auxiliaryHelperSha256": sha(helper)}

def main():
    require(subprocess.check_output(["git","branch","--show-current"],cwd=REPO,text=True).strip() == "art/ab-wheel-intact-cycle-20261014", "target branch")
    require(sha(REPO/"docs/exercise-art/identity/athlete-anatomy-v3.png") == CANONICAL, "unchanged FA56")
    previous = read(R/"previous-artwork-hashes.json")
    require(all(sha(REPO/p) == h for p,h in previous.items()), "previous public artwork bytes")
    record = read(REPO/"docs/exercise-art/releases/2026-10-14/ab-wheel.json")
    require(record["reference"]["path"] == "form-frames/ab-wheel/1.webp" and record["sourcePoseOrder"] == [1,2,3,3,2,1], "actual reviewed release scope")
    require(len(record["frames"]) == 6 and all(sha(REPO/"public"/f["path"]) == f["sha256"] for f in record["frames"]), "all public frame hashes")
    require((REPO/"public/form-art/ab-wheel.webp").read_bytes() == (R/"card-cutout.webp").read_bytes(), "public standard card byte-exact to reviewed final card")
    staged = read(R/"staged-visual-validation.json")
    integrated = read(R/"integrated-visual-validation.json")
    correction = None
    reviewed_code_hash = integrated.get("reviewedPublicAssetHashes", {}).get("src/lib/releasedFormPlacards.ts")
    if sha(REPO/"src/lib/releasedFormPlacards.ts") != reviewed_code_hash:
        correction = runpy.run_path(str(R/"review-beat-position-correction.py"), run_name="seal_readonly_position_correction")["verify_saved_correction"]()
    require(staged.get("passed") is True and integrated.get("passed") is True and integrated.get("exerciseId") == "ab-wheel", "actual staged and registered review passes")
    require(integrated.get("publicCardByteExactToReviewed") is True, "registered card comparison")
    for theme in ["light","dark"]:
        result = integrated.get("mobile",{}).get(theme,{})
        require(result.get("viewport") == [390,844] and result.get("frames") == [1,2,3,4,5,6] and result.get("loop6to1") is True, "actual integrated mobile " + theme)
    controls = integrated.get("controls",{})
    require(controls.get("pauseObserved") is True and controls.get("consoleErrors") == [] and controls.get("slowerPressed") == "true", "actual integrated controls")
    require(controls.get("selectSix","").endswith("/6.webp") and controls.get("nextWrap","").endswith("/1.webp") and controls.get("previousWrap","").endswith("/6.webp"), "integrated select/wrap")
    require("Kneel on a pad holding the ab wheel with both hands under your shoulders." in controls.get("preparation",""), "actual integrated preparation paragraph")
    require(1.8 < integrated["timing"]["ratio"] < 2.2, "actual integrated slower timing")
    baseline = read(R/"baseline/baseline-verify-result.json")
    require(baseline["head"] == BASE and baseline.get("inputStatePreserved") is True, "fresh completed baseline preserved")
    checks = read(A/"project-checks.json")
    require(checks.get("baselineHead") == BASE and checks.get("baselineLogSha256") == baseline["actualMeasuredLog"]["logSha256"], "project check ledger uses exact fresh baseline")
    for key in ["allNormalVerifyStagesPresent","comparisonComplete","inputStatePreserved"]:
        require(checks.get(key) is True, "completed normal branch checks " + key)
    require(checks.get("unresolvedAdditionalFailureIdentities") == [], "no unresolved additional branch failures; a focused non-reproduction must retain the full-run failure and its evidence")
    require(checks.get("overallVerifyExitCode") in [0,1], "truthful terminal full verify exit")
    require(checks.get("fullWindowsNonGreen") == (checks["overallVerifyExitCode"] != 0), "non-green full suite must remain explicit")
    require(isinstance(checks.get("evidenceHashes"),dict) and bool(checks["evidenceHashes"]), "raw branch log/comparison/focused evidence hash bindings")
    for name,digest in checks["evidenceHashes"].items():
        path = (A/name).resolve()
        require(path.is_relative_to(A.resolve()) and path.is_file() and sha(path) == digest, "project evidence changed: " + name)
    require(not list(A.rglob("*.tsx")), "archived React fixtures must be .tsx.txt historical data")
    require((A/".gitattributes").read_bytes() == b"# Preserve archived byte hashes.\n* -text\n", "archive byte-preservation attributes")
    # Accepted raw staging bytes were captured before archive text formatting.
    with zipfile.ZipFile(A/"review-inputs-exact.zip") as z:
        raw_staged = json.loads(z.read("staged-visual-validation.json"))
        require(raw_staged.get("passed") is True, "exact accepted staged report in archive")
        for name,digest in raw_staged["reviewedAssetHashes"].items():
            require(hashlib.sha256(z.read(zip_name(name))).hexdigest() == digest, "exact staging byte binding " + name)
    calls = read(R/"provenance.json")["calls"]
    with zipfile.ZipFile(A/"original-prompts-exact.zip") as z:
        require(len(z.namelist()) == 3, "all three original prompts")
        for entry in calls:
            require(z.read(entry["prompt"]) == (R/entry["prompt"]).read_bytes(), "exact original prompt bytes")
            require(sha(A/entry["workspaceSource"]) == entry["sourceSha256"], "archived original source " + entry["workspaceSource"])
    # Integrated copies must already exist/formatted. Preserve exact raw reviewed
    # input bytes in a separate ZIP so formatting does not invalidate provenance.
    integrated_inputs = {"integrated-visual-validation.json": R/"integrated-visual-validation.json"}
    for name,digest in integrated.get("reviewedAssetHashes",{}).items():
        relative = zip_name(name)
        path = R/relative
        require(path.is_file() and sha(path) == digest, "integrated reviewed input bytes " + relative)
        archived = A/(relative + ".txt" if relative.endswith(".tsx") else relative)
        require(archived.is_file(), "copy/format integrated evidence before sealing " + str(archived))
        integrated_inputs[relative] = path
    require(len(integrated_inputs) > 1, "integrated reviewed input bindings")
    integrated_zip = preserve_integrated_zip(integrated, integrated_inputs, correction)
    provenance = read(A/"provenance.json")
    provenance["archiveStatus"] = "Actual integrated review and normal branch-check evidence archived; current formatted source bytes sealed. Required current-head CI and actual merge remain separate."
    provenance["sourceHashes"] = {p.relative_to(A).as_posix(): sha(p) for p in sorted(A.rglob("*")) if p.is_file() and p != A/"provenance.json"}
    (A/"provenance.json").write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    # Read back every hash after writing; provenance itself intentionally excluded
    # to avoid self-hashing. No text formatter should mutate these sealed inputs.
    require(all(sha(A/name) == digest for name,digest in read(A/"provenance.json")["sourceHashes"].items()), "final archive source seal")
    result = {"exerciseId":"ab-wheel","formattedArchiveSourceHashesVerified":len(provenance["sourceHashes"]),"originalsAndPromptBytesVerified":3,"exactReviewedStagingAndIntegratedBytesPreserved":True,"integratedZipPreservation":integrated_zip,"previousArtworkPreserved":len(previous),"publicFramesVerified":6,"publicCardByteExact":True,"baselineHead":BASE,"overallVerifyExitCode":checks["overallVerifyExitCode"],"fullWindowsNonGreen":checks["fullWindowsNonGreen"],"completionCredit":False,"remaining":"Required CI on actual current PR head, guarded merge, actual merge SHA and final public preservation verification."}
    result["separatePositionMetadataCorrection"] = None if correction is None else {"review":"checks/corrected-beat-metadata-review.json","beforeT":correction["beforeT"],"afterT":correction["afterT"],"currentCodeSha256":correction["currentCodeSha256"],"historicalReviewRewritten":False}
    (R/"pre-publication-audit.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,indent=2))

if __name__ == "__main__":
    main()
