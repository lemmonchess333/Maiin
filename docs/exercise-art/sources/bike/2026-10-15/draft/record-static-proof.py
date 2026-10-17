"""Read/write sidecar diagnostics only; no production assets or acceptance claim."""
from pathlib import Path
from PIL import Image
import hashlib,io,json,zipfile
import numpy as np
import xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
audit=json.loads((R/'finishing-audit.json').read_text())
names=['3-lower-direct-original.png','6-upper-direct-original.png']
crop=(48,32,977,1464);offsets=[(0,0),(-1,16)]
rois={'wholeUpperBodyAndGrips':(210,45,860,615),'saddlePelvisSupport':(650,540,878,790),'pedalsAndOriginalOcclusion':(350,840,755,1315)}
proofs={};checks=[]
for n,name in enumerate(names,1):
 source=Image.open(R/name).convert('RGBA');finished=Image.open(R/f'{n}-native-finished.png').convert('RGBA')
 a=np.asarray(source);b=np.asarray(finished);delta=a[:,:,2].astype(int)-np.minimum(a[:,:,0],a[:,:,1]).astype(int)
 domain=np.zeros(a.shape[:2],bool);domain[530:1170,350:850]=True;existing=(delta>6)&domain
 assert np.array_equal(a[~existing],b[~existing]) and np.array_equal(a[:,:,3],b[:,:,3])
 normalized=Image.new('RGBA',source.size,(0,0,0,255));normalized.paste(finished,offsets[n-1])
 framed=Image.open(R/f'{n}-framed.png').convert('RGBA');assert normalized.crop(crop).tobytes()==framed.tobytes()
 sourceNormalized=Image.new('RGBA',source.size,(0,0,0,255));sourceNormalized.paste(source,offsets[n-1])
 for label,box in rois.items():
  path=R/f'{n}-{label}-native-source-proof.png';sourceNormalized.crop(box).save(path)
  proofs[path.name]={'sha256':sha(path),'normalizedSourceROI':box,'diagnosticCropOnly':True,'scale':1}
 with zipfile.ZipFile(R/f'{n}-framed.ora') as z:
  root=ET.fromstring(z.read('stack.xml'));merged=Image.new('RGBA',framed.size)
  for layer in reversed(list(root.find('stack'))):merged.alpha_composite(Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
  assert merged.tobytes()==framed.tobytes()==Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA').tobytes()
 checks.append({'pose':n,'unchangedNeutralOutsideExistingColourFields':True,'originalAlphaExact':True,'commonCropMatchesWholeSceneOffset':True,'reopenedOraPixelExact':True,'nativeFinalSha256':sha(R/f'{n}-native-finished.png'),'framedSha256':sha(R/f'{n}-framed.png'),'oraSha256':sha(R/f'{n}-framed.ora')})
frames=[]
for i,p in enumerate([1,1,2,2,1,1],1):
 path=R/f'final-frames/{i}.webp';assert Image.open(path).convert('RGBA').tobytes()==Image.open(R/f'{p}-framed.png').convert('RGBA').tobytes()
 frames.append({'beat':i,'sourcePose':p,'sha256':sha(path),'decodedPixelExact':True})
out={'status':'static-byte-and-framing-proof-only; semantic/native/mobile acceptance pending','exerciseId':'bike','checks':checks,'frames':frames,'proofCrops':proofs,'sourceHashes':{name:sha(R/name) for name in names},'currentFinishingScriptSha256':sha(R/'prepare-pair.py'),'firstColourDraft':'first-colour-draft/ held; no acceptance','nativeObservations':[
'Both originals were viewed alongside canonicalFA56 at1024x1536. Bald faceless lean pale athlete, neutral featureless pelvis, no shorts and white trainers retained; source head/torso redraws are disclosed.',
'Each source has supported pelvis and visible closed bar grips; no gross disconnected limb or unsupported visible pedal found in this bounded prep review. Parent final physical judgment remains separate.',
'Lower source shows both original strapped trainers. Upper source shows the near strapped trainer; far calf/shoe/pedal pass behind original opaque housing and are not independently visible/verified.',
'One whole-scene upper offset(-1,+16), then identicalcrop[48,32,977,1464] to929x1432. Visible-source pixel threshold>8 is fully retained; no human fitting/resizing or gear redraw.',
'First coarse-mask colour attempt had wrong near-quad split and missed calf edges. It is retained and held. Corrected source-component masks and source-brightness palette treatment require parent/independent actual semantic inspection.',
'Only two opposed positions are shown. No forward-trajectory, smooth revolution or six-unique physical-pose claim.'],
'newImageRequests':0,'productionRegistered':False,'completionCredit':False,'pending':['Actual corrected-native colour/muscle boundary judgment','Equipment/contact/whole-guide native acceptance','Actual app mobile light/dark/card/controls review','Release/source/project/current-headCI/actual merge gates']}
(R/'static-proof.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'proof':'static-proof.json','poses':2,'frames':6,'oraReopenedExact':2,'semanticAcceptanceClaimed':False,'completionCredit':False}))
