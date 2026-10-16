"""Portable retained-source harness candidate. Pillow + NumPy only.

python reproduce.py --build [--out NEW_FOLDER]
python reproduce.py --verify
No image-service call, native-body transform or anatomical depth certification.
"""
from pathlib import Path
from io import BytesIO
import argparse, hashlib, json, shutil, zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_bytes())
def save(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf8')
def rgba(p):return Image.open(p).convert('RGBA')
def pixel(im):return hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()
def png(im):
    b=BytesIO();im.save(b,format='PNG');return b.getvalue()
def compose(layers):
    im=Image.new('RGBA',layers[0][1].size)
    for name,l in layers:im=Image.alpha_composite(im,l)
    return im
def allfiles(root):return {p.relative_to(root).as_posix():sha(p) for p in sorted(root.rglob('*')) if p.is_file() and p.name!='candidate-payload-manifest.json'}
def verify_ora(path,expected=None):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist()))==8
        doc=ET.fromstring(z.read('stack.xml'))
        layers=[(l.attrib['name'],Image.open(BytesIO(z.read(l.attrib['src']))).convert('RGBA')) for l in reversed(list(doc.find('stack')))]
        merged=compose(layers)
        assert pixel(merged)==pixel(Image.open(BytesIO(z.read('mergedimage.png'))))
        if expected is not None:assert pixel(merged)==pixel(expected)
    return {'path':path.name,'sha256':sha(path),'layers':len(layers),'mergedAndStackRgbaExact':True}
