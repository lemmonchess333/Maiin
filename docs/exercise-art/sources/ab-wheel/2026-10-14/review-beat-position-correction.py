"""Minimal separate evidence for the actual registered Ab Wheel t-only fix.

prepare writes external before/after snapshots, exact patch and pending proposal.
accept requires actual parent review, then writes a new addendum/current-code ZIP;
--archive copies only those new files into the unsealed archive. Historical draft,
reviews and ZIPs are never changed. This helper does not edit code or run tests.
"""
from pathlib import Path
import argparse
import difflib
import hashlib
import json
import re
import shutil
import zipfile

R=Path(__file__).resolve().parent
REPO=R.parents[1]/"Maiin-burpees"
A=REPO/"docs/exercise-art/sources/ab-wheel/2026-10-14"
CODE="src/lib/releasedFormPlacards.ts"
BASE="82d6d829ad20ad3c8924933f736ad615b83054f6"
BEFORE=[0,0.2,0.4,0.6,0.8,1]
AFTER=[0,0.5,1,1,0.5,0]
LABELS=["Brace","Roll","Reach","Hold","Return","Reset"]
REVIEW="checks/corrected-beat-metadata-review.json"
SIGNOFF="checks/corrected-beat-metadata-parent-signoff.json"
PATCH="checks/ab-wheel-t-only.patch"
OLD="checks/ab-wheel-code-before.ts.txt"
NEW="checks/ab-wheel-code-after.ts.txt"
ZIP="corrected-beat-metadata-inputs-exact.zip"
sha_bytes=lambda data:hashlib.sha256(data).hexdigest()
sha=lambda path:sha_bytes(path.read_bytes())

def require(value,why):
    if not value:raise RuntimeError("Position correction refused: "+why)

def read(path):
    require(path.is_file(),"missing "+str(path))
    return json.loads(path.read_text(encoding="utf-8-sig"))

def local(name):
    path=(R/name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(R.resolve()) and path.is_file(),"unsafe/missing evidence "+name)
    return path

def unchanged_write(path,data):
    if path.exists():require(path.read_bytes()==data,"never overwrite earlier correction evidence "+str(path))
    else:path.write_bytes(data)

def proposal():
    integrated=read(R/"integrated-visual-validation.json")
    historic=A/"integrated-review-inputs-exact.zip"
    with zipfile.ZipFile(historic) as z:
        require(z.testzip() is None and len(z.namelist())==len(set(z.namelist())),"historical integrated ZIP integrity")
        require(z.read("integrated-visual-validation.json")== (R/"integrated-visual-validation.json").read_bytes(),"historical integrated report unchanged")
        old=z.read("repo/"+CODE)
        raw_beats=json.loads(z.read("draft-beats.json"))
    require(sha_bytes(old)==integrated["reviewedPublicAssetHashes"][CODE],"original full-code snapshot matches historical review")
    require(raw_beats==read(R/"draft-beats.json") and [b["t"] for b in raw_beats]==BEFORE and [b["label"] for b in raw_beats]==LABELS,"original draft preserved, including its pre-fix t values")
    text=old.decode("utf-8")
    start=text.index('  "ab-wheel": placard(')
    end=text.index("\n  ),",start)+len("\n  ),")
    block=text[start:end]
    rows=list(re.finditer(r'(?m)^([ \t]*\[)([0-9.]+)(,\s*"(Brace|Roll|Reach|Hold|Return|Reset)"[^\n]*)$',block))
    require(len(rows)==6 and [m.group(4) for m in rows]==LABELS and [float(m.group(2)) for m in rows]==BEFORE,"exact six original Ab Wheel scalar tokens")
    index=iter(AFTER)
    corrected=re.sub(r'(?m)^([ \t]*\[)([0-9.]+)(,\s*"(Brace|Roll|Reach|Hold|Return|Reset)"[^\n]*)$',lambda m:m.group(1)+str(next(index))+m.group(3),block)
    expected=(text[:start]+corrected+text[end:]).encode("utf-8")
    current=(REPO/CODE).read_bytes()
    require(current==expected,"entire current code differs ONLY by the five changed Ab Wheel t tokens; all other bytes exact")
    immutable={name:digest for name,digest in integrated["reviewedPublicAssetHashes"].items() if name!=CODE}
    require(all(sha(REPO/name)==digest for name,digest in immutable.items()),"all other reviewed public/card/master/prepared/code bytes unchanged")
    patch="".join(difflib.unified_diff(text.splitlines(keepends=True),expected.decode("utf-8").splitlines(keepends=True),fromfile="reviewed/"+CODE,tofile="corrected/"+CODE)).encode("utf-8")
    facts={"exerciseId":"ab-wheel","baselineHead":BASE,"changedFiles":[CODE],"beforeT":BEFORE,"afterT":AFTER,"originalCodeSha256":sha_bytes(old),"currentCodeSha256":sha_bytes(current),"originalCodeProof":OLD,"currentCodeProof":NEW,"patch":{"path":PATCH,"sha256":sha_bytes(patch)},"historicalIntegratedZipSha256":sha(historic),"historicalIntegratedReviewSha256":sha(R/"integrated-visual-validation.json"),"historicalDraftSha256":sha(R/"draft-beats.json"),"unchangedReviewedPublicAssetHashes":immutable,"cueSha256":integrated["cueSha256"],"positionMeaning":"t is the authored legacy pose excursion coordinate: Brace0, intermediate Roll0.5, Reach/Hold1, Return0.5, Reset0. It is not playback time or a measurement that Roll is spatially exactly halfway.","visualEvidenceScope":"Original native/mobile/card proofs are pre-metadata-fix evidence of unchanged image/cue/controls appearance. They are not retroactively represented as a review of corrected t values.","rawEvidenceZip":ZIP}
    return facts,{OLD:old,NEW:current,PATCH:patch}

