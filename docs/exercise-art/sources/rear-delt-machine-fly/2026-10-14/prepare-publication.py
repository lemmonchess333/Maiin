from pathlib import Path
import hashlib
import json
import re
import shutil

R = Path(__file__).resolve().parent
REPO = R.parents[1] / "Maiin-burpees"
EID = "rear-delt-machine-fly"
archive = REPO / f"docs/exercise-art/sources/{EID}/2026-10-14"
read = lambda p: json.loads(p.read_text(encoding="utf-8-sig"))
baseline = read(R / "checks/baseline-summary.json")
comparison = read(R / "checks/branch-failure-comparison.json")
log = (R / "checks/branch-verify.log").read_text(encoding="utf-8-sig")
clean = re.sub(r"\x1b\[[0-9;]*m", "", log)
counts = re.search(r"Tests\s+(\d+) failed \|\s*(\d+) passed \|\s*(\d+) skipped", clean)
assert counts and read(R / "checks/branch-verify-result.json")["status"] == "terminal"
assert len(comparison["branchOnly"]) == 1 and "deadPathReferences" in comparison["branchOnly"][0]
assert "timed out in 5000ms" in clean
focused = (R / "checks/focused-final.log").read_text(encoding="utf-8-sig")
assert re.search(r"Tests\s+354 passed", focused) and re.search(r"Test Files\s+6 passed", focused)
assert read(R / "registered-visual-validation.json")["passed"]
prior = read(R / "previous-artwork-hashes.json")
assert all(hashlib.sha256((REPO / p).read_bytes()).hexdigest() == expected for p, expected in prior.items())
snapshot = REPO / "src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap"
assert snapshot.read_bytes() == (R / "checks/branch-planSweep-before.snap").read_bytes()
checks = dict(baselineHead=baseline["head"], baselineFullWindows=baseline["fullWindows"],
              branchFullWindows=dict(failed=int(counts[1]), passed=int(counts[2]), skipped=int(counts[3])),
              lintPassed=True, artworkAuditPassed=True, draftAuditPassed=True, cyclesPassed=True,
              buildPassed=True, distSizePassed=True, focused=dict(files=6, passed=354, failed=0),
              priorArtworkPreserved=len(prior), fullWindowsGreen=False,
              comparison="72 persistent failed tests match the fresh clean26326 baseline. Two baseline generator-byte failures resolved through normal generators. One additional deadPathReferences full-run timeout passed the normal six-file354-test focused run; do not call that timeout pre-existing.",
              remaining="Required Linux CI and actual merge before completion credit.")
(R / "project-checks.json").write_text(json.dumps(checks, indent=2) + "\n", encoding="utf-8")
shutil.copy2(R / "project-checks.json", archive / "project-checks.json")
shutil.copy2(R / "prepare-publication.py", archive / "prepare-publication.py")
for name in ["branch-verify-result.json", "branch-failure-comparison.json"]:
    shutil.copy2(R / "checks" / name, archive / name)
record_path = REPO / f"docs/exercise-art/releases/2026-10-14/{EID}.json"
record = read(record_path)
record["integrationValidation"] = "Registered target native byte correspondence/mobile390x844 light-dark/card/controls passed. All889 previous artwork preserved. Lint/art/drafts/cycles/build/size and354 focused tests passed. Full Windows73failed/13125passed/409skip versus fresh clean26326 74failed/13122passed/409skip;72 persistent failures match, one extra full-run timeout passed focused. Local full suite remains non-green. Required Linux CI and actual merge remain before completion credit."
record_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
print(json.dumps(checks))
