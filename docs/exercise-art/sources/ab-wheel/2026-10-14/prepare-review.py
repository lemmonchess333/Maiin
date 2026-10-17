from pathlib import Path
import json,re,hashlib
r=Path(__file__).resolve().parent;repo=r.parents[1]/'Maiin-burpees'
template=r.parents[1]/'kettlebell-swing/retained-no-shorts-cycle-20261014'
setup=json.loads((r/'plan.json').read_text(encoding='utf-8'))['authoredSetupInstructions']
config=(template/'review-vite.config.mjs').read_text(encoding='utf-8').replace('kettlebell-swing','ab-wheel').replace('8774','8780').replace('width:690,height:1008','width:1448,height:924').replace('reference:3','reference:1').replace('["Glutes","Hamstrings"]','["Core"]').replace('["Core","Lower Back"]','["Lats","Shoulders"]')
config=re.sub(r'const setupInstructions=.*?;', 'const setupInstructions='+json.dumps(setup)+';',config)
(r/'review-vite.config.mjs').write_text(config,encoding='utf-8')
mobile=(template/'mobile-review.tsx').read_text(encoding='utf-8').replace('Kettlebell Swing','Ab Wheel Rollout').replace('Staged continuous swing: three intact no-shorts poses','Staged kneeling rollout: three intact no-shorts poses')
(r/'mobile-review.tsx').write_text(mobile,encoding='utf-8')
(r/'mobile-review.html').write_text((template/'mobile-review.html').read_text(encoding='utf-8').replace('Kettlebell Swing','Ab Wheel Rollout'),encoding='utf-8')
beats=json.loads((r/'draft-beats.json').read_text(encoding='utf-8'))
native=(template/'native-review.html').read_text(encoding='utf-8').replace('Kettlebell Swing','Ab Wheel Rollout').replace('690','1448').replace('1008','924').replace('Three retained originals; colour and inherited contours only. No human geometry or equipment changes.','Three fresh intact whole poses; colour and inherited contours only. No human geometry or equipment changes.')
native=native.replace('const paths=[2,3,1,1,3,2]','const paths=[1,2,3,3,2,1]')
native=re.sub(r'cues=\[.*?\];let beat','cues='+json.dumps([b['cue'] for b in beats])+';let beat',native)
(r/'native-review.html').write_text(native,encoding='utf-8')
cutout=(repo/'scripts/art/cut-out-form-art.ts').read_text(encoding='utf-8');core=cutout[cutout.index('const DARK_MAX'):cutout.index('async function main()')]
sharpEntry=repo/'node_modules/sharp/dist/index.mjs'
prefix='import sharp from '+json.dumps(sharpEntry.as_uri())+';\nimport {createHash} from "node:crypto";\nimport {writeFileSync,readFileSync} from "node:fs";\n'
tail='\nconst source='+json.dumps(str(r/'final-frames/1.webp'))+';\nconst {rgba,width,height,keyed}=await cutOut(source);\n'
tail+='const box=contentBox(rgba,width,height);const scale=Math.min(1,LONG_SIDE/Math.max(box.width,box.height));\nconst outW=Math.round(box.width*scale),outH=Math.round(box.height*scale);\nconst webp=await sharp(rgba,{raw:{width,height,channels:4}}).extract(box).resize(outW,outH,{kernel:"lanczos3"}).webp({quality:82,alphaQuality:90,effort:6}).toBuffer();\n'
tail+='writeFileSync('+json.dumps(str(r/'card-cutout.webp'))+',webp);\nwriteFileSync('+json.dumps(str(r/'staged-card-provenance.json'))+',JSON.stringify({algorithmSource:"scripts/art/cut-out-form-art.ts",algorithmCoreSha256:'+json.dumps(hashlib.sha256(core.encode()).hexdigest())+',reference:"form-frames/ab-wheel/1.webp",sourceSha256:sha256(readFileSync(source)),width:outW,height:outH,keyed,sha256:sha256(webp)},null,2));\nconsole.log(JSON.stringify({width:outW,height:outH,keyed,sha256:sha256(webp)}));\n'
(r/'stage-card.mts').write_text(prefix+core+tail,encoding='utf-8')
print('Prepared separate native and actual component/mobile harness; no repo edit.')