def prepare():
    facts,proofs=proposal()
    for name,data in proofs.items():unchanged_write(R/name,data)
    pending={"status":"pending-parent-review-of-t-only-correction","passed":False,**facts}
    unchanged_write(R/"checks/corrected-beat-metadata-proposal.json",(json.dumps(pending,indent=2)+"\n").encode())
    return pending

def accepted_review():
    facts,proofs=proposal()
    for name,data in proofs.items():require(local(name).read_bytes()==data,"exact code/patch proof "+name)
    parent=read(R/SIGNOFF)
    require(parent.get("status")=="parent-reviewed-t-only-position-metadata-correction" and bool(parent.get("reviewer")) and bool(parent.get("reviewedAt")),"actual parent correction review")
    for key in ["exactTOnlyCodeDiff","poseCoordinateMeaning","framePlayerBehaviorAndVisualCarryForward","normalFocusedChecks"]:
        check=parent.get("checks",{}).get(key,{})
        require(check.get("passed") is True and bool(check.get("evidence")),"actual parent "+key)
    hashes=parent.get("reviewedEvidenceHashes",{})
    require(isinstance(hashes,dict) and {OLD,NEW,PATCH}.issubset(hashes),"parent reviewed both complete code snapshots and exact patch")
    require(any("focused" in name and name.endswith(".log") for name in hashes) and any("focused" in name and name.endswith(".json") for name in hashes),"actual normal focused result/log bindings")
    for name,digest in hashes.items():require(sha(local(name))==digest,"changed parent-reviewed evidence "+name)
    return {"status":"reviewed-t-only-position-metadata-correction","passed":True,"reviewer":parent["reviewer"],"reviewedAt":parent["reviewedAt"],**facts,"reviewedEvidenceHashes":{**hashes,SIGNOFF:sha(R/SIGNOFF)},"historicalEvidenceRewritten":False,"imagesChanged":False,"newImageRequests":0,"fullVerifyClaim":"The first full pre-fix Windows run remains non-green with the real closure regression retained. The actual t-only fix is reviewed separately with normal focused whole-file results; final required current-head CI remains separate.","completionCredit":False}

def verify_saved_correction():
    expected=accepted_review()
    require(read(R/REVIEW)==expected,"current accepted correction report unchanged")
    require(read(A/REVIEW)==expected,"formatted archived correction report semantics unchanged")
    with zipfile.ZipFile(A/ZIP) as z:
        require(z.testzip() is None and len(z.namelist())==len(set(z.namelist())),"current-code ZIP integrity")
        require(json.loads(z.read(REVIEW))==expected,"exact raw accepted correction report")
        for name,digest in expected["reviewedEvidenceHashes"].items():require(sha_bytes(z.read(name))==digest,"exact correction review byte binding "+name)
        require(z.read("repo/"+CODE)==(REPO/CODE).read_bytes(),"current registered code exactly accepted correction ZIP")
    return expected

def accept(archive):
    review=accepted_review()
    unchanged_write(R/REVIEW,(json.dumps(review,indent=2)+"\n").encode())
    inputs={name:local(name).read_bytes() for name in review["reviewedEvidenceHashes"]}
    inputs[REVIEW]=(R/REVIEW).read_bytes()
    inputs["repo/"+CODE]=(REPO/CODE).read_bytes()
    inputs["review-beat-position-correction.py"]=Path(__file__).read_bytes()
    target=R/ZIP
    require(not target.exists(),"preserve existing current-code ZIP; do not silently overwrite")
    with zipfile.ZipFile(target,"w",zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(inputs.items()):z.writestr(name,data)
    if archive:
        require(read(A/"provenance.json").get("sourceHashes")=={},"copy correction before source seal")
        for name in set(review["reviewedEvidenceHashes"])|{REVIEW}:
            destination=A/name
            destination.parent.mkdir(parents=True,exist_ok=True)
            unchanged_write(destination,(R/name).read_bytes())
        unchanged_write(A/ZIP,target.read_bytes())
        unchanged_write(A/"review-beat-position-correction.py",Path(__file__).read_bytes())
        verify_saved_correction()
    return review

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["prepare","accept"])
    parser.add_argument("--archive",action="store_true")
    args=parser.parse_args()
    result=prepare() if args.mode=="prepare" else accept(args.archive)
    print(json.dumps({k:result[k] for k in ["status","passed","changedFiles","beforeT","afterT","originalCodeSha256","currentCodeSha256"]},indent=2))
