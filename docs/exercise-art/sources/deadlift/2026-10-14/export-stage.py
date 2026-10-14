from pathlib import Path
from PIL import Image
import json,hashlib,re,shutil
R=Path(__file__).resolve().parent;WORK=R.parents[1];repo=WORK/'Maiin-burpees';old=WORK/'seated-calf-raise/contact-window-production'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
order=[1,1,2,3,3,2];labels=['Set','Brace','Clear knees','Stand','Control','Lower'];cues=['Bar over midfoot; grip outside your shins.', 'Brace your trunk; keep both arms straight.', 'Drive up; keep the bar close.', 'Stand tall; avoid leaning back or shrugging.', 'Hold your grip; control the return.', 'Hinge back; guide the bar along legs.'];times=[1,1,.3,0,0,.3]
frames=R/'final-frames';frames.mkdir(exist_ok=True);out=[]
for n,pose in enumerate(order,1):
    im=Image.open(R/f'{pose}-native-review.png').convert('RGB');f=frames/f'{n}.webp';im.save(f,format='WEBP',lossless=True,quality=100,method=6)
    assert Image.open(f).convert('RGB').tobytes()==im.tobytes()
    out.append(dict(frame=n,sourcePose=pose,sha256=sha(f),decodedPixelsExact=True,size=im.size))
beats=[dict(t=t,label=label,cue=cue,image=f'/form-frames/deadlift/{i}.webp')for i,(t,label,cue)in enumerate(zip(times,labels,cues),1)]
(R/'draft-beats.json').write_text(json.dumps(beats,indent=2))
(R/'export-review.json').write_text(json.dumps(dict(status='Staged unregistered source set, not completion',sourcePoseOrder=order,distinctPhysicalPoses=3,qualitativeTNote='Knee state at qualitative .3 of remaining range, not exact3D interpolation. Floor/lockout pauses and reuse disclosed.',losslessDecodedPixelsExact=True,individualHumanFitting=False,frames=out),indent=2))
mobile=(old/'mobile-review.tsx').read_text().replace('Seated Calf Raise','Deadlift')
mobile=mobile.replace('<div className="mx-auto max-w-[390px] space-y-3">','<div style={{maxWidth:390,margin:"0 auto"}} className="space-y-3">')
(R/'mobile-review.tsx').write_text(mobile)
(R/'mobile-review.html').write_text((old/'mobile-review.html').read_text().replace('Seated Calf Raise','Deadlift'))
config=(old/'review-vite.config.mjs').read_text().replace('seated-calf-raise','deadlift').replace('staged-calf','staged-deadlift').replace("['Calves']","['Glutes','Hamstrings']").replace('["Calves"], []','["Glutes","Hamstrings"], ["Erectors","Traps"]').replace("['Calves'], []","['Glutes','Hamstrings'], ['Erectors','Traps']").replace('height:1310','height:940').replace('2026-10-13','2026-10-14').replace('8043','8769')
(R/'review-vite.config.mjs').write_text(config)
# Use the project's exact cutout implementation with a staging-only input registry
# and staging-only output root. No altered pixel algorithm or production mutation.
text=(repo/'scripts/art/cut-out-form-art.ts').read_text()
text=text.replace('import sharp from "sharp";','import sharp from "../../Maiin-burpees/node_modules/sharp/dist/index.mjs";')
for module in ['cutout-manifest','format-generated','prepared-cutout']:
    text=text.replace('"./'+module+'"','"../../Maiin-burpees/scripts/art/'+module+'.ts"')
text=text.replace('"../../src/lib/formArtCutouts.data"','"../../Maiin-burpees/src/lib/formArtCutouts.data.ts"')
block='import {\n  FORM_ARTWORK,\n  getReleasedFormArtwork,\n} from "../../src/lib/formArtwork";'
assert block in text
text=text.replace(block,'const FORM_ARTWORK = {deadlift: {}};\nconst getReleasedFormArtwork = (id: string) => id === "deadlift" ? {reference:"form-frames/deadlift/1.webp"} : undefined;')
text=text.replace('const ROOT = resolve(import.meta.dirname, "..", "..");','const ROOT = resolve(import.meta.dirname, "staged-card-root");')
staging=R/'staged-card-root';(staging/'public/form-frames/deadlift').mkdir(parents=True,exist_ok=True);(staging/'src/lib').mkdir(parents=True,exist_ok=True)
shutil.copy2(frames/'1.webp',staging/'public/form-frames/deadlift/1.webp')
(R/'stage-standard-cutout.mts').write_text(text)
(R/'cutout-staging-provenance.json').write_text(json.dumps(dict(originalProjectScript='scripts/art/cut-out-form-art.ts',originalScriptSha256=sha(repo/'scripts/art/cut-out-form-art.ts'),pixelAlgorithmChanged=False,adaptations='Only dependency paths, staging input registry and staging output root changed; full project cutout algorithm preserved',productionFilesTouched=False),indent=2))
print(json.dumps(dict(frames=6,poses=3,totalWebpBytes=sum(p.stat().st_size for p in frames.glob('*.webp')),stagedComponent='Actual ExerciseFormContent via temporary Vite-only manifest/cues, not an active release')))
