"""Prepared registered-path gate and optional evidence copy. Parent executes.

Default writes only the integrated validation sidecar. --archive additionally
copies exact review evidence into the unsealed source archive and updates only
the release integrationValidation note. No tests/formatting/CI/publish/merge.
"""
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
from urllib.parse import urlparse
import argparse
import hashlib
import json
import re
import runpy
import shutil
import subprocess
import zipfile

R = Path(__file__).resolve().parent
gate = runpy.run_path(str(R/"validate-staged.py"), run_name="ab_wheel_integrated_readonly_gates")
REPO, EID, SIZE, ORDER, BASE = (gate[k] for k in ["REPO","EID","SIZE","ORDER","BASE"])
require, read, sha, verify_hashes, check_visual = (gate[k] for k in ["require","read","sha","verify_hashes","check_visual"])
A = REPO/"docs/exercise-art/sources/ab-wheel/2026-10-14"
RECORD = REPO/"docs/exercise-art/releases/2026-10-14/ab-wheel.json"
SETUP = "Kneel on a pad holding the ab wheel with both hands under your shoulders."

def save(path, value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

def frame(row):
    path = urlparse(row.get("src","")).path
    match = re.fullmatch(r"/form-frames/ab-wheel/([1-6])\.webp",path)
    require(match is not None,"actual public frame path, not a staged final-frames alias: "+str(row.get("src")))
    return int(match.group(1))

def actual_cycle(rows, where):
    ids=[]
    for row in rows:
        n=frame(row)
        if not ids or n!=ids[-1]:ids.append(n)
    require(set(ids)==set(range(1,7)),where+": all six actual public decoded paths")
    require(any(ids[i:i+7]==[1,2,3,4,5,6,1] for i in range(max(0,len(ids)-6))),where+": sequential1-to-6-to-1")

def repo_bindings(mapping):
    require(isinstance(mapping,dict) and bool(mapping),"actual integrated public asset bindings")
    result={}
    for name,digest in mapping.items():
        path=(REPO/name).resolve()
        require(path.is_relative_to(REPO.resolve()) and path.is_file(),"reviewed repository input "+name)
        require(re.fullmatch(r"[0-9a-f]{64}",str(digest)) is not None and sha(path)==digest,"changed integrated public input "+name)
        result[path.relative_to(REPO).as_posix()]=digest
    return result

def validate():
    require(subprocess.check_output(["git","branch","--show-current"],cwd=REPO,text=True).strip()=="art/ab-wheel-intact-cycle-20261014","registered review branch")
    baseline=gate["baseline_gate"]()
    previous=gate["preservation_gate"]()
    staged=read("staged-visual-validation.json")
    require(staged.get("passed") is True and staged.get("baselineHead")==BASE and staged.get("physicalPoses")==3 and staged.get("sourcePoseOrder")==ORDER and staged.get("nativeDimensions")==SIZE,"same actual accepted staged set")
    # Every reviewed source/card/cue/trace input stays bound to its accepted bytes.
    verify_hashes(staged["reviewedAssetHashes"],"accepted staged input preservation")
    beats=read("draft-beats.json")
    cue_hash=hashlib.sha256(json.dumps([{k:b[k] for k in ["label","cue"]} for b in beats],separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
    record=json.loads(RECORD.read_text(encoding="utf-8-sig"))
    require(record.get("exerciseId")==EID and record.get("decision")=="approved" and [record.get("width"),record.get("height")]==SIZE and record.get("sourcePoseOrder")==ORDER and record.get("physicalPoses")==3,"same registered release scope")
    require(record["reference"]["path"]=="form-frames/ab-wheel/1.webp" and record["cueSha256"]==cue_hash==staged["cueSha256"],"registered reference1 and exact cue digest")
    require(record.get("authoredSetupInstructions")==[SETUP],"exact registered preparation")
    require(len(record.get("frames",[]))==6,"six registered frame records")
    for n,pose in enumerate(ORDER,1):
        expected_path=f"form-frames/ab-wheel/{n}.webp"
        public=REPO/"public"/expected_path
        expected_hash=staged["reviewedAssetHashes"][f"final-frames/{n}.webp"]
        descriptor=record["frames"][n-1]
        require(descriptor["path"]==expected_path and descriptor["sourcePose"]==pose and descriptor["sha256"]==sha(public)==expected_hash,"public frame byte-exact to accepted staged beat "+str(n))
        require(gate["pixels"](public)==gate["pixels"](R/f"{pose}-framed.png"),"public decoded pose/dimensions exact "+str(n))
    require(sha(REPO/"masters/ab-wheel/1.png")==staged["reviewedAssetHashes"]["1-framed.png"],"registered master PNG byte-exact")
    require(gate["pixels"](REPO/"masters/ab-wheel/1.png")==gate["pixels"](REPO/"public/form-frames/ab-wheel/1.webp"),"registered master/reference decoded exact")
    require(sha(REPO/"public/form-art/ab-wheel.webp")==staged["reviewedAssetHashes"]["card-cutout.webp"]==sha(R/"card-cutout.webp"),"standard public card byte-exact to accepted final card")
    require(sha(REPO/"docs/exercise-art/cutout-sources/ab-wheel.png")==staged["reviewedAssetHashes"]["prepared-card-source.png"],"registered prepared source byte-exact")
    prepared=json.loads((REPO/"docs/exercise-art/cutout-sources/ab-wheel.json").read_text(encoding="utf-8-sig"))
    require(prepared["reviewStatus"]=="reviewed" and prepared["reference"]==record["reference"]["path"] and prepared["referenceSha256"]==record["reference"]["sha256"] and prepared["imageSha256"]==sha(REPO/"docs/exercise-art/cutout-sources/ab-wheel.png"),"reviewed prepared-source reference metadata")
    config=(R/"integrated-vite.config.mjs").read_text(encoding="utf-8")
    # An unused historical staged definition is allowed; it must not be a plugin.
    plugin=re.search(r"plugins\s*:\s*\[([^\]]*)\]",config)
    require(plugin is not None and re.sub(r"\s+","",plugin.group(1))=="react(),tailwindcss()","registered review has no attached staged transform/middleware plugin")
    wrapper=(R/"integrated-review.tsx").read_text(encoding="utf-8")
    require('src="/form-art/ab-wheel.webp"' in wrapper and 'exerciseName="Ab Wheel Rollout"' in wrapper,"actual app component and public card")
    mobile={};theme_rows={}
    for theme in ["light","dark"]:
        rows=read(f"integrated-{theme}-trace.json")
        good=[x for x in rows if x.get("playing") and not x.get("documentHidden") and x.get("theme")==theme and x.get("viewport")==[390,844]]
        require(good and all([x.get("naturalWidth"),x.get("naturalHeight")]==SIZE for x in good),"actual public decoded390x844 "+theme)
        require(all(x.get("alt")=="Ab Wheel Rollout, "+beats[frame(x)-1]["label"] for x in good),"actual registered label agreement "+theme)
        actual_cycle(good,"registered mobile "+theme)
        theme_rows[theme]=good
        mobile[theme]={"viewport":[390,844],"frames":[1,2,3,4,5,6],"loop6to1":True,"decodedDimensions":SIZE,"observations":len(good)}
    controls=read("integrated-controls.json")
    require(controls.get("pauseObserved") is True and controls.get("consoleErrors")==[] and controls.get("slowerPressed")=="true","actual registered pause/slower/console")
    require(controls.get("selectSix","").endswith("/6.webp") and controls.get("nextWrap","").endswith("/1.webp") and controls.get("previousWrap","").endswith("/6.webp"),"actual registered select6/next6-to-1/previous1-to-6")
    require(SETUP in controls.get("preparation",""),"actual displayed registered preparation")
    card=controls.get("card",{})
    card_size=list(Image.open(REPO/"public/form-art/ab-wheel.webp").size)
    require(card.get("complete") is True and card.get("natural")==card_size and urlparse(card.get("src","")).path=="/form-art/ab-wheel.webp","actual registered decoded card source/dimensions")
    slower=[x for x in read("integrated-slower-trace.json") if x.get("playing") and not x.get("documentHidden") and x.get("viewport")==[390,844]]
    require(slower and all([x.get("naturalWidth"),x.get("naturalHeight")]==SIZE for x in slower),"actual registered slower decode")
    require(all(x.get("alt")=="Ab Wheel Rollout, "+beats[frame(x)-1]["label"] for x in slower),"registered slower labels")
    actual_cycle(slower,"registered slower playback")
    normal_ms,slower_ms=gate["cadence"](theme_rows["dark"]),gate["cadence"](slower)
    require(1.8<slower_ms/normal_ms<2.2,"actual registered slower cadence approximately2x")
    signoff=read("integrated-parent-visual-signoff.json")
    require(signoff.get("status")=="actual-integrated-native-mobile-visual-review-passed","actual parent registered visual review signoff")
    check_visual(signoff.get("checks"),"actual registered visual checks",["registeredPathsNoStagedPlugin","mobileLight","mobileDark","pauseSelectWrapSlower","cueAgreement","cardAndPreparation","previousArtworkAndCanonical"])
    assets=verify_hashes(signoff.get("reviewedAssetHashes"),"actual registered reviewed inputs")
    require({"integrated-vite.config.mjs","integrated-review.tsx","integrated-review.html","integrated-dark-trace.json","integrated-light-trace.json","integrated-slower-trace.json","integrated-controls.json","staged-visual-validation.json","draft-beats.json"}.issubset(assets),"all actual integrated harness/trace/control/cue bindings")
    proofs=verify_hashes(signoff.get("proofHashes"),"actual registered visual proof files")
    require({"integrated-light-full-page.png","integrated-dark-full-page.png"}.issubset(proofs),"actual integrated mobile light/dark screenshots")
    public_bindings=repo_bindings(signoff.get("reviewedPublicAssetHashes"))
    expected_public={f"public/form-frames/ab-wheel/{n}.webp" for n in range(1,7)}|{"public/form-art/ab-wheel.webp","masters/ab-wheel/1.png","docs/exercise-art/cutout-sources/ab-wheel.png","src/lib/releasedFormPlacards.ts","src/lib/formArtReleases.data.ts","src/lib/formArtCutouts.data.ts"}
    require(expected_public.issubset(public_bindings),"actual public frame/card/master/prepared/placard/registry manifest bindings")
    require("docs/exercise-art/releases/2026-10-14/ab-wheel.json" not in public_bindings,"release integrationValidation note is updated after acceptance; do not bind that mutable note as an immutable public image")
    public_art=[p for part in ["public/form-frames","public/form-art"] for p in (REPO/part).rglob("*") if p.is_file() and p.suffix.lower() in [".png",".webp",".jpg",".jpeg"]]
    approved=set()
    for path in (REPO/"docs/exercise-art/releases").glob("*/*.json"):
        entry=json.loads(path.read_text(encoding="utf-8-sig"))
        if entry.get("decision")=="approved":approved.add(entry["exerciseId"])
    result={"passed":True,"reviewedAt":datetime.now(timezone.utc).isoformat(),"exerciseId":EID,"source":"Actual registered registry/placards/public paths; only react/tailwind plugins attached, no staged overlay","physicalPoses":3,"sourcePoseOrder":ORDER,"newImageRequests":3,"nativeDimensions":SIZE,"reference":1,"cueSha256":cue_hash,"mobile":mobile,"controls":controls,"timing":{"normalMedianMs":normal_ms,"slowerMedianMs":slower_ms,"ratio":slower_ms/normal_ms},"publicCardByteExactToReviewed":True,"cardDimensions":card_size,"publicFramesByteExactToReviewed":6,"registeredMasterAndPreparedSourceByteExact":True,"previousArtworkPreserved":len(previous),"canonicalSha256":gate["CANONICAL"],"observedRepositoryCounts":{"approvedExerciseSets":len(approved),"formArtCards":len(list((REPO/"public/form-art").glob("*.webp"))),"publicArtworkFiles":len(public_art)},"baselineHead":BASE,"baselineExitCode":baseline["exitCode"],"fullWindowsBaselineNonGreen":baseline["exitCode"]!=0,"reviewedAssetHashes":{**assets,**proofs,"integrated-parent-visual-signoff.json":sha(R/"integrated-parent-visual-signoff.json")},"reviewedPublicAssetHashes":public_bindings,"minorFindings":staged["minorFindings"],"completionCredit":False,"remaining":"Normal full branch verification/fresh comparison, formatting/source seal, required current-head CI and actual merge"}
    save(R/"integrated-visual-validation.json",result)
    return result

def archive_evidence(result):
    require(A.is_dir(),"registered source archive exists")
    provenance=json.loads((A/"provenance.json").read_text(encoding="utf-8-sig"))
    require(provenance.get("sourceHashes")=={},"copy evidence before final source seal")
    names={name: R/name for name in result["reviewedAssetHashes"]}
    names["integrated-visual-validation.json"]=R/"integrated-visual-validation.json"
    names["validate-integrated.py"]=R/"validate-integrated.py"
    public_bytes={"repo/"+name:REPO/name for name in result["reviewedPublicAssetHashes"]}
    # Archive the exact pre-format accepted bytes; readable copies may be formatted.
    with zipfile.ZipFile(A/"integrated-review-inputs-exact.zip","w",zipfile.ZIP_DEFLATED) as z:
        for name,path in sorted({**names,**public_bytes}.items()):z.writestr(name,path.read_bytes())
    for name,path in names.items():
        target=A/(name+".txt" if name.endswith(".tsx") else name)
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,target)
    record=json.loads(RECORD.read_text(encoding="utf-8-sig"))
    timing=result["timing"]
    record["integrationValidation"]=(f"Actual registered1448x924 six paths and480x479 standard card passed390x844 light/dark with all6 and sequential6-to-1, exact setup/keys/cues, pause/select/next/previous/slower and console errors0. Registered frames/master/prepared source/card exactly match accepted staged bytes; all{result['previousArtworkPreserved']} prior artwork files and FA56 preserved. Measured normal{timing['normalMedianMs']}ms/slower{timing['slowerMedianMs']}ms. Exact raw review inputs and public byte bindings archived. Normal full branch verification/fresh failure comparison, formatting/source seal, required current-head CI and actual merge remain pending before completion credit.")
    save(RECORD,record)
    provenance["archiveStatus"]="Actual registered-path review evidence copied with exact raw byte bindings; ordinary text formatting, normal full branch verification/comparison, source seal, required current-head CI and actual merge remain pending."
    save(A/"provenance.json",provenance)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive",action="store_true",help="After successful gates, copy exact/readable evidence into the unsealed repo archive and update only release integrationValidation.")
    args=parser.parse_args()
    result=validate()
    if args.archive:archive_evidence(result)
    print(json.dumps({k:result[k] for k in ["exerciseId","passed","previousArtworkPreserved","observedRepositoryCounts","cardDimensions","timing","completionCredit"]}|{"archiveCopied":args.archive},indent=2))
