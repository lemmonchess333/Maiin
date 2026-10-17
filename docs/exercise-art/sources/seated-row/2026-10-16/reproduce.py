"""Portable whole-source cable row: Pillow + NumPy, no source-bank access.

python reproduce.py --build [--out NEW_FOLDER]
python reproduce.py --verify
"""
from pathlib import Path
from io import BytesIO
import argparse,hashlib,json,shutil,subprocess,sys,zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf8')
def pixel(im):return hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()
def png(im):b=BytesIO();im.save(b,format='PNG');return b.getvalue()
def load(p):return json.loads(p.read_bytes())
def allfiles(root):return {p.relative_to(root).as_posix():sha(p) for p in sorted(root.rglob('*')) if p.is_file() and p.name!='candidate-payload-manifest.json'}
def ora(path,layers):
    expected=Image.new('RGBA',layers[0][1].size)
    for name,im in layers:expected=Image.alpha_composite(expected,im)
    doc=ET.Element('image',w=str(expected.width),h=str(expected.height),name='Seated cable row: intact source athlete, colour support and fixed apparatus')
    stack=ET.SubElement(doc,'stack');members={'mimetype':b'image/openraster','mergedimage.png':png(expected)}
    for i,(name,im) in reversed(list(enumerate(layers))):
        key=f'data/layer{i}.png';members[key]=png(im);ET.SubElement(stack,'layer',name=name,src=key,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'})
    members['stack.xml']=ET.tostring(doc,encoding='utf8')
    with zipfile.ZipFile(path,'x') as z:
        for name,data in members.items():
            info=zipfile.ZipInfo(name,(2026,10,16,0,0,0));info.compress_type=zipfile.ZIP_STORED if name=='mimetype' else zipfile.ZIP_DEFLATED;z.writestr(info,data)
    return verify_ora(path,expected)
def verify_ora(path,expected=None):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist()))==8
        doc=ET.fromstring(z.read('stack.xml'));result=Image.new('RGBA',(int(doc.attrib['w']),int(doc.attrib['h'])))
        for layer in reversed(doc.find('stack').findall('layer')):result=Image.alpha_composite(result,Image.open(BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
        merged=Image.open(BytesIO(z.read('mergedimage.png'))).convert('RGBA');assert pixel(result)==pixel(merged)
        if expected is not None:assert pixel(result)==pixel(expected)
    return {'path':path.name,'sha256':sha(path),'layers':5,'mergedAndStackRgbaExact':True}
def build(root):
    for rel,value in load(root/'evidence/input-hashes.json').items():assert sha(root/rel)==value
    assert sha(root/'originals/canonical-review-reference.png')=='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
    draft=root/'draft';assert not draft.exists();draft.mkdir()
    for script,out in [('extract-athletes.py','source-layers'),('render-station.py','equipment')]:subprocess.run([sys.executable,'-B',str(root/'authoring'/script),str(draft/out)],check=True)
    plan=load(root/'sequence-plan.json');natives={k:Image.open(draft/f'equipment/{k}-native.png').convert('RGBA') for k in ['A','B']}
    points=[]
    for im in natives.values():
        ys,xs=np.where(np.max(np.array(im)[:,:,:3],axis=2)>0);points.append([int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)])
    crop=[min(b[0] for b in points)-24,min(b[1] for b in points)-24,max(b[2] for b in points)+24,max(b[3] for b in points)+24]
    assert crop[0]>=0 and crop[1]>=0 and crop[2]<=1536 and crop[3]<=1088
    plan.update({'nativeCanvas':[1536,1088],'wholeSourceTranslation':[0,48],'wholeSourceScale':1,'commonCrop':crop,'dimensions':[crop[2]-crop[0],crop[3]-crop[1]],'frameHashes':{}})
    (draft/'frames').mkdir();(draft/'editables').mkdir();proof=[];layers_by_pose={}
    for label,num in [('A',2),('B',3)]:
        finished=Image.open(draft/f'source-layers/{label}-whole-athlete-and-bar.png').convert('RGBA');fa=np.array(finished)
        raw=Image.open(root/f'originals/{num}-original.png').convert('RGBA');ra=np.array(raw);ra[:,:,3]=fa[:,:,3];raw=Image.fromarray(ra)
        changed=np.any(ra[:,:,:3]!=fa[:,:,:3],axis=2)&(fa[:,:,3]>0)
        r,g,b=np.array(Image.open(root/f'originals/{num}-original.png').convert('RGB')).astype(float).transpose(2,0,1)
        source_chroma=(b-r>=3)&(b-g>=6)&(r-g>=1)
        assert not np.any(changed&~source_chroma),'Colour changes escaped original source chroma'
        colour=np.zeros_like(fa);colour[changed]=fa[changed]
        body=Image.new('RGBA',(1536,1088));body.paste(raw,(0,48));tint=Image.new('RGBA',(1536,1088));tint.paste(Image.fromarray(colour),(0,48))
        layers=[('Neutral black scene',Image.new('RGBA',(1536,1088),(0,0,0,255))),('Common custom cable station with three selected and seven resting plates',Image.open(draft/f'equipment/{label}-equipment.png').convert('RGBA')),('Constant-length cable through fixed pulleys',Image.open(draft/f'equipment/{label}-cable.png').convert('RGBA')),('Intact native original athlete, held bar and flexible source straps',body),('Existing source muscle fields: approved back/biceps colours and neutralised legs',tint)]
        result=Image.new('RGBA',(1536,1088))
        for name,im in layers:result=Image.alpha_composite(result,im)
        assert pixel(result)==pixel(natives[label]);layers_by_pose[label]=layers
        result.save(draft/f'{label}-native.png');result.crop(crop).save(draft/f'{label}-framed.png')
        proof.append(ora(draft/f'editables/{label}-native.ora',layers))
    for index,label in enumerate(plan['sourcePoseOrder'],1):
        im=natives[label].crop(crop);path=draft/f'frames/{index}.webp';im.save(path,format='WEBP',lossless=True,quality=100,method=6,exact=True)
        assert pixel(Image.open(path))==pixel(im);plan['frameHashes'][f'draft/frames/{index}.webp']=sha(path)
        proof.append(ora(draft/f'editables/{index}.ora',[(name,im.crop(crop)) for name,im in layers_by_pose[label]]))
    assert all(len(x['cue'].split())<=7 and 0<=x['t']<=1 for x in plan['beats'])
    save(root/'sequence-plan.json',plan)
    save(draft/'pixel-and-editable-proof.json',{'nativeRgbaExactToReviewedConstruction':True,'changesConfinedToSourceChroma':True,'bodyScale':1,'bodyTranslation':[0,48],'bodyWarpsOrGrafts':False,'oraReadbacks':proof,'sourcePoseOrder':plan['sourcePoseOrder'],'sixLosslessFramesExact':True,'crop':crop,'newImageRequests':0,'strictCertification':False,'completionCredit':False})
    save(root/'candidate-payload-manifest.json',{'files':allfiles(root),'acceptance':False})
def verify(root):
    assert allfiles(root)==load(root/'candidate-payload-manifest.json')['files']
    plan=load(root/'sequence-plan.json');proof=[]
    for n,label in enumerate(plan['sourcePoseOrder'],1):
        frame=root/f'draft/frames/{n}.webp';assert sha(frame)==plan['frameHashes'][f'draft/frames/{n}.webp']
        expected=Image.open(root/f'draft/{label}-framed.png').convert('RGBA');assert pixel(Image.open(frame))==pixel(expected)
        proof.append(verify_ora(root/f'draft/editables/{n}.ora',expected))
    for label in ['A','B']:proof.append(verify_ora(root/f'draft/editables/{label}-native.ora',Image.open(root/f'draft/{label}-native.png').convert('RGBA')))
    return {'payloadFiles':len(allfiles(root)),'eightOraStacksExact':len(proof)==8,'sixFramesExact':True,'dimensions':plan['dimensions'],'newImageRequests':0,'completionCredit':False}
def main():
    parser=argparse.ArgumentParser(description=__doc__);mode=parser.add_mutually_exclusive_group(required=True);mode.add_argument('--build',action='store_true');mode.add_argument('--verify',action='store_true');parser.add_argument('--out',type=Path,default=HERE);args=parser.parse_args();root=args.out.resolve()
    if args.build:
        if root!=HERE:
            assert not root.exists();root.mkdir(parents=True)
            for folder in ['originals','authoring','evidence']:shutil.copytree(HERE/folder,root/folder)
            for name in ['reproduce.py','sequence-plan.json']:shutil.copyfile(HERE/name,root/name)
        build(root)
    print(json.dumps({'candidate':str(root),**verify(root)},indent=2))
if __name__=='__main__':main()
