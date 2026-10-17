from pathlib import Path
from PIL import Image
import hashlib
import io
import json
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile

R = Path(__file__).resolve().parent
WORK = R.parents[1]
REPO = WORK / "Maiin-burpees"
OLD = WORK / "reverse-pec-deck/rigid-equipment-production"
TEMPLATE = WORK / "deadlift/original-source-review-20261014"
EID = "rear-delt-machine-fly"
SOURCE_ID = "reverse-pec-deck"
read = lambda p: json.loads(p.read_text(encoding="utf-8-sig"))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
save = lambda name, data: (R / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

catalogue_text = (REPO / "src/lib/exercises.ts").read_text(encoding="utf-8")
definitions = {}
for eid in [EID, SOURCE_ID]:
    block = re.search(r'id: "' + re.escape(eid) + r'",(.*?)\n  \},', catalogue_text, re.S).group(1)
    definitions[eid] = dict(id=eid, instructions=re.findall(r'"([^"]+)"', re.search(r'instructions: \[(.*?)\]', block, re.S).group(1)))
    for key in ["name", "category", "muscleGroup", "mechanic", "equipment"]:
        definitions[eid][key] = re.search(key + r': "([^"]+)"', block).group(1)
    definitions[eid]["secondaryMuscles"] = sorted(re.findall(r'"([^"]+)"', re.search(r'secondaryMuscles: \[(.*?)\]', block, re.S).group(1)))
for key in ["category", "muscleGroup", "mechanic", "equipment", "secondaryMuscles"]:
    assert definitions[EID][key] == definitions[SOURCE_ID][key], key
rig_text = (REPO / "src/lib/bodyRig.ts").read_text(encoding="utf-8")
assert "the same machine, the same picture from" in rig_text
release_path = REPO / "docs/exercise-art/releases/2026-10-12/reverse-pec-deck.json"
release = read(release_path)
assert release["decision"] == "approved" and len(release["frames"]) == 6
assert (release["width"], release["height"]) == (856, 1008)
canonical = REPO / "docs/exercise-art/identity/athlete-anatomy-v3.png"
canonical_hash = "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b"
assert sha(canonical) == canonical_hash

(R / "final-frames").mkdir(exist_ok=True)
frames = []
order = [1, 2, 3, 3, 2, 1]
for n, frame in enumerate(release["frames"], 1):
    original = REPO / "public" / frame["path"]
    assert sha(original) == frame["sha256"]
    destination = R / f"final-frames/{n}.webp"
    shutil.copy2(original, destination)
    assert destination.read_bytes() == original.read_bytes()
    frames.append(dict(beat=n, sourcePath=frame["path"], targetPath=f"form-frames/{EID}/{n}.webp", sha256=sha(destination), sourcePose=order[n-1], byteExact=True))

editable_rows = []
for pose in [1, 2, 3]:
    ora = OLD / f"{pose}-framed.ora"
    with zipfile.ZipFile(ora) as z:
        root = ET.fromstring(z.read("stack.xml"))
        merged = Image.new("RGBA", (int(root.attrib["w"]), int(root.attrib["h"])))
        for layer in reversed(list(root.find("stack"))):
            merged = Image.alpha_composite(merged, Image.open(io.BytesIO(z.read(layer.attrib["src"]))).convert("RGBA"))
        assert merged.tobytes() == Image.open(io.BytesIO(z.read("mergedimage.png"))).convert("RGBA").tobytes()
        assert merged.convert("RGB").tobytes() == Image.open(R / f"final-frames/{pose}.webp").convert("RGB").tobytes()
    shutil.copy2(ora, R / ora.name)
    shutil.copy2(OLD / f"{pose}-framed.png", R / f"{pose}-native.png")
    editable_rows.append(dict(pose=pose, file=ora.name, sha256=sha(ora), reopenedExact=True, deliveredPixelsExact=True))

card = REPO / f"public/form-art/{SOURCE_ID}.webp"
shutil.copy2(card, R / "card-cutout.webp")
source_provenance = read(OLD / "provenance.json")
for source in source_provenance["sources"]:
    original = OLD / source["path"]
    source_record = release["frames"][source["pose"]-1]["observedContacts"]
    assert sha(original) == source_record["sourceSha256"]
    for name in [source["path"], source["prompt"]]: shutil.copy2(OLD / name, R / name)
for name in ["articulated-equipment.py", "finish.py", "draft-audit.json", "framing.json", "articulated-equipment-provenance.json", "sequence-measurements.json"]:
    shutil.copy2(OLD / name, R / name)
shutil.copy2(OLD / "provenance.json", R / "source-provenance.json")

labels = ["Reach", "Open", "Squeeze", "Hold", "Return", "Reset"]
cues = ["Keep your chest against the pad.", "Open both arms with elbows softly bent.", "Spread the handles; keep your shoulders down.", "Hold wide without arching or shrugging.", "Return slowly; keep your elbows softly bent.", "Keep tension as the handles return."]
beats = [dict(t=t, label=label, cue=cue, image=f"/form-frames/{EID}/{n}.webp") for n, (t, label, cue) in enumerate(zip([0,.5,1,1,.5,0], labels, cues), 1)]
assert all(len(b["cue"].split()) <= 7 for b in beats)
save("draft-beats.json", beats)
save("source-equivalence.json", dict(exerciseId=EID, existingApprovedSource=SOURCE_ID,
     catalogueDefinitions=definitions, equivalenceFinding="Both catalogue entries specify the same seated chest-supported pec-deck rear-deltoid shoulder sweep, fixed soft elbow bend, shoulder-height closed grips and controlled return under tension. bodyRig explicitly documents the same machine/picture. Distinct IDs remain; this is reviewed exact source reuse, not an approximate alias.",
     catalogueSha256=sha(REPO / "src/lib/exercises.ts"), rigSha256=sha(REPO / "src/lib/bodyRig.ts"),
     sourceReleasePath=str(release_path.relative_to(REPO)), sourceReleaseSha256=sha(release_path),
     canonicalSha256=canonical_hash, imageRequestsThisRoute=0, imagePixelsChanged=0,
     originalHeldStudiesUsed=False, blockedRenderOrRepairRequested=False,
     sourcePoseOrder=order, physicalPoses=3, separatelyAuthoredTargetPoses=0,
     sourceGenerations=source_provenance["sources"], frames=frames, editables=editable_rows,
     cardSha256=sha(card), cardDimensions=Image.open(card).size,
     status="Staged exact reuse; native/actual target mobile review and release checks required. No completion credit."))

config = (TEMPLATE / "review-vite.config.mjs").read_text().replace("deadlift", EID)
config = config.replace("width:940,height:940", "width:856,height:1008")
config = config.replace('["Glutes","Hamstrings"]', '["Rear Delts"]').replace('["Erectors","Traps"]', '["Rhomboids","Traps"]')
config = config.replace("8769", "8771")
(R / "review-vite.config.mjs").write_text(config)
mobile = (TEMPLATE / "mobile-review.tsx").read_text().replace("Deadlift", "Rear Delt Machine Fly")
mobile = mobile.replace("Staged draft: three poses, six playback beats", "Staged equivalent catalogue entry: exact approved-source reuse")
(R / "mobile-review.tsx").write_text(mobile)
(R / "mobile-review.html").write_text((TEMPLATE / "mobile-review.html").read_text().replace("Deadlift", "Rear Delt Machine Fly"))
native = (TEMPLATE / "index.html").read_text(encoding="utf-8").replace("Deadlift", "Rear Delt Machine Fly")
native = native.replace("width:940px;height:940px", "width:856px;height:1008px").replace('width="940" height="940"', 'width="856" height="1008"')
native = native.replace("[1,1,2,3,3,2]", "[1,2,3,3,2,1]")
native = native.replace("Native940×940", "Native856×1008")
native = native.replace("Whole-scene alignment + equipment and colour only. No shoe/head/hand grafts.", "Exact reuse of already-approved equivalent catalogue movement. No pixel changes.")
native = re.sub(r"cues=\[.*?\];let beat", "cues=" + json.dumps(cues) + ";let beat", native)
(R / "native-review.html").write_text(native, encoding="utf-8")
print(json.dumps(dict(stagedExercise=EID, byteExactFrames=6, approvedSource=SOURCE_ID, editablesReopenedExact=3, productionChanges=0, imageRequests=0)))
