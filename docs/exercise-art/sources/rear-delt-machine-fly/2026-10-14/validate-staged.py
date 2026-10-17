from pathlib import Path
import hashlib
import json
import re
import statistics

R = Path(__file__).resolve().parent
REPO = R.parents[1] / "Maiin-burpees"
read = lambda p: json.loads(p.read_text(encoding="utf-8-sig"))
equivalence = read(R / "source-equivalence.json")
assert equivalence["imageRequestsThisRoute"] == equivalence["imagePixelsChanged"] == 0
for frame in equivalence["frames"]:
    staged = R / f"final-frames/{frame['beat']}.webp"
    source = REPO / "public" / frame["sourcePath"]
    assert staged.read_bytes() == source.read_bytes()
    assert hashlib.sha256(staged.read_bytes()).hexdigest() == frame["sha256"]
assert all(x["reopenedExact"] and x["deliveredPixelsExact"] for x in equivalence["editables"])

native = read(R / "native-manual-trace.json")
assert len(native) == 6
assert all(x["complete"] and x["natural"] == x["display"] == [856, 1008] for x in native)
timed = read(R / "native-timed-trace.json")
assert {int(re.search(r"/([1-6])\.webp$", x["src"]).group(1)) for x in timed} == set(range(1, 7))
assert any(i and timed[i-1]["src"].endswith("/6.webp") and x["src"].endswith("/1.webp") for i, x in enumerate(timed))

themes = {}
for theme in ["dark", "light"]:
    rows = read(R / f"staged-{theme}-trace.json")
    good = [x for x in rows if x["theme"] == theme and x["viewport"] == [390, 844] and x["playing"] and not x["documentHidden"] and [x["naturalWidth"], x["naturalHeight"]] == [856, 1008]]
    assert {int(re.search(r"/([1-6])\.webp$", x["src"]).group(1)) for x in good} == set(range(1, 7))
    assert any(i and good[i-1]["src"].endswith("/6.webp") and x["src"].endswith("/1.webp") for i, x in enumerate(good))
    themes[theme] = dict(viewport=[390, 844], qualifyingObservations=len(good), decodedFrames=[1,2,3,4,5,6], loop6to1=True)

controls = read(R / "staged-controls.json")
assert controls["selectSix"].endswith("/6.webp")
assert controls["nextWrap"].endswith("/1.webp") and controls["previousWrap"].endswith("/6.webp")
assert controls["slowerPressed"] == "true" and not controls["consoleErrors"]
slow = [x for x in read(R / "staged-slower-trace.json") if x["playing"] and x["ms"] >= controls["slowerStartedAfterMs"] and x["viewport"] == [390,844]]
normal = [x for x in read(R / "staged-dark-trace.json") if x["playing"] and x["viewport"] == [390,844] and x["theme"] == "dark"]
def intervals(rows):
    return [b["ms"]-a["ms"] for a,b in zip(rows, rows[1:]) if a["src"] != b["src"] and 700 < b["ms"]-a["ms"] < 4000]
normal_median = statistics.median(intervals(normal))
slow_median = statistics.median(intervals(slow))
assert 1.8 < slow_median/normal_median < 2.2
controls["timing"] = dict(normalMedianMs=normal_median, slowerMedianMs=slow_median, ratio=slow_median/normal_median)
(R / "staged-controls.json").write_text(json.dumps(controls, indent=2) + "\n", encoding="utf-8")
beats = read(R / "draft-beats.json")
assert all(len(b["cue"].split()) <= 7 for b in beats)
out = dict(passed=True, scope="Staged exact source reuse for the catalogue's equivalent movement; not activated or counted complete.",
           nativeActualDimensions=[856,1008], nativeManualFrames=6, nativeTimedLoop6to1=True,
           mobile=themes, controls=controls, physicalPoses=3, targetPosesSeparatelyAuthored=0,
           framesByteExactToApprovedSource=6, editablesReopenedExact=3,
           sourceExercise="reverse-pec-deck", targetExercise="rear-delt-machine-fly",
           sourceCardDimensions=equivalence["cardDimensions"], sourceCardSha256=equivalence["cardSha256"],
           imageRequests=0, imagePixelsChanged=0,
           visualFinding="Same approved anatomy-v3 athlete, primary/secondary colours, neutral shading and apparatus. Chest supported, shoulders down, soft elbows, connected grips and planted trainers through outward sweep and reversed return. Native/full actual mobile light-dark checked.",
           remaining="Finish Deadlift's required CI/actual merge first, then register this exact target ID, standard card, integrated target review, project checks and normal CI/merge. No completion credit yet.")
(R / "staged-visual-validation.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out))
