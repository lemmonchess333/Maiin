from pathlib import Path
import copy
import datetime
import hashlib
import json
import shutil
import subprocess
import zipfile

R = Path(__file__).resolve().parent
REPO = R.parents[1] / "Maiin-burpees"
EID = "rear-delt-machine-fly"
SOURCE_ID = "reverse-pec-deck"
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text(encoding="utf-8-sig"))
save = lambda p, data: p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

assert subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip() == "artwork/rear-delt-equivalent-source-20261014"
baseline = read(R / "checks/baseline-summary.json")
assert baseline["head"] == "26326d712111a3f8cb80fc825d037fef976ee5de" and baseline["snapshotRestoredExact"]
validation = read(R / "staged-visual-validation.json")
assert validation["passed"] and validation["framesByteExactToApprovedSource"] == 6
equivalence = read(R / "source-equivalence.json")
assert equivalence["imagePixelsChanged"] == equivalence["imageRequestsThisRoute"] == 0
previous = read(R / "previous-artwork-hashes.json")
assert all(sha(REPO / name) == expected for name, expected in previous.items())
assert sha(REPO / "docs/exercise-art/identity/athlete-anatomy-v3.png") == equivalence["canonicalSha256"]
parent_record = read(REPO / equivalence["sourceReleasePath"])
assert parent_record["decision"] == "approved"
for frame in equivalence["frames"]:
    assert sha(REPO / "public" / frame["sourcePath"]) == frame["sha256"]
    assert (R / f"final-frames/{frame['beat']}.webp").read_bytes() == (REPO / "public" / frame["sourcePath"]).read_bytes()

public = REPO / f"public/form-frames/{EID}"
record_path = REPO / f"docs/exercise-art/releases/2026-10-14/{EID}.json"
master = REPO / f"masters/{EID}/1.png"
assert not public.exists() and not record_path.exists() and not master.exists()
public.mkdir(parents=True)
for beat in range(1, 7): shutil.copy2(R / f"final-frames/{beat}.webp", public / f"{beat}.webp")
master.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(R / "1-native.png", master)

beats = read(R / "draft-beats.json")
placards = REPO / "src/lib/releasedFormPlacards.ts"
text = placards.read_text(encoding="utf-8")
assert f'"{EID}": placard(' not in text
rows = "\n".join("      [" + str(b["t"]) + ", " + json.dumps(b["label"]) + ", " + json.dumps(b["cue"]) + "]," for b in beats)
block = f'  "{EID}": placard(\n    "{EID}",\n    ["Rear Delts"],\n    ["Rhomboids", "Traps"],\n    [\n{rows}\n    ]\n  ),\n'
needle = "export const RELEASED_FORM_PLACARDS = {\n"
assert needle in text
placards.write_text(text.replace(needle, needle + block), encoding="utf-8")

record = copy.deepcopy(parent_record)
record.update(exerciseId=EID, version="anatomy-v3-2026-10-14-reviewed-equivalent-rear-delt-fly-v1",
              reviewer="Codex exact catalogue equivalence, native and actual target mobile review",
              reviewedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              separatelyAuthoredTargetPoses=0, imagePixelsChanged=0,
              sourceReuse=dict(exerciseId=SOURCE_ID, release=equivalence["sourceReleasePath"],
                               releaseSha256=equivalence["sourceReleaseSha256"],
                               rationale=equivalence["equivalenceFinding"], newImageRequests=0),
              integrationValidation="Target staged native/mobile/card/controls passed. Registered target review, full project verification and required CI/actual merge pending before completion credit.")
for frame in record["frames"]:
    frame["path"] = frame["path"].replace(SOURCE_ID, EID)
