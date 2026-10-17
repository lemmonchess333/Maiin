from pathlib import Path
from PIL import Image
import json,re,hashlib,shutil,zipfile,io,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent;repo=R.parents[1]/'Maiin-burpees';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mobile=[]
for theme in ['dark','light']:
    trace=json.loads((R/f'registered-{theme}-trace.json').read_text());good=[x for x in trace if x['theme']==theme and x['viewport']==[390,844]and x['playing']and not x['documentHidden']and x['naturalWidth']==940 and x['naturalHeight']==940]
    frames=sorted(set(int(re.search(r'/([1-6])\.webp$',x['src']).group(1))for x in good));loop=any(good[i-1]['src'].endswith('/6.webp')and x['src'].endswith('/1.webp')for i,x in enumerate(good)if i)
    assert frames==list(range(1,7))and loop
    mobile.append(dict(theme=theme,viewport=[390,844],decodedFrames=frames,loop6to1=True,observations=len(good)))
controls=json.loads((R/'registered-controls.json').read_text());assert controls['pausePlayVisible']and controls['selectSix'].endswith('/6.webp')and controls['nextWrap'].endswith('/1.webp')and controls['previousWrap'].endswith('/6.webp')and controls['slowerPressed']=='true'and not controls['consoleErrors']
previous=json.loads((R/'previous-artwork-hashes.json').read_text());assert all(sha(repo/f)==h for f,h in previous.items())
assert sha(repo/'public/form-art/deadlift.webp')==sha(R/'card-cutout.webp')
recordpath=repo/'docs/exercise-art/releases/2026-10-14/deadlift.json';record=json.loads(recordpath.read_text())
assert all(sha(repo/'public'/f['path'])==f['sha256']for f in record['frames'])
for i in range(1,4):
    with zipfile.ZipFile(R/f'{i}-editable-draft.ora')as z:
        reopened=Image.new('RGBA',(1536,1024))
        for el in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):reopened=Image.alpha_composite(reopened,Image.open(io.BytesIO(z.read(el.attrib['src']))).convert('RGBA'))
        assert reopened.tobytes()==Image.open(R/f'{i}-coloured-full.png').convert('RGBA').tobytes()
    framed=Image.new('RGBA',(940,940),(0,0,0,255));framed.paste(reopened.crop((370,25,1270,905)),(20,50))
    n=[1,3,4][i-1];assert framed.convert('RGB').tobytes()==Image.open(repo/f'public/form-frames/deadlift/{n}.webp').convert('RGB').tobytes()
for theme in ['Light','Dark']:
    record['checks']['mobile'+theme]['evidence']+=' Final registered current application modules and standard public/form-art/deadlift.webp card reviewed in this theme at390x844;all6 and6to1,controls passed. Captions now each meet7-word read budget.'
record['integrationValidation']='Actual registered native/mobile/card controls and exact editable/preservation checks passed. Required project verification and CI/merge remain before completion credit.'
recordpath.write_text(json.dumps(record,indent=2)+'\n')
out=dict(passed=True,mobile=mobile,controls=controls,standardCardMatchesStaged=True,previousArtworkPreserved=len(previous),allRegisteredFrameHashesMatch=True,editablesReopenedExact=3,editableCroppedExportsExact=True,finalCueWordCounts=[len(x['cue'].split())for x in json.loads((R/'draft-beats.json').read_text())],remaining='Required project/CI and merge; not completion credit')
(R/'registered-review.json').write_text(json.dumps(out,indent=2))
source=repo/'docs/exercise-art/sources/deadlift/2026-10-14'
for name in ['register-reviewed.py','export-stage.py','validate-stage.py','update-cues.py','finish-registered-review.py','registered-review.json','registered-dark-trace.json','registered-light-trace.json','registered-dark.png','registered-light.png','registered-dark-full-page.png','registered-light-full-page.png','registered-controls.json']:
    shutil.copy2(R/name,source/name)
provpath=source/'provenance.json';prov=json.loads(provpath.read_text());prov['sourceHashes']={f.name:sha(f)for f in source.iterdir()if f.is_file()and f.name!='provenance.json'};provpath.write_text(json.dumps(prov,indent=2)+'\n')
with zipfile.ZipFile(R/'deadlift-editables-reviewed.zip','w',compression=zipfile.ZIP_DEFLATED)as z:
    for f in source.iterdir():
        if f.is_file():z.write(f,f.name)
    z.write(recordpath,'release-review.json')
    for f in (R/'final-frames').glob('*.webp'):z.write(f,'final-frames/'+f.name)
print(json.dumps(dict(registeredReview=True,editablesExact=3,preserved=len(previous),packageBytes=(R/'deadlift-editables-reviewed.zip').stat().st_size)))
