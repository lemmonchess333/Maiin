from pathlib import Path
import hashlib
import json
import shutil

R = Path(__file__).resolve().parent
REPO = R.parents[1] / "Maiin-burpees"
EID = "rear-delt-machine-fly"
code = (R / "validate-staged.py").read_text(encoding="utf-8")
code = code.replace("staged-", "registered-").replace("Staged exact source reuse", "Registered exact source reuse")
exec(compile(code, str(R / "validate-registered-derived.py"), "exec"))
out = json.loads((R / "registered-visual-validation.json").read_text())
out["scope"] = "Actual registered target paths/card/components with current main styles; not yet committed or merged."
out["remaining"] = "Full branch verification/baseline comparison, source hashes/normal hooks, PR required CI and actual merge before completion credit."
out["standardCardByteExactToApprovedSource"] = (REPO / f"public/form-art/{EID}.webp").read_bytes() == (REPO / "public/form-art/reverse-pec-deck.webp").read_bytes()
assert out["standardCardByteExactToApprovedSource"]
source = json.loads((R / "source-equivalence.json").read_text())
for frame in source["frames"]:
    delivered = REPO / "public" / frame["targetPath"]
    assert hashlib.sha256(delivered.read_bytes()).hexdigest() == frame["sha256"]
prior = json.loads((R / "previous-artwork-hashes.json").read_text())
assert all(hashlib.sha256((REPO / p).read_bytes()).hexdigest() == expected for p, expected in prior.items())
out["priorArtworkPreserved"] = len(prior)
(R / "registered-visual-validation.json").write_text(json.dumps(out, indent=2) + "\n")
record_path = REPO / f"docs/exercise-art/releases/2026-10-14/{EID}.json"
record = json.loads(record_path.read_text())
for key in ["mobileLight", "mobileDark"]:
    record["checks"][key]["evidence"] += " Actual registered target public paths and standard350x480 card have also passed all6/6to1,wrap,pause/slower review in this theme under current-main styles."
record["integrationValidation"] = "Actual registered/native byte correspondence, mobile390x844 light/dark all6/6to1 and controls/card passed. All889 previous artwork unchanged. Full branch verification, normal required CI and actual merge remain before completion credit."
record_path.write_text(json.dumps(record, indent=2) + "\n")
archive = REPO / f"docs/exercise-art/sources/{EID}/2026-10-14"
for name in ["registered-visual-validation.json", "registered-controls.json", "registered-dark-trace.json", "registered-light-trace.json", "registered-slower-trace.json", "registered-dark.png", "registered-light.png", "registered-dark-full-page.png", "registered-light-full-page.png", "finish-registered.py"]:
    shutil.copy2(R / name, archive / name)
print(json.dumps(dict(registeredReviewPassed=True, priorArtworkPreserved=len(prior), controls=out["controls"], completionCredit=False)))
