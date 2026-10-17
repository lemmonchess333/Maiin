from pathlib import Path
import json,hashlib,shutil
R=Path(__file__).resolve().parent;repo=R.parents[1]/'Maiin-burpees'
cues=['Bar over midfoot; grip outside your shins.','Brace your trunk; keep both arms straight.','Drive up; keep the bar close.','Stand tall; avoid leaning back or shrugging.','Hold your grip; control the return.','Hinge back; guide the bar along legs.']
assert all(len(x.split())<=7 for x in cues)
beats=json.loads((R/'draft-beats.json').read_text())
for b,c in zip(beats,cues):b['cue']=c
(R/'draft-beats.json').write_text(json.dumps(beats,indent=2))
source=repo/'docs/exercise-art/sources/deadlift/2026-10-14';shutil.copy2(R/'draft-beats.json',source/'draft-beats.json')
release=repo/'docs/exercise-art/releases/2026-10-14/deadlift.json';record=json.loads(release.read_text());record['cueSha256']=hashlib.sha256(json.dumps([dict(label=b['label'],cue=b['cue'])for b in beats],separators=(',',':'),ensure_ascii=False).encode()).hexdigest();record['checks']['cueAgreement']['evidence']+=' Final captions each fit the app seven-word hold budget.';release.write_text(json.dumps(record,indent=2)+'\n')
# Keep the archival replay's captions aligned without re-exporting any image.
script=R/'export-stage.py';t=script.read_text();start=t.index("cues=[");end=t.index(';times=',start);t=t[:start]+'cues='+repr(cues)+t[end:];script.write_text(t);shutil.copy2(script,source/script.name)
print(json.dumps(dict(cueWordCounts=[len(x.split())for x in cues],cueSha256=record['cueSha256'],imageFilesChanged=False)))