def ora(path,layers):
    merged=compose(layers)
    doc=ET.Element('image',w=str(merged.width),h=str(merged.height),name='Front squat shoulder harness: intact athlete and editable colour/equipment')
    stack=ET.SubElement(doc,'stack')
    members={'mimetype':b'image/openraster','mergedimage.png':png(merged)}
    for i,(name,im) in reversed(list(enumerate(layers))):
        key=f'data/layer{i}.png';members[key]=png(im)
        ET.SubElement(stack,'layer',name=name,src=key,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'})
    members['stack.xml']=ET.tostring(doc,encoding='utf8')
    with zipfile.ZipFile(path,'x') as z:
        for name,data in members.items():
            info=zipfile.ZipInfo(name,(2026,10,16,0,0,0))
            info.compress_type=zipfile.ZIP_STORED if name=='mimetype' else zipfile.ZIP_DEFLATED
            z.writestr(info,data)
    return verify_ora(path,merged)
def build(root):
    for rel,value in load(root/'evidence/input-hashes.json').items():assert sha(root/rel)==value,rel
    assert sha(root/'originals/canonical-review-reference.png')=='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
    plan=load(root/'sequence-plan.json');draft=root/'draft';assert not draft.exists()
    for d in ['', 'frames','editables','layers']:(draft/d).mkdir(exist_ok=False)
    proofs=[];native={};framed={};rows=[]
    for label in ['A','B']:
        original=rgba(root/f'originals/{label}-original.png')
        colour=rgba(root/f'originals/{label}-source-tone-overlay.png')
        original_colour=rgba(root/f'originals/{label}-source-tone-finish.png')
        assert pixel(Image.alpha_composite(original,colour))==pixel(original_colour)
        back=rgba(root/f'equipment/{label}-back-equipment.png')
        front=np.array(rgba(root/f'equipment/{label}-front-equipment.png'))
        arm=np.array(Image.open(root/f'equipment/{label}-unchanged-foreground-arm-mask.png').convert('L'))
        front[arm>0,3]=0
        front=Image.fromarray(front)
        layers=[('Neutral black scene',Image.new('RGBA',original.size,(0,0,0,255))),
                ('Intact original athlete, bar, plates and trainers',original),
                ('Quadriceps primary and glutes/core secondary: continuous source-tone transfer',colour),
                ('Same rigid harness: visible rear equipment',back),
                ('Same rigid harness: front equipment with unchanged foreground arms',front)]
        native[label]=compose(layers)
        a=np.array(original_colour);b=np.array(native[label])
        changed=np.any(a!=b,axis=2)
        gear=(np.array(back)[:,:,3]>0)|(np.array(front)[:,:,3]>0)
        assert not np.any(changed&~gear)
        for box in [(640,835,910,930),(730,230,835,308) if label=='A' else (730,380,835,460)]:
            assert pixel(native[label].crop(box))==pixel(original_colour.crop(box))
        native[label].save(draft/f'{label}-native.png')
        proofs.append(ora(draft/f'editables/{label}-native.ora',layers))
        def pad(im):
            result=Image.new('RGBA',tuple(plan['dimensions']))
            result.paste(im.crop(tuple(plan['commonCrop'])),tuple(plan['padding']))
            return result
        fl=[(name,pad(im)) for name,im in layers]
        # The scene pad covers the entire final canvas; source coordinates have
        # one common integer crop/translation and are never rescaled.
        fl[0]=(fl[0][0],Image.new('RGBA',tuple(plan['dimensions']),(0,0,0,255)))
        framed[label]=fl
        compose(fl).save(draft/f'{label}-framed.png')
        for name,im in [('existing-colour',colour),('back-equipment',back),('front-equipment-with-source-occlusion',front)]:im.save(draft/f'layers/{label}-{name}.png')
        rows.append({'label':label,'changedByEquipmentPixels':int(changed.sum()),'changedOutsideEquipmentAlpha':0,
                     'sourceHeadAndTrainersRgbaExactToExistingColourFinish':True,
                     'wholeBodyScale':1,'localBodyTransforms':0,'headHandOrShoeGrafts':0})
    plan['frameHashes']={}
    for index,label in enumerate(plan['sourcePoseOrder'],1):
        im=compose(framed[label]);frame=draft/f'frames/{index}.webp'
        im.save(frame,format='WEBP',lossless=True,quality=100,method=6,exact=True)
        assert pixel(Image.open(frame))==pixel(im)
        plan['frameHashes'][f'draft/frames/{index}.webp']=sha(frame)
        proofs.append(ora(draft/f'editables/{index}.ora',framed[label]))
    assert all(len(x['cue'].split())<=7 and 0<=x['t']<=1 for x in plan['beats'])
    save(root/'sequence-plan.json',plan)
    save(draft/'pixel-and-editable-proof.json',{'sourceRecords':rows,'oraReadbacks':proofs,'sixLosslessFramesExact':True,
        'wholeSceneScale':1,'commonCrop':plan['commonCrop'],'padding':plan['padding'],
        'newImageRequests':0,'strictCertification':False,'acceptancePending':True,'completionCredit':False})
    save(root/'candidate-payload-manifest.json',{'files':allfiles(root),'acceptance':False})
def verify(root):
    assert allfiles(root)==load(root/'candidate-payload-manifest.json')['files']
    plan=load(root/'sequence-plan.json');proof=[]
    for i,label in enumerate(plan['sourcePoseOrder'],1):
        frame=root/f'draft/frames/{i}.webp'
        assert sha(frame)==plan['frameHashes'][f'draft/frames/{i}.webp']
        expected=rgba(root/f'draft/{label}-framed.png')
        assert pixel(Image.open(frame))==pixel(expected)
        proof.append(verify_ora(root/f'draft/editables/{i}.ora',expected))
    for label in ['A','B']:proof.append(verify_ora(root/f'draft/editables/{label}-native.ora',rgba(root/f'draft/{label}-native.png')))
    return {'payloadFiles':len(allfiles(root)),'eightNewOraStacksExact':len(proof)==8,'sixFramesExact':True,
            'dimensions':plan['dimensions'],'newImageRequests':0,'completionCredit':False}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--build',action='store_true');mode.add_argument('--verify',action='store_true')
    parser.add_argument('--out',type=Path,default=HERE);args=parser.parse_args();root=args.out.resolve()
    if args.build:
        if root!=HERE:
            assert not root.exists();root.mkdir(parents=True)
            for folder in ['originals','equipment','evidence']:shutil.copytree(HERE/folder,root/folder)
            for name in ['reproduce.py','sequence-plan.json']:shutil.copyfile(HERE/name,root/name)
        build(root)
    print(json.dumps({'candidate':str(root),**verify(root)},indent=2))
if __name__=='__main__':main()
