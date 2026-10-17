"""Prepared post-run evidence copier/ledger writer; parent executes after review.

copy: terminal normal results + explicit parent decision -> raw ZIP/readable copy.
ledger: after ordinary formatting -> evidence hashes and honest project-checks.json.
Neither mode runs tests, changes production code/images, publishes or merges.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import difflib
import hashlib
import json
import re
import runpy
import shutil
import subprocess
import zipfile

R=Path(__file__).resolve().parent
REPO=R.parents[1]/"Maiin-burpees"
A=REPO/"docs/exercise-art/sources/ab-wheel/2026-10-14"
DEST=A/"project-check-evidence"
BASE="82d6d829ad20ad3c8924933f736ad615b83054f6"
BASE_LOG="9bed359f766e07164ac82a46a1d1719ff54b1b88bfa659152258e1ba0b01ba41"
STAGES=["lint","check:form-art","check:form-drafts","check:cycles","build","check:dist-size","test"]
EXPECTED_BASE_TESTS={"failed":87,"passed":13130,"skipped":409,"total":13626}
EXPECTED_BASE_FILES={"failed":55,"passed":1114,"skipped":10,"total":1179}
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
stamp=lambda:datetime.now(timezone.utc).isoformat()

def require(value,message):
    if not value:raise RuntimeError("Project-check evidence refused: "+message)

def read(path):
    require(path.is_file(),"missing "+str(path))
    return json.loads(path.read_text(encoding="utf-8-sig"))

def save(path,value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

def evidence_path(name):
    path=(R/name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(R.resolve()),"unsafe evidence path "+name)
    require(path.relative_to(R.resolve()).parts[0] in ["checks","baseline"],"project evidence must be in checks/baseline: "+name)
    require(path.is_file(),"absent actual evidence "+name)
    return path

def focused_pass(disposition,file,*,fixed=False):
    result_name=disposition.get("focusedResult")
    log_name=disposition.get("focusedLog")
    require(isinstance(result_name,str) and isinstance(log_name,str),"focused result/log bindings for "+file)
    result=read(evidence_path(result_name));log=evidence_path(log_name)
    require(result.get("status")=="terminal" and result.get("inputStatePreserved") is True,"terminal focused run with exact input preservation")
    require(result.get("logSha256",result.get("actualTestResult",{}).get("logSha256"))==sha(log),"actual focused log hash")
    invocation=result.get("actualInvocation",[])
    require(isinstance(invocation,list) and len(invocation)>4,"actual normal focused invocation")
    marker=next((i for i in range(len(invocation)-2) if invocation[i:i+3]==["run","test","--"]),None)
    require(marker is not None,"focused check uses normal npm run test -- whole files")
    files=invocation[marker+3:]
    require(files and all(re.fullmatch(r"[^\s]+\.test\.[cm]?[jt]sx?",x) for x in files) and file in files,"whole failing file included; no test-name filters/retries/timeout flags")
    text=re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]","",log.read_text(encoding="utf-8-sig",errors="replace"))
    pattern=r"^\s*(?:✓|√|✔|PASS)\s+(?:\|[^|]+\|\s+)?"+re.escape(file)+r"\s+\(\d+\s+tests?\b"
    explicit_file_pass=re.search(pattern,text,re.MULTILINE) is not None
    evidence_kind="explicit-whole-file-pass-line"
    if not explicit_file_pass:
        # Normal Vitest5 aggregate reporting can omit every individual PASS
        # line. Accept the complete exact five-file batch, not an invented per-
        # file reporter line or another rerun solely to change the reporter.
        expected={"src/lib/__tests__/bodyRig.test.ts","src/lib/__tests__/formArtOwnerRelease.test.ts","scripts/art/form-art-releases.test.ts","src/features/program/__tests__/trainingBlock.timezone.test.ts","scripts/release-debug-token.test.ts"}
        require(set(files)==expected and len(files)==5 and result.get("targets")==files,"aggregate proof covers exactly the normal five target files")
        require(result.get("exitCode")==0 and result.get("testNameFilters") is False and result.get("retryAdded") is False and result.get("timeoutChanges") is False,"normal complete successful focus without filters/retries/timeout changes")
        require(result.get("completeFiveWholeFileResult") is True and result.get("allFiveWholeFilesPassed") is True,"actual complete normal five-file result")
        parser=runpy.run_path(str(R/"checks/branch-verify-tools.py"),run_name="focused_ledger_readonly_log_parser")["parse_log"]
        parsed=parser(log)
        require(parsed==result.get("actualTestResult"),"aggregate focused metadata exactly reconstructs actual log")
        require(parsed["testFiles"]=={"failed":0,"passed":5,"skipped":0,"total":5} and parsed["tests"]=={"failed":0,"passed":100,"skipped":0,"total":100},"actual complete5-file/100-test successful summary")
        require(parsed["failures"]==[] and parsed["failureHeaderCount"]==0 and parsed["stagesInvoked"]==["test"],"aggregate focus has no failure headers or missing terminal stage")
        require(result.get("inputBytesUnchanged") is True and result.get("unexpectedFileByteChanges")==[] and result.get("head")==result.get("finalHead") and sorted(result.get("initialStatus",[]))==sorted(result.get("finalStatus",[])),"aggregate focus input bytes/status/HEAD preserved")
        require(result.get("snapshotBeforeSha256")==result.get("snapshotFinalSha256") and bool(result.get("snapshotBeforeSha256")),"aggregate focus snapshot unchanged")
        require("> node scripts/run-unit-tests.mjs run "+" ".join(files) in text,"actual focused log invokes those entire files")
        evidence_kind="exact-complete-normal-five-file-batch-aggregate"
    require(not re.search(r"^\s*FAIL\s.*"+re.escape(file)+r"(?:\s|$)",text,re.MULTILINE),"focused log still contains failures in "+file)
    require(result.get("exitCode") in [0,1],"focused run terminal exit retained")
    # Exit1 can be due to separately documented baseline files in a batch; this
    # gate claims only the named whole file pass, never an overall green run.
    meaning=("The original full-run new regression remains recorded. After the separately hash-bound exact authored-coordinate fix, the normal focused whole file passed. This is a reviewed fixed regression, not an unchanged non-reproduction or pre-existing failure."
             if fixed else "Full-run added failure remains real; normal focused whole-file check did not reproduce it. Parent reviewed this disposition; no code fix or pre-existing classification claimed.")
    return {"result":result_name,"log":log_name,"exitCode":result["exitCode"],"file":file,"wholeFilePassed":True,"evidenceKind":evidence_kind,"meaning":meaning}

def fixed_regression(disposition,file,hashes,prefix):
    # This narrow disposition is only for the actual diagnosed new Ab Wheel
    # closure assertion. It cannot waive any other failure as fixed/pre-existing.
    require(file=="src/lib/__tests__/bodyRig.test.ts" and "the loop closes from the start pose or a controlled return towards it" in disposition["identity"],"fixed disposition is only the diagnosed Ab Wheel authored-coordinate regression")
    addendum_name=disposition.get("correctionAddendum")
    require(isinstance(addendum_name,str) and addendum_name in hashes,"parent-reviewed correction addendum hash")
    addendum=read(evidence_path(addendum_name))
    require(addendum.get("status")=="reviewed-t-only-position-metadata-correction" and addendum.get("passed") is True and addendum.get("exerciseId")=="ab-wheel" and addendum.get("baselineHead")==BASE,"actual accepted narrow correction addendum")
    require(addendum.get("changedFiles")==["src/lib/releasedFormPlacards.ts"] and addendum.get("beforeT")==[0,.2,.4,.6,.8,1] and addendum.get("afterT")==[0,.5,1,1,.5,0],"exact t-only authored excursion change")
    bound=addendum.get("reviewedEvidenceHashes",{})
    require(isinstance(bound,dict) and bool(bound),"correction proof input hashes")
    for name,digest in bound.items():
        require(name in hashes and hashes[name]==digest and sha(evidence_path(name))==digest,"parent binds every actual correction proof "+name)
    before_name=addendum.get("originalCodeProof");after_name=addendum.get("currentCodeProof")
    patch=addendum.get("patch",{});patch_name=patch.get("path")
    require(all(isinstance(name,str) and name in bound for name in [before_name,after_name,patch_name]),"exact before/after code snapshots and t patch are bound")
    before=evidence_path(before_name).read_bytes();after=evidence_path(after_name).read_bytes()
    require(hashlib.sha256(before).hexdigest()==addendum.get("originalCodeSha256") and hashlib.sha256(after).hexdigest()==addendum.get("currentCodeSha256")==sha(REPO/"src/lib/releasedFormPlacards.ts"),"original/current code proofs match actual current corrected source")
    start=before.find(b'"ab-wheel": placard(')
    require(start>=0,"original Ab Wheel placard block")
    next_entry=re.search(rb'\n  (?:"[\w-]+"|[\w-]+): placard\(',before[start+1:])
    require(next_entry is not None,"bounded original Ab Wheel block")
    end=start+1+next_entry.start()
    block=before[start:end]
    pattern=rb'(?m)^([ \t]*\[)([0-9.]+)(,[ \t]*"(?:Brace|Roll|Reach|Hold|Return|Reset)",[^\r\n]*\r?$)'
    matches=list(re.finditer(pattern,block))
    require(len(matches)==6 and [float(m[2]) for m in matches]==addendum["beforeT"],"six original scalar tokens")
    tokens=iter([b"0",b"0.5",b"1",b"1",b"0.5",b"0"])
    expected_block=re.sub(pattern,lambda match:match[1]+next(tokens)+match[3],block)
    require(before[:start]+expected_block+before[end:]==after,"only those six scalar tokens may change in repository source")
    patch_path=evidence_path(patch_name)
    require(sha(patch_path)==patch.get("sha256"),"actual t-only patch hash")
    actual_patch=patch_path.read_text(encoding="utf-8-sig").splitlines()
    expected_patch=list(difflib.unified_diff(before.decode("utf-8-sig").splitlines(),after.decode("utf-8-sig").splitlines()))
    changed_lines=lambda rows,sign:[line[1:] for line in rows if line.startswith(sign) and not line.startswith(sign*3)]
    require(any("src/lib/releasedFormPlacards.ts" in line for line in actual_patch),"patch names the actual changed source")
    require(all(changed_lines(actual_patch,sign)==changed_lines(expected_patch,sign) for sign in ["-","+"]),"saved patch contains exactly the actual scalar-only line changes")
    # The first run is immutable historical evidence, not rewritten to green.
    for name in [f"checks/{prefix}-verify-result.json",f"checks/{prefix}-verify.log",f"checks/{prefix}-failure-comparison.json"]:
        require(name in hashes and sha(evidence_path(name))==hashes[name],"retain actual original full-run failure evidence")
    historical=addendum.get("historicalIntegratedZipSha256")
    require(isinstance(historical,str) and re.fullmatch(r"[0-9a-f]{64}",historical) is not None and sha(A/"integrated-review-inputs-exact.zip")==historical,"original integrated raw ZIP remains unchanged")
    evidence=focused_pass(disposition,file,fixed=True)
    require(evidence["result"] in hashes and evidence["log"] in hashes,"parent-reviewed normal focused fix evidence hashes")
    return {"identity":disposition["identity"],"parentRationale":disposition["rationale"],"correctionAddendum":addendum_name,"correctionAddendumSha256":hashes[addendum_name],"originalFullRunFailureRetained":True,"exactTOnlyChangeIndependentlyVerified":True,"beforeT":addendum["beforeT"],"afterT":addendum["afterT"],"patchSha256":patch["sha256"],"correctionEvidenceHashes":bound,**evidence}

def terminal_facts(prefix,decision_name):
    require(re.fullmatch(r"[a-z][a-z0-9-]*",prefix) is not None and prefix!="baseline","safe non-baseline prefix")
    parser=runpy.run_path(str(R/"checks/branch-verify-tools.py"),run_name="project_ledger_readonly_log_parser")["parse_log"]
    baseline=read(R/"baseline/baseline-verify-result.json")
    baseline_parsed=parser(R/"baseline/baseline-verify.log")
    require(baseline.get("status")=="terminal" and baseline.get("head")==BASE and baseline.get("inputStatePreserved") is True and baseline.get("oldResultDataImported") is False,"fresh clean current-main baseline")
    require(baseline_parsed["logSha256"]==BASE_LOG and baseline_parsed["tests"]==EXPECTED_BASE_TESTS and baseline_parsed["testFiles"]==EXPECTED_BASE_FILES,"exact freshly measured87/13130/409 and55/1114/10 baseline")
    require(baseline_parsed["stagesInvoked"]==STAGES and baseline.get("allNormalVerifyStagesInvoked") is True and baseline.get("fullResultSummariesPresentAndTotalsConsistent") is True,"all normal baseline stages and terminal summaries")
    require(baseline.get("snapshotBytesExactAfterRestoration") is True and baseline["snapshotBeforeSha256"]==baseline["snapshotFinalSha256"]==sha(R/"baseline/baseline-planSweep-before.snap"),"exact fresh baseline snapshot preservation")
    result_name=f"checks/{prefix}-verify-result.json";comparison_name=f"checks/{prefix}-failure-comparison.json";log_name=f"checks/{prefix}-verify.log"
    meta=read(evidence_path(result_name));comparison=read(evidence_path(comparison_name));parsed=parser(evidence_path(log_name))
    require(meta.get("status")=="terminal" and meta.get("command")=="npm run verify" and meta.get("exitCode") in [0,1],"actual normal full branch terminal result")
    require(meta.get("baselineHead")==BASE and meta.get("baselineLogSha256")==BASE_LOG,"branch compares exact fresh baseline")
    require(meta.get("inputBytesUnchanged") is True and meta.get("unexpectedFileByteChanges")==[] and meta.get("head")==meta.get("finalHead") and sorted(meta.get("initialStatus",[]))==sorted(meta.get("finalStatus",[])),"full branch input bytes/status/HEAD preserved")
    require(meta["savedSnapshotSha256"]==meta["snapshotFinalSha256"]==sha(R/f"checks/{prefix}-planSweep-before.snap")==sha(REPO/meta["savedSnapshot"]),"full branch snapshot exact current-byte restoration")
    require(meta["head"]==subprocess.check_output(["git","rev-parse","HEAD"],cwd=REPO,text=True).strip(),"tested branch HEAD still current before evidence packaging")
    for key in ["comparisonComplete","comparisonValid","allNormalVerifyStagesPresent","failureHeaderFileAccountingComplete","inputStatePreserved"]:
        require(comparison.get(key) is True,"complete actual comparison "+key)
    require(parsed["stagesInvoked"]==STAGES and comparison.get("branchResult")==parsed and comparison.get("exitCode")==meta["exitCode"],"comparison exactly matches actual full branch log and exit")
    for counts in [parsed["testFiles"],parsed["tests"]]:
        require(counts is not None and counts["total"]==sum(counts[k] for k in ["failed","passed","skipped"]),"terminal branch summary totals")
    old={x["identity"]:x for x in baseline_parsed["failures"]};new={x["identity"]:x for x in parsed["failures"]}
    added=sorted(new.keys()-old.keys());absent=sorted(old.keys()-new.keys());common=sorted(old.keys()&new.keys())
    details=[{"identity":i,"baseline":old[i]["firstDetailLines"],"branch":new[i]["firstDetailLines"]} for i in common if old[i]["firstDetailLines"]!=new[i]["firstDetailLines"]]
    require(comparison.get("newFailureIdentities")==added and comparison.get("resolvedFailureIdentities")==absent and comparison.get("changedDetailsForExistingFailures")==details,"exact derived identities/detail changes")
    decision=read(evidence_path(decision_name))
    require(decision.get("status")=="parent-reviewed-normal-full-comparison" and decision.get("baselineHead")==BASE and decision.get("baselineLogSha256")==BASE_LOG and decision.get("prefix")==prefix,"explicit factual parent comparison decision after terminal run")
    require(bool(decision.get("reviewer")) and bool(decision.get("reviewedAt")),"actual parent reviewer/time")
    hashes=decision.get("reviewedEvidenceHashes",{})
    minimum={result_name,comparison_name,log_name,"baseline/baseline-verify-result.json","baseline/baseline-verify.log","baseline/baseline-failure-identities.json"}
    require(isinstance(hashes,dict) and minimum.issubset(hashes),"parent pins actual baseline/branch result/comparison/log")
    for name,digest in hashes.items():require(sha(evidence_path(name))==digest,"parent-reviewed check evidence changed "+name)
    dispositions=decision.get("additionalFailureDispositions",[])
    require(isinstance(dispositions,list) and len(dispositions)==len(added) and {x.get("identity") for x in dispositions}==set(added),"every actual additional identity has a unique parent disposition")
    unresolved=[];focused=[];fixed=[]
    for item in dispositions:
        require(bool(str(item.get("rationale","")).strip()),"parent rationale for added failure")
        require(item.get("disposition") in ["unresolved","focused-whole-file-pass-reviewed","fixed-whole-file-pass-reviewed"],"no automatic added-failure waiver")
        if item["disposition"]=="unresolved":unresolved.append(item["identity"])
        elif item["disposition"]=="fixed-whole-file-pass-reviewed":
            fixed.append(fixed_regression(item,new[item["identity"]]["file"],hashes,prefix))
        else:
            require(not (new[item["identity"]]["file"]=="src/lib/__tests__/bodyRig.test.ts" and "the loop closes from the start pose or a controlled return towards it" in item["identity"]),"actual Ab Wheel coordinate correction must be a fixed regression, never non-reproduction")
            evidence=focused_pass(item,new[item["identity"]]["file"])
            require(evidence["result"] in hashes and evidence["log"] in hashes,"parent-reviewed focused evidence hashes")
            focused.append({"identity":item["identity"],"parentRationale":item["rationale"],**evidence})
    reviews=decision.get("changedDetailReviews",[])
    require(isinstance(reviews,list) and len(reviews)==len(details) and {x.get("identity") for x in reviews}=={x["identity"] for x in details},"every changed existing failure detail has an explicit parent review")
    for item in reviews:
        observed=next(x for x in details if x["identity"]==item["identity"])
        require(item.get("baselineDetailLines")==observed["baseline"] and item.get("branchDetailLines")==observed["branch"],"parent review preserves actual changed diagnostic")
        require(item.get("classification")=="reviewed-existing-diagnostic-change" and bool(str(item.get("rationale","")).strip()),"changed detail remains unresolved until parent actually reviews it; never counted as resolved automatically")
    overall_green=meta["exitCode"]==0 and parsed["tests"]["failed"]==0 and parsed["testFiles"]["failed"]==0
    require(comparison.get("overallGreen")==overall_green,"honest full branch green state")
    return {"baseline":baseline,"baselineParsed":baseline_parsed,"branchMeta":meta,"comparison":comparison,"branchParsed":parsed,"parentDecision":decision,"parentDecisionPath":decision_name,"additionalFullRunFailureIdentities":added,"baselineFailuresAbsentFromBranchFullRun":absent,"changedDetailsForExistingFailures":details,"parentChangedDetailReviews":reviews,"parentReviewedFocusedNonReproductions":focused,"parentReviewedFixedRegressions":fixed,"unresolvedAdditionalFailureIdentities":sorted(unresolved),"overallGreen":overall_green}

def sources_for(facts,prefix):
    names=set(facts["parentDecision"]["reviewedEvidenceHashes"])
    names.add(facts["parentDecisionPath"])
    names.update(p.relative_to(R).as_posix() for p in (R/"baseline").iterdir() if p.is_file())
    names.update(p.relative_to(R).as_posix() for p in (R/"checks").iterdir() if p.is_file() and (p.name.startswith(prefix+"-") or p.name in ["branch-verify-tools.py","candidate-runner-preparation.json"]))
    return {name:evidence_path(name) for name in sorted(names)}

def copy_evidence(facts,prefix):
    require(A.is_dir() and read(A/"provenance.json").get("sourceHashes")=={},"unsealed source archive before final hash computation")
    require(not DEST.exists() and not (A/"project-check-inputs-exact.zip").exists(),"preserve prior check evidence; copy output already exists")
    inputs=sources_for(facts,prefix)
    DEST.mkdir()
    with zipfile.ZipFile(A/"project-check-inputs-exact.zip","w",zipfile.ZIP_DEFLATED) as z:
        for name,path in inputs.items():
            z.writestr(name,path.read_bytes())
            target=DEST/name
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,target)
        z.writestr("write-project-checks.py",Path(__file__).read_bytes())
    shutil.copy2(Path(__file__),DEST/"write-project-checks.py")
    manifest={"phase":"copied-terminal-normal-project-check-evidence-before-format","copiedAt":stamp(),"prefix":prefix,"decision":facts["parentDecisionPath"],"rawZipSha256":sha(A/"project-check-inputs-exact.zip"),"rawSourceHashes":{name:sha(path) for name,path in inputs.items()},"writerSha256":sha(Path(__file__)),"next":"Ordinary format copied JSON/scripts, then run ledger mode. No sourceHashes/green/completion claim yet."}
    save(R/"checks/project-check-copy-manifest.json",manifest)
    print(json.dumps({"copiedEvidenceFiles":len(inputs),"archive":str(DEST),"rawZipSha256":manifest["rawZipSha256"],"overallVerifyExitCode":facts["branchMeta"]["exitCode"],"fullWindowsNonGreen":not facts["overallGreen"],"next":manifest["next"]},indent=2))

def write_ledger(facts,prefix):
    manifest=read(R/"checks/project-check-copy-manifest.json")
    require(manifest["prefix"]==prefix and manifest["decision"]==facts["parentDecisionPath"],"same copied parent-reviewed run")
    raw_zip=A/"project-check-inputs-exact.zip"
    require(sha(raw_zip)==manifest["rawZipSha256"],"preserved exact raw project-check ZIP")
    with zipfile.ZipFile(raw_zip) as z:
        require(z.testzip() is None and len(z.namelist())==len(set(z.namelist())),"intact raw ZIP without duplicate members")
        for name,digest in manifest["rawSourceHashes"].items():
            raw=z.read(name);target=DEST/name
            require(hashlib.sha256(raw).hexdigest()==digest==sha(evidence_path(name)),"raw evidence binding "+name)
            require(target.is_file(),"copied evidence missing "+name)
            if Path(name).suffix==".json":require(read(target)==json.loads(raw),"formatter changed saved JSON evidence semantics "+name)
            else:require(target.read_bytes()==raw,"non-JSON evidence bytes changed "+name)
        require(hashlib.sha256(z.read("write-project-checks.py")).hexdigest()==manifest["writerSha256"]==sha(DEST/"write-project-checks.py"),"archived writer exact")
    evidence_hashes={p.relative_to(A).as_posix():sha(p) for p in sorted(DEST.rglob("*")) if p.is_file()}
    evidence_hashes["project-check-inputs-exact.zip"]=sha(raw_zip)
    baseline=facts["baselineParsed"];branch=facts["branchParsed"];meta=facts["branchMeta"]
    ledger={"exerciseId":"ab-wheel","reviewedAt":stamp(),"baselineHead":BASE,"baselineLogSha256":BASE_LOG,"testedWorkingTreeHead":meta["head"],"normalCommand":"npm run verify","allNormalVerifyStagesPresent":True,"normalVerifyStages":STAGES,"comparisonComplete":True,"comparisonValid":True,"inputStatePreserved":True,"snapshotPreservedExactly":True,"snapshotSha256":meta["savedSnapshotSha256"],"overallVerifyExitCode":meta["exitCode"],"overallGreen":facts["overallGreen"],"fullWindowsNonGreen":meta["exitCode"]!=0,"baselineExitCode":facts["baseline"]["exitCode"],"baselineTestFiles":baseline["testFiles"],"baselineTests":baseline["tests"],"branchTestFiles":branch["testFiles"],"branchTests":branch["tests"],"additionalFullRunFailureIdentities":facts["additionalFullRunFailureIdentities"],"unresolvedAdditionalFailureIdentities":facts["unresolvedAdditionalFailureIdentities"],"baselineFailuresAbsentFromBranchFullRun":facts["baselineFailuresAbsentFromBranchFullRun"],"changedDetailsForExistingFailures":facts["changedDetailsForExistingFailures"],"parentChangedDetailReviews":facts["parentChangedDetailReviews"],"parentReviewedFocusedNonReproductions":facts["parentReviewedFocusedNonReproductions"],"parentDecision":{"reviewer":facts["parentDecision"]["reviewer"],"reviewedAt":facts["parentDecision"]["reviewedAt"],"evidencePath":"project-check-evidence/"+facts["parentDecisionPath"]},"evidenceHashes":evidence_hashes,"copyThenFormatThenHashOrdering":"Exact raw inputs preserved in ZIP; copied JSON semantic equality rechecked after ordinary formatting; evidenceHashes bind current copied bytes before source seal.","meaning":"A terminal exit1 full run stays non-green. Additional full-run cases remain disclosed even if a normal whole-file focused run did not reproduce them. Changed existing diagnostics are retained with explicit parent review, never erased or relabelled resolved. Baseline failures absent in this branch are observed set differences, not claimed code fixes. Hooks, current-head required CI and actual merge remain separate.","completionCredit":False}
    ledger["parentReviewedFixedRegressions"]=facts["parentReviewedFixedRegressions"]
    ledger["meaning"]="A terminal exit1 full run stays non-green and every original additional full-run failure remains disclosed. A reviewed exact authored-coordinate fix plus normal whole-file pass is recorded separately under parentReviewedFixedRegressions; it is not called a transient non-reproduction or pre-existing failure. Other parent-reviewed focused non-reproductions retain their original failures and do not claim code fixes. Changed existing diagnostics remain retained with explicit parent review. Baseline failures absent in this branch are observed set differences, not claimed fixes. Hooks, current-head required CI and actual merge remain separate."
    require(not (A/"project-checks.json").exists(),"do not overwrite an earlier project ledger")
    save(A/"project-checks.json",ledger)
    save(R/"checks/project-checks-finalization.json",{"ledger":str(A/"project-checks.json"),"ledgerSha256":sha(A/"project-checks.json"),"evidenceHashesVerified":len(evidence_hashes),"overallVerifyExitCode":meta["exitCode"],"fullWindowsNonGreen":meta["exitCode"]!=0,"unresolvedAdditionalFailureIdentities":facts["unresolvedAdditionalFailureIdentities"],"completionCredit":False})
    print(json.dumps({"ledger":str(A/"project-checks.json"),"baselineTests":baseline["tests"],"branchTests":branch["tests"],"overallVerifyExitCode":meta["exitCode"],"fullWindowsNonGreen":meta["exitCode"]!=0,"unresolvedAdditionalFailureIdentities":facts["unresolvedAdditionalFailureIdentities"],"completionCredit":False},indent=2))

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["copy","ledger"])
    parser.add_argument("--prefix",default="branch")
    parser.add_argument("--decision",default="checks/parent-check-decision.json")
    args=parser.parse_args()
    facts=terminal_facts(args.prefix,args.decision)
    if args.mode=="copy":copy_evidence(facts,args.prefix)
    else:write_ledger(facts,args.prefix)
