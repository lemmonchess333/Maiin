from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import json, hashlib

r = Path(__file__).resolve().parent
native = Image.open(r / '1-framed.png').convert('RGBA')
keyed = Image.open(r / 'normal-keyed-card-source.png').convert('RGBA')
a = np.asarray(native)
b = np.asarray(keyed)
assert np.array_equal(a[:, :, :3], b[:, :, :3])

# Keep original keyed anatomy above the floor band. The lower bright body
# retains its original outlines through a small native close/grow, while
# source-coordinate shapes protect only existing dark wheel/axle/pad pixels.
bright = a[:, :, :3].max(axis=2) > 110
seed = Image.fromarray(np.uint8(bright) * 255)
body = seed.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
body = np.asarray(body.filter(ImageFilter.MaxFilter(5))) > 0
gear = Image.new('L', native.size)
draw = ImageDraw.Draw(gear)
wheel = [(708,679),(729,680),(751,688),(772,702),(788,724),
         (799,753),(804,784),(801,811),(791,839),(777,861),
         (757,873),(735,876),(711,869),(691,854),(675,831),
         (664,804),(660,777),(662,750),(671,722),(684,699)]
axle = [(583,762),(879,750),(880,785),(583,797)]
pad = [(187,802),(226,794),(382,794),(521,794),(543,803),
       (543,831),(521,837),(358,859),(187,835)]
for polygon in [wheel, axle, pad]:
    draw.polygon(polygon, fill=255)
protected = np.asarray(gear) > 0
alpha = b[:, :, 3].copy()
floor_domain = np.indices(alpha.shape)[0] >= 600
alpha[floor_domain & ~body & ~protected] = 0
# All bright original body/trainers/colour fields stay fully opaque.
alpha[bright] = 255
out = a.copy()
out[:, :, 3] = alpha
Image.fromarray(out).save(r / 'prepared-card-source.png')
reopened = np.asarray(Image.open(r / 'prepared-card-source.png').convert('RGBA'))
assert np.array_equal(reopened[:, :, :3], a[:, :, :3])
assert np.all(reopened[:, :, 3][bright] == 255)
assert np.array_equal(reopened[:, :, 3][protected], b[:, :, 3][protected])
assert np.all(reopened[884:, :, 3] == 0)

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
proof = {
    'reference': 'form-frames/ab-wheel/1.webp',
    'frameSha256': sha(r / 'final-frames/1.webp'),
    'framedPngSha256': sha(r / '1-framed.png'),
    'preparedSourceSha256': sha(r / 'prepared-card-source.png'),
    'normalKeyedSourceSha256': sha(r / 'normal-keyed-card-source.png'),
    'dimensions': list(native.size),
    'originalRgbExact': True,
    'brightNativePixels': int(bright.sum()),
    'allBrightNativePixelsOpaque': True,
    'darkGearPadKeyedAlphaPreserved': True,
    'bottomFloorBandTransparent': True,
    'changedAlphaPixelsVsNormalKey': int(np.sum(alpha != b[:, :, 3])),
    'bodyPoseOrEquipmentRgbEdited': False,
    'fromNativeFramedY': 600,
    'brightSeed': 110,
    'closeRadius': 1,
    'growRadius': 2,
    'protectedExistingEquipmentPolygons': {'wheel': wheel, 'axle': axle, 'pad': pad},
    'maskMeaning': 'Retain only original keyed alpha inside reviewed gear/pad shapes. No equipment RGB is drawn or transformed.',
}
(r / 'prepared-card-alpha-proof.json').write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')

# Reuse the standard cutout core verbatim. Prepared own-alpha source skips
# further keying, then standard content trim,4%padding and480px scaling run.
script = (r / 'stage-card.mts').read_text(encoding='utf-8-sig')
core = script[:script.index('const source=')]
end = '''
const source=PREPARED;
const {rgba,width,height,keyed}=await cutOut(source);
const box=contentBox(rgba,width,height);
const scale=Math.min(1,LONG_SIDE/Math.max(box.width,box.height));
const outW=Math.round(box.width*scale),outH=Math.round(box.height*scale);
const webp=await sharp(rgba,{raw:{width,height,channels:4}}).extract(box).resize(outW,outH,{kernel:"lanczos3"}).webp({quality:82,alphaQuality:90,effort:6}).toBuffer();
writeFileSync(CARD,webp);
writeFileSync(PROVENANCE,JSON.stringify({algorithmSource:"scripts/art/cut-out-form-art.ts",algorithmCoreSha256:"f95042479cc61ffb5b292b7da463d4479963f1f76d7b3b98e3175f4d2b12487c",reference:"form-frames/ab-wheel/1.webp",sourceSha256:sha256(readFileSync(FRAME)),preparedCardSource:"prepared-card-source.png",preparedSourceSha256:sha256(readFileSync(source)),alphaProof:"prepared-card-alpha-proof.json",alphaProofSha256:sha256(readFileSync(PROOF)),prepareScript:"prepare-card-floor-matte.py",prepareScriptSha256:sha256(readFileSync(PREPARE_SCRIPT)),backgroundOnlyCorrection:{originalRGBUnchanged:true,humanPoseEdited:false,fromNativeFramedY:600,brightSeed:110,closeRadius:1,growRadius:2,reviewedExistingWheelAxlePadMasks:true},width:outW,height:outH,keyed,contentBox:box,scale,sha256:sha256(webp)},null,2)+'\\n');
console.log(JSON.stringify({width:outW,height:outH,keyed,contentBox:box,scale,sha256:sha256(webp)}));
'''
for key, filename in [('PREPARED','prepared-card-source.png'),('CARD','card-cutout.webp'),('PROVENANCE','staged-card-provenance.json'),('FRAME','final-frames/1.webp'),('PROOF','prepared-card-alpha-proof.json'),('PREPARE_SCRIPT','prepare-card-floor-matte.py')]:
    end = end.replace(key, json.dumps(str(r / filename)))
(r / 'stage-prepared-card.mts').write_text(core + end, encoding='utf-8')
print(json.dumps(proof))
