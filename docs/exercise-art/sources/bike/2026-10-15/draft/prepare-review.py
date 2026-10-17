"""Minimal staged real-component/native review and standard card; outside repo."""
from pathlib import Path
import json,re,hashlib
R=Path(__file__).resolve().parent;REPO=R.parents[1]/'Maiin-burpees'
T=R.parents[1]/'ab-wheel/intact-whole-athlete-production-20261014'
setup=json.loads((R/'plan.json').read_text())['authoredSetupInstructions']
config=(T/'review-vite.config.mjs').read_text().replace('ab-wheel','bike').replace('8780','8782').replace('width:1448,height:924','width:929,height:1432').replace('["Core"]','["Quads"]').replace('["Lats","Shoulders"]','["Hamstrings"]')
config=re.sub(r'const setupInstructions=.*?;', 'const setupInstructions='+json.dumps(setup)+';',config)
config=config.replace('staged-bike-connected-window-v1','staged-bike-two-opposed-positions-v1')
(R/'review-vite.config.mjs').write_text(config,encoding='utf-8')
mobile=(T/'mobile-review.tsx').read_text().replace('Ab Wheel Rollout','Stationary Bike').replace('Staged kneeling rollout: three intact no-shorts poses','Two opposed pedal positions; intermediate crank travel is not shown.')
(R/'mobile-review.tsx').write_text(mobile,encoding='utf-8')
(R/'mobile-review.html').write_text((T/'mobile-review.html').read_text().replace('Ab Wheel Rollout','Stationary Bike'),encoding='utf-8')
beats=json.loads((R/'draft-beats.json').read_text())
native=(T/'native-review.html').read_text().replace('Ab Wheel Rollout','Stationary Bike').replace('1448','929').replace('924','1432').replace('three original physical poses / six paths','two opposed physical positions / six paths').replace('Three fresh intact whole poses; colour and inherited contours only. No human geometry or equipment changes.','Two retained intact whole scenes; source-colour-only finishing. Intermediate crank travel is not shown; no forward-trajectory or smooth-revolution claim.')
native=native.replace('const paths=[1,2,3,3,2,1]','const paths=[1,1,2,2,1,1]')
native=re.sub(r'cues=\[.*?\];let beat','cues='+json.dumps([b['cue'] for b in beats])+';let beat',native)
(R/'native-review.html').write_text(native,encoding='utf-8')
source=(REPO/'scripts/art/cut-out-form-art.ts').read_text(encoding='utf-8');core=source[source.index('const DARK_MAX'):source.index('async function main()')]
prefix='import sharp from '+json.dumps((REPO/'node_modules/sharp/dist/index.mjs').as_uri())+';\nimport {createHash} from "node:crypto";\nimport {writeFileSync,readFileSync} from "node:fs";\n'
tail='\nconst source='+json.dumps(str(R/'final-frames/1.webp'))+';\nconst keyed=await cutOut(source);\n'
tail+='const prepared='+json.dumps(str(R/'prepared-card-source.png'))+';writeFileSync(prepared,await sharp(keyed.rgba,{raw:{width:keyed.width,height:keyed.height,channels:4}}).png().toBuffer());\n'
tail+='const {rgba,width,height,keyed:preparedInputKeyed}=await cutOut(prepared);if(preparedInputKeyed||!rgba.equals(keyed.rgba))throw new Error("Prepared standard alpha source changed");\n'
tail+='const box=contentBox(rgba,width,height);const scale=Math.min(1,LONG_SIDE/Math.max(box.width,box.height));const outW=Math.round(box.width*scale),outH=Math.round(box.height*scale);\n'
tail+='const webp=await sharp(rgba,{raw:{width,height,channels:4}}).extract(box).resize(outW,outH,{kernel:"lanczos3"}).webp({quality:82,alphaQuality:90,effort:6}).toBuffer();writeFileSync('+json.dumps(str(R/'card-cutout.webp'))+',webp);\n'
tail+='writeFileSync('+json.dumps(str(R/'staged-card-provenance.json'))+',JSON.stringify({algorithmSource:"scripts/art/cut-out-form-art.ts",algorithmCoreSha256:'+json.dumps(hashlib.sha256(core.encode()).hexdigest())+',reference:"form-frames/bike/1.webp",sourceSha256:sha256(readFileSync(source)),preparedSource:"prepared-card-source.png",preparedSourceSha256:sha256(readFileSync(prepared)),referenceKeyed:keyed.keyed,preparedInputKeyed,width:outW,height:outH,contentBox:box,scale,sha256:sha256(webp),customAlphaEdits:false},null,2));\n'
tail+='console.log(JSON.stringify({width:outW,height:outH,sha256:sha256(webp),preparedSourceSha256:sha256(readFileSync(prepared)),customAlphaEdits:false}));\n'
(R/'stage-card.mts').write_text(prefix+core+tail,encoding='utf-8')
print('Prepared native and actual ExerciseFormContent/ExerciseFormFrames harness plus unchanged standard card algorithm; no repository edits or server start.')
