"""Prepare evidence-bound DRAFT only after terminal branch4. Never approve/copy/seal."""
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import argparse,json,hashlib,re,runpy

R=Path(__file__).resolve().parents[1];CHECKS=R/'checks';REPO=R.parent/'Maiin-burpees'
BASE='fbc3e8879b43086da0488ed8e387953bdb1af911'
STAGES=['lint','check:form-art','check:form-drafts','check:cycles','build','check:dist-size','test']
def require(ok,msg):
 if not ok:raise RuntimeError('Conservative draft refused: '+msg)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def evidence(name):
 require(isinstance(name,str) and '\\' not in name and ':' not in name,'Unsafe evidence name')
 p=PurePosixPath(name);require(not p.is_absolute() and '..' not in p.parts and p.parts and p.parts[0] in ['checks','baseline'] and p.as_posix()==name,'Evidence outside baseline/checks')
 f=(R/name).resolve();require(f.is_relative_to(R.resolve()) and f.is_file(),'Missing evidence '+name);return f
def evidence_name(value):
 return isinstance(value,str) and value.startswith(('checks/','baseline/')) and '\n' not in value and not any(c.isspace() for c in value) and ':' not in value and '\\' not in value
def new_json(path,value):
 require(not path.exists(),'Do not overwrite existing historical draft '+str(path));path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--prefix',default='branch4');args=parser.parse_args();prefix=args.prefix
 require(prefix=='branch4','This bounded preparation is for actual branch4 only')
 helpers=runpy.run_path(str(evidence('checks/branch-verify-tools.py')),run_name='read_only_final_decision_draft_parser')
 validated=helpers['load_baseline']();parse=helpers['parse_log'];baseline=read(evidence('baseline/baseline-verify-result.json'));old=parse(evidence('baseline/baseline-verify.log'))
 require(validated.get('head')==BASE and baseline.get('head')==BASE and baseline.get('status')=='terminal' and baseline.get('oldResultDataImported') is False,'Fresh actual terminal fbc3 baseline required')
 require(old['stagesInvoked']==STAGES and baseline.get('inputStatePreserved') is True,'Baseline complete/preserved proof required')
 names={k:f'checks/{prefix}-{v}' for k,v in [('result','verify-result.json'),('comparison','failure-comparison.json'),('log','verify.log'),('inputs','input-manifest.json'),('snapshot','planSweep-before.snap')]}
 result=read(evidence(names['result']));comparison=read(evidence(names['comparison']));new=parse(evidence(names['log']))
 require(result.get('status')=='terminal' and result.get('command')=='npm run verify' and result.get('exitCode') in [0,1],'Actual terminal normal full branch4 required; partial/early-stage run is insufficient')
 require(result.get('baselineHead')==BASE and result.get('baselineLogSha256')==old['logSha256'],'Exact baseline log binding')
 for key in ['comparisonComplete','comparisonValid','allNormalVerifyStagesPresent','failureHeaderFileAccountingComplete','inputStatePreserved']:require(comparison.get(key) is True,'Incomplete actual comparison '+key)
 require(new['stagesInvoked']==STAGES and comparison.get('branchResult')==new and comparison.get('exitCode')==result['exitCode'],'Actual reparsed full log must match comparison')
 require(result.get('head')==result.get('finalHead') and result.get('inputBytesUnchanged') is True and result.get('unexpectedFileByteChanges')==[] and sorted(result.get('initialStatus',[]))==sorted(result.get('finalStatus',[])),'Final full-run inputs/head/status not preserved')
 require(result['savedSnapshotSha256']==result['snapshotFinalSha256']==sha(evidence(names['snapshot'])),'Final snapshot exact-byte preservation missing')
 for parsed in [old,new]:
  for key in ['tests','testFiles']:
   counts=parsed[key];require(isinstance(counts,dict) and counts['total']==sum(counts[k] for k in ['failed','passed','skipped']),'Missing/inconsistent terminal totals')
 before={f['identity']:f for f in old['failures']};after={f['identity']:f for f in new['failures']}
 added=sorted(after.keys()-before.keys());absent=sorted(before.keys()-after.keys());changed=[{'identity':i,'baseline':before[i]['firstDetailLines'],'branch':after[i]['firstDetailLines']} for i in sorted(before.keys()&after.keys()) if before[i]['firstDetailLines']!=after[i]['firstDetailLines']]
 require(comparison['newFailureIdentities']==added and comparison['resolvedFailureIdentities']==absent and comparison['changedDetailsForExistingFailures']==changed,'Exact identity/detail comparison differs from actual logs')
 seeds={p.relative_to(R).as_posix() for p in (R/'baseline').rglob('*') if p.is_file()}
 for previous in ['branch','branch2','branch3','branch4']:
  for suffix in ['verify-result.json','verify.log','failure-comparison.json','input-manifest.json','planSweep-before.snap']:seeds.add(f'checks/{previous}-{suffix}')
  seeds.update(p.relative_to(R).as_posix() for p in CHECKS.rglob(previous+'-*') if p.is_file())
 seeds.update(p.relative_to(R).as_posix() for p in CHECKS.rglob('genuine-fix-preflight*') if p.is_file())
 # Preserve both actual installer whole-file attempts and the independent
 # standalone environment observations. Host success never replaces the
 # non-green full/default-focused outcomes or assigns a disposition here.
 focus_prefixes=['focus-branch4-installer','focus-branch4-installer-host']
 for focus_prefix in focus_prefixes:
  for suffix in ['-result.json','.log','-input-manifest.json','-planSweep-before.snap','-proof-hashes.json']:seeds.add(f'checks/{focus_prefix}{suffix}')
  seeds.update(p.relative_to(R).as_posix() for p in CHECKS.rglob(focus_prefix+'*') if p.is_file())
 seeds.update(['checks/branch4-bash-startup-environment-diagnosis.json','checks/run-focused-whole-files.py'])
 seeds.update(['checks/branch-verify-tools.py','checks/run-genuine-fix-preflight.py','checks/prepare-root-final-decision-draft.py','checks/form-guides-migration-review.json','checks/card-registry-size-review.json','checks/card-registry-size-independent-review.json','checks/t-bar-row-archive-completion-reproduction-proof.json','checks/caption-and-fixture-correction-review.json','checks/record-caption-and-fixture-correction.py','checks/pull-up-caption-correction-review.json','checks/record-pull-up-caption-correction.py','checks/genuine-fix-preflight-proof-hashes.json','checks/genuine-fix-preflight-final-proof-hashes.json','checks/caption-chain-current-binding-review.json','checks/immutable-original-format-ignore-review.json','checks/record-immutable-format-preservation.py'])
 # Actual optional postmerge peer reports are included only when they exist;
 # this does not fabricate a future review or any merge/publication status.
 seeds.update(p.relative_to(R).as_posix() for p in CHECKS.rglob('*.json') if 'postmerge' in p.name.lower())
 # Every nested evidence-path/hash entry is verified and queued. Plain path
 # pointers in review/results are also retained, including before/after proofs.
 pins={};queue=sorted(seeds);visited=set()
 def visit(node):
  if isinstance(node,dict):
   for key,value in node.items():
    if evidence_name(key):
     f=evidence(key)
     if isinstance(value,str) and re.fullmatch(r'[0-9a-f]{64}',value):require(sha(f)==value,'Recursive evidence pin changed '+key)
     queue.append(key)
    visit(value)
  elif isinstance(node,list):
   for value in node:visit(value)
  elif evidence_name(node):queue.append(node)
 while queue:
  name=queue.pop(0)
  if name in visited:continue
  visited.add(name);f=evidence(name);pins[name]=sha(f)
  if f.suffix=='.json':visit(read(f))
 first=read(evidence('checks/caption-and-fixture-correction-review.json'));second=read(evidence('checks/pull-up-caption-correction-review.json'));independent=read(evidence('checks/card-registry-size-independent-review.json'))
 require(second['firstCorrectionReview']=='checks/caption-and-fixture-correction-review.json' and second['firstCorrectionReviewSha256']==pins['checks/caption-and-fixture-correction-review.json'],'Ordered caption chain pin differs')
 require(independent['reviewedParentRecordSha256']==pins['checks/card-registry-size-review.json'],'Independent size review is not bound to exact parent size record')
 require(first.get('status')=='parent-reviewed-caption-and-fixture-correction' and second.get('status')=='parent-reviewed-pull-up-caption-correction','Actual parent caption/fixture reviews required')
 for pre in ['genuine-fix-preflight','genuine-fix-preflight-final']:
  meta=read(evidence(f'checks/{pre}-result.json'));require(meta.get('status')=='terminal','Both actual normal preflights must be terminal; neither is silently replaced')
  for suffix in ['.log','-input-manifest.json','-planSweep-before.snap','-proof-hashes.json']:require(f'checks/{pre}{suffix}' in pins,'Preflight evidence omitted '+pre+suffix)
 focus_outcomes=[]
 for focus_prefix in focus_prefixes:
  focus_result=read(evidence(f'checks/{focus_prefix}-result.json'));require(focus_result.get('status')=='terminal','Both actual installer focused attempts must be terminal before draft preparation')
  focus_outcomes.append({'prefix':focus_prefix,'status':focus_result['status'],'exitCode':focus_result.get('exitCode'),'actualTestResult':focus_result.get('actualTestResult'),'dispositionAssigned':False,'meaning':'Actual focused evidence only. Original full/default-focused outcomes retained; no fix, pre-existing classification, baseline equivalence or waiver inferred.'})
 # Admit exactly the reviewed post-run .prettierignore preservation action.
 # The shared validator binds tested before bytes, exact LF/comment/path after
 # bytes, current original CJS, and its unchanged original QA ZIP member.
 tested=read(evidence(names['inputs']));current=helpers['working_manifest']()
 current_changes=sorted(name for name in set(tested)|set(current) if tested.get(name)!=current.get(name))
 require(current_changes==['.prettierignore'],'Current input map may differ only by the exact reviewed post-run ignore change: '+str(current_changes))
 format_name='checks/immutable-original-format-ignore-review.json';format_helper='checks/record-immutable-format-preservation.py';format_review=read(evidence(format_name))
 validator=runpy.run_path(str(evidence(format_helper)),run_name='readonly_decision_format_preservation')['validate_review']
 original='docs/exercise-art/sources/t-bar-row/2026-10-15/draft/originals/prepare-master.cjs';raw=(REPO/'docs/exercise-art/sources/t-bar-row/2026-10-15/review-inputs-exact.zip').read_bytes()
 post_config=validator(format_review,lambda name:evidence(name).read_bytes(),tested,(REPO/'.prettierignore').read_bytes(),(REPO/original).read_bytes(),raw)
 post_config={**post_config,'review':format_name}
 current_proof=CHECKS/'branch4-current-input-manifest-for-decision.json'
 require(not current_proof.exists(),'Do not overwrite historical current-state evidence')
 # No disposition is inherited from old triage, count changes, preflight passes
 # or a matching filename. Root must supply/review each final disposition.
 draft={'status':'DRAFT-awaiting-parent-review','baselineHead':BASE,'baselineLogSha256':old['logSha256'],'prefix':prefix,'reviewer':None,'reviewedAt':None,'reviewedEvidenceHashes':dict(sorted(pins.items())),'additionalFailureDispositions':[{'identity':i,'disposition':'unresolved','rationale':'UNREVIEWED actual added final full-run case. Root must inspect exact diagnostic; no fix, baseline classification or waiver is inferred.'} for i in added],'changedDetailReviews':[{'identity':r['identity'],'baselineDetailLines':r['baseline'],'branchDetailLines':r['branch'],'classification':'unreviewed','rationale':'UNREVIEWED exact changed diagnostic; root must inspect before assigning reviewed-existing-diagnostic-change.'} for r in changed],'observedFullRun':{'exitCode':result['exitCode'],'overallGreen':result['exitCode']==0 and new['tests']['failed']==0 and new['testFiles']['failed']==0,'baselineTestFiles':old['testFiles'],'baselineTests':old['tests'],'branchTestFiles':new['testFiles'],'branchTests':new['tests'],'addedFailureIdentities':added,'baselineFailureIdentitiesAbsentFromFinal':absent,'changedDetailsForExistingFailures':changed},'safety':'DRAFT ONLY. This status/reviewer/date/changed-detail classification is deliberately rejected by write-project-checks.py. Root must review and author the final decision. No tests, approvals, archive copy, repo writes, source seal, CI or merge occurred here.','automaticFailureDispositions':False}
 draft['postVerifyConfigurationChanges']=[post_config];draft['currentInputChangesSinceFullRun']=current_changes;draft['inputStatePreservedMeaning']='Full-run source/HEAD/status/snapshot preservation remains an at-run historical fact. Current inputs differ only by the separately validated non-runtime .prettierignore LF/comment/one-original-path action.';draft['observedInstallerFocusedEvidence']=focus_outcomes
 draftpath=CHECKS/'parent-check-decision-branch4-DRAFT.json';commandpath=CHECKS/'branch4-parent-copy-ledger-commands.json'
 require(not commandpath.exists(),'Do not overwrite historical command plan')
 node='C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';python='C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';ids=['pull-ups','bike','t-bar-row'];decision='checks/parent-check-decision.json';writer=str(R/'write-project-checks.py')
 commands={'status':'prepared-for-parent-only-not-executed','prerequisites':['Root reviews actual terminal full comparison and every added/changed identity.','Root explicitly authors final checks/parent-check-decision.json; this helper never writes that approval.','All exact recursive evidence pins and ordered correction chain remain unchanged.','Copy then ordinary formatting then ledger; seal requires no unresolved added cases and actual required gates.'],'draftPath':str(draftpath),'draftSha256':None,'writerSha256AtPreparation':sha(Path(writer)),'commands':[{'step':'copy','cwd':str(R),'argv':[python,writer,'copy','--ids',*ids,'--prefix',prefix,'--decision',decision]},{'step':'normal-format-readable-copies-only','cwd':str(REPO),'argv':[node,str(REPO/'node_modules/prettier/bin/prettier.cjs'),'--write',*[f'docs/exercise-art/sources/{eid}/2026-10-15/project-check-evidence/**/*.{{json,mjs,mts,html,md}}' for eid in ids]],'preserve':'Raw ZIPs/logs/snapshots/exact source-byte copies are never formatter targets.'},{'step':'ledger','cwd':str(R),'argv':[python,writer,'ledger','--ids',*ids,'--prefix',prefix,'--decision',decision]},{'step':'source-seal-after-parent-checks','cwd':str(R),'argv':[python,str(R/'seal-reviewed-sources.py'),'--ids',*ids,'--branch-inputs',f'project-check-evidence/checks/{prefix}-input-manifest.json']}]}
 require(not draftpath.exists(),'Do not overwrite historical parent-review draft')
 new_json(current_proof,current);draft['reviewedEvidenceHashes'][current_proof.relative_to(R).as_posix()]=sha(current_proof)
 new_json(draftpath,draft);commands['draftSha256']=sha(draftpath);new_json(commandpath,commands)
 print(json.dumps({'status':'DRAFT-only','draft':str(draftpath),'recursivePinnedFiles':len(draft['reviewedEvidenceHashes']),'addedCasesAllUnresolved':added,'changedDiagnosticsAllUnreviewed':len(changed),'parentCommands':str(commandpath),'repoMutations':0,'finalApprovalWritten':False},indent=2))

if __name__=='__main__':main()
