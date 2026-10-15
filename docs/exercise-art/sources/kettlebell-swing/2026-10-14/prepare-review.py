from pathlib import Path
import json,re,hashlib
r=Path(__file__).resolve().parent;work=r.parents[1];repo=work/'Maiin-burpees'
template=work/'rear-delt-machine-fly/approved-equivalent-source-review-20261014'
config=(template/'review-vite.config.mjs').read_text().replace('rear-delt-machine-fly','kettlebell-swing').replace('8771','8774').replace('width:856,height:1008','width:690,height:1008').replace('reference:1','reference:3').replace('["Rear Delts"]','["Glutes","Hamstrings"]').replace('["Rhomboids","Traps"]','["Core","Lower Back"]')
setup=['Stand with feet shoulder-width, bell on the floor a foot in front of you.','Hinge at the hips and grip the handle with both hands, back flat.']
config=config.replace('const rows=beats.map', 'const setupInstructions='+json.dumps(setup)+';\nconst rows=beats.map')
config=config.replace("JSON.stringify(rows)+')", "JSON.stringify(rows)+','+JSON.stringify(setupInstructions)+')")
(r/'review-vite.config.mjs').write_text(config)
mobile=(template/'mobile-review.tsx').read_text().replace('Rear Delt Machine Fly','Kettlebell Swing').replace('Staged equivalent catalogue entry: exact approved-source reuse','Staged continuous swing: three intact no-shorts poses')
(r/'mobile-review.tsx').write_text(mobile)
(r/'mobile-review.html').write_text((template/'mobile-review.html').read_text().replace('Rear Delt Machine Fly','Kettlebell Swing'))
beats=json.loads((r/'draft-beats.json').read_text())
native=(template/'native-review.html').read_text().replace('Rear Delt Machine Fly','Kettlebell Swing').replace('856','690').replace('Exact reuse of already-approved equivalent catalogue movement. No pixel changes.','Three retained originals; colour and inherited contours only. No human geometry or equipment changes.')
native=native.replace('const paths=[1,2,3,3,2,1]','const paths=[2,3,1,1,3,2]')
native=re.sub(r'cues=\[.*?\];let beat','cues='+json.dumps([b['cue'] for b in beats])+';let beat',native)
native=native.replace('function draw(){','window.nativeTrace=[];pic.onload=()=>window.nativeTrace.push({ms:Math.round(performance.now()),src:pic.getAttribute("src"),beat:beat+1,natural:[pic.naturalWidth,pic.naturalHeight],display:[pic.clientWidth,pic.clientHeight],complete:pic.complete,viewport:[innerWidth,innerHeight]});function draw(){')
(r/'native-review.html').write_text(native)
# Stage the exact existing standard card algorithm without invoking its
# production registry loop or writing anything in the repository.
cutout=(repo/'scripts/art/cut-out-form-art.ts').read_text()
core=cutout[cutout.index('const DARK_MAX'):cutout.index('async function main()')]
sharp_package=json.loads((repo/'node_modules/sharp/package.json').read_text())
sharp_entry=repo/'node_modules/sharp'/sharp_package.get('module',sharp_package['main'])
prefix='import sharp from '+json.dumps(sharp_entry.as_uri())+';\nimport {createHash} from "node:crypto";\nimport {writeFileSync,readFileSync} from "node:fs";\n'
tail='\nconst source='+json.dumps(str(r/'final-frames/3.webp'))+';\nconst {rgba,width,height,keyed}=await cutOut(source);\nconst box=contentBox(rgba,width,height);const scale=Math.min(1,LONG_SIDE/Math.max(box.width,box.height));\nconst outW=Math.round(box.width*scale),outH=Math.round(box.height*scale);\nconst webp=await sharp(rgba,{raw:{width,height,channels:4}}).extract(box).resize(outW,outH,{kernel:"lanczos3"}).webp({quality:82,alphaQuality:90,effort:6}).toBuffer();\nwriteFileSync('+json.dumps(str(r/'card-cutout.webp'))+',webp);\nwriteFileSync('+json.dumps(str(r/'staged-card-provenance.json'))+',JSON.stringify({algorithmSource:"scripts/art/cut-out-form-art.ts",algorithmCoreSha256:'+json.dumps(hashlib.sha256(core.encode()).hexdigest())+',reference:"form-frames/kettlebell-swing/3.webp",sourceSha256:sha256(await sharp(source).toBuffer()),width:outW,height:outH,keyed,sha256:sha256(webp)},null,2));\nconsole.log(JSON.stringify({width:outW,height:outH,keyed,sha256:sha256(webp)}));\n'
(r/'stage-card.mts').write_text((prefix+core+tail).replace('sha256(await sharp(source).toBuffer())','sha256(readFileSync(source))'))
print('Staged native/mobile harness and unchanged standard card algorithm; repository untouched.')