record["reference"]["path"] = record["reference"]["path"].replace(SOURCE_ID, EID)
record["cueSha256"] = hashlib.sha256(json.dumps([dict(label=b["label"], cue=b["cue"]) for b in beats], separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
for key, check in record["checks"].items():
    check["evidence"] += " Exact existing approved source pixels are reused for the equivalent catalogue movement; no new target image authoring or finishing. Original source review remains linked."
record["checks"]["cueAgreement"]["evidence"] = "Target Reach/Open/Squeeze/Hold/Return/Reset captions reviewed against the target catalogue and actual staged guide; all at most7words. Three existing physical poses across six distinct target paths1,2,3,3,2,1; reuse explicitly disclosed."
record["checks"]["sequenceAndLoop"]["evidence"] = "Actual six target paths decoded and manually reviewed at natural/rendered856x1008, plus timed loop6to1. Byte-identical to source approved paths. Three copied OpenRaster editables independently reopened to identical delivered pixels."
for theme, key in [("light", "mobileLight"), ("dark", "mobileDark")]:
    record["checks"][key]["evidence"] = f"Actual target ExerciseFormContent at verified390x844 {theme}, all6 target frames and6to1 observed. Correct target captions/key, full athlete/apparatus, closed grips and planted trainers. Pause/select6/next6to1/previous1to6/slower passed;console errors0;normal1209ms/slower2410ms. Registered-path review follows before completion credit."
record["minorFindings"] = ["Exact source reuse is appropriate because both catalogue IDs define the same chest-supported machine rear-deltoid movement. No claim of independently authored target imagery.", "Three physical poses across six separate paths; endpoint hold and reversed return reuse disclosed.", "The apparatus is the approved generic articulated machine interpretation, not a new Insignia-specific rendering or calibrated3D certificate."]
record_path.parent.mkdir(parents=True, exist_ok=True)
save(record_path, record)

archive = REPO / f"docs/exercise-art/sources/{EID}/2026-10-14"
assert not archive.exists()
archive.mkdir(parents=True)
(archive / ".gitattributes").write_bytes(b"# Preserve archived byte hashes.\n* -text\n")
names = ["source-equivalence.json", "source-provenance.json", "draft-beats.json", "staged-visual-validation.json", "staged-controls.json", "staged-dark-trace.json", "staged-light-trace.json", "staged-slower-trace.json", "staged-dark.png", "staged-light.png", "staged-dark-full-page.png", "staged-light-full-page.png", "native-manual-trace.json", "native-timed-trace.json", "native-first-full-page.png", "native-wide-full-page.png", "draft-audit.json", "framing.json", "articulated-equipment-provenance.json", "sequence-measurements.json", "prepare.py", "validate-staged.py", "register-reviewed.py"]
names += [f"{pose}-{suffix}" for pose in [1,2,3] for suffix in ["framed.ora", "native.png"]]
original_prompts = []
for source in equivalence["sourceGenerations"]:
    names.append(source["path"])
    original_prompts.append(source["prompt"])
for name in names: shutil.copy2(R / name, archive / name)
for name in ["baseline-verify-result.json", "baseline-summary.json", "baseline-failure-headers.json"]:
    shutil.copy2(R / "checks" / name, archive / name)
with zipfile.ZipFile(archive / "original-prompts-exact.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in original_prompts: z.writestr(name, (R / name).read_bytes())
for name in original_prompts:
    (archive / name).write_text((R / name).read_text(encoding="utf-8-sig"), encoding="utf-8", newline="\n")
save(archive / "provenance.json", dict(exerciseId=EID, canonicalSha256=equivalence["canonicalSha256"],
     method="Exact pre-existing approved source reuse for an equivalent catalogue movement. No new image request, pose authoring, fitting, grafting or pixel changes.",
     existingApprovedSource=SOURCE_ID, sourceRelease=equivalence["sourceReleasePath"],
     sourceGenerations=equivalence["sourceGenerations"], sourcePoseOrder=[1,2,3,3,2,1],
     separatelyAuthoredTargetPoses=0, originalPromptBytesArchive="original-prompts-exact.zip",
     sourceHashes={}, archiveStatus="Source hashes will be finalized after normal formatting and integrated target review, before commit."))

integrated = (R / "review-vite.config.mjs").read_text(encoding="utf-8")
integrated = integrated.replace("plugins:[staged,react(),tailwindcss()]", "plugins:[react(),tailwindcss()]")
integrated = integrated.replace("port:8771", "port:8772")
(R / "integrated-vite.config.mjs").write_text(integrated, encoding="utf-8")
(R / "integrated-review.html").write_text((R / "mobile-review.html").read_text().replace("mobile-review.tsx", "integrated-review.tsx"), encoding="utf-8")
wrapper = (R / "mobile-review.tsx").read_text().replace("Staged equivalent catalogue entry: exact approved-source reuse", "Registered catalogue entry: reviewed exact source reuse")
wrapper = wrapper.replace('src="/card-cutout.webp"', f'src="/form-art/{EID}.webp"')
(R / "integrated-review.tsx").write_text(wrapper, encoding="utf-8")
print(json.dumps(dict(locallyRegisteredTarget=EID, frames=6, sourcePixelsChanged=0, priorArtworkPreserved=len(previous), remaining="standard generators/card, registered review and full checks/CI/merge")))
