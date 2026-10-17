"""Native colour-only finish, one common crop/pad, six lossless slots and ORAs.
No image service or anatomical transform is performed by this portable recipe.
"""
from pathlib import Path
from io import BytesIO
import json,hashlib,zipfile,xml.etree.ElementTree as ET
import numpy as np
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent;O=P/'draft';O.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=json.loads((P/'sequence-plan.json').read_bytes());crop=tuple(plan['commonCrop']);pad=tuple(plan['padding']);canvas=tuple(plan['dimensions'])
def poly(points):
    m=Image.new('L',(1024,1536));ImageDraw.Draw(m).polygon(points,fill=255);return np.array(m)>0
regions={
 'A':[[(412,933),(439,943),(453,968),(452,1000),(442,1026),(418,1043),(396,1059),(383,1038),(382,1012),(390,978)],
      [(588,944),(618,949),(640,972),(653,1001),(654,1034),(643,1056),(629,1074),(606,1063),(586,1043),(574,1019),(564,994),(569,971)]],
 'B':[[(398,1087),(418,1094),(439,1118),(444,1146),(429,1171),(401,1177),(375,1167),(366,1150),(369,1123),(381,1101)],
      [(568,1098),(592,1094),(620,1109),(642,1134),(641,1166),(619,1189),(586,1179),(570,1151)]]}
regions['A']=[
 [(419,931),(427,942),(430,961),(434,977),(441,986),(452,990),(452,996),(439,1022),(424,1035),(407,1050),(395,1040),(386,1020),(381,999),(383,979),(392,958),(406,944)],
 [(580,945),(591,935),(607,931),(625,939),(639,955),(649,976),(653,999),(650,1018),(641,1038),(626,1058),(615,1079),(605,1060),(585,1044),(569,1027),(558,1011),(555,993),(560,973),(569,957)]]
regions['B']=[
 [(412,1088),(425,1091),(430,1108),(432,1134),(435,1153),(441,1161),(453,1167),(440,1175),(421,1180),(403,1179),(386,1174),(372,1165),(362,1151),(360,1135),(365,1118),(376,1102),(393,1093)],
 [(568,1109),(583,1098),(604,1102),(623,1114),(639,1132),(650,1151),(652,1171),(646,1183),(632,1191),(613,1195),(591,1190),(574,1182),(560,1169),(552,1153),(552,1135),(557,1119),(565,1110)]]
def stable(z,n,b,compression=zipfile.ZIP_DEFLATED):
    i=zipfile.ZipInfo(n,(2026,10,16,0,0,0));i.compress_type=compression;z.writestr(i,b)
def png(im):b=BytesIO();im.save(b,format='PNG');return b.getvalue()
def frame(im):
    out=Image.new('RGBA',canvas,(0,0,0,255));out.paste(im.crop(crop),pad);return out
def ora(p,layers,merged):
    root=ET.Element('image',{'version':'0.0.3','w':str(canvas[0]),'h':str(canvas[1])});stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(p,'w') as z:
        stable(z,'mimetype','image/openraster',zipfile.ZIP_STORED)
        for i,(name,im) in enumerate(reversed(layers)):
            rel=f'data/layer{i}.png';stable(z,rel,png(im));ET.SubElement(stack,'layer',{'name':name,'src':rel,'opacity':'1','visibility':'visible','composite-op':'svg:src-over','x':'0','y':'0'})
        stable(z,'stack.xml',ET.tostring(root));stable(z,'mergedimage.png',png(merged))
stats=[]
for n in ['A','B']:
    im=Image.open(P/f'originals/{n}-original.png').convert('RGBA');assert im.size==(1024,1536)
    a=np.array(im);rgb=a[:,:,:3].astype(float);mx=rgb.max(2);mn=rgb.min(2);r,g,b=rgb.transpose(2,0,1)
    violet=(b-np.minimum(r,g)>8)&(b-g>6)&(mx>80)
    primary=np.maximum.reduce([poly(p) for p in regions[n]])&violet
    secondary=violet&~primary
    sat=(mx-mn)/np.maximum(mx,1);out=a.copy()
    for role,mask,target,ref in [('primary',primary,(123,114,233),.65),('secondary',secondary,(149,144,224),.35)]:
        amount=np.clip(sat/ref,0,1)
        tint=mx[:,:,None]*(1-amount[:,:,None]*(1-np.array(target)/255))
        out[mask,:3]=np.rint(tint[mask]).clip(0,255).astype('uint8')
        Image.fromarray(mask.astype('uint8')*255).save(O/f'{n}-{role}-mask.png')
    changed=np.any(a!=out,2);assert not (changed&~violet).any()
    overlay=np.zeros_like(out);overlay[changed]=out[changed]
    finished=Image.fromarray(out);finished.save(O/f'{n}-colour-full.png');Image.fromarray(overlay).save(O/f'{n}-colour-overlay.png')
    native=frame(finished);native.save(O/f'{n}-native.png')
    base=frame(im);over=Image.new('RGBA',canvas);over.paste(Image.fromarray(overlay).crop(crop),pad)
    background=Image.new('RGBA',canvas,(0,0,0,255));ora(O/f'{n}-native.ora',[('Black padding',background),('Native whole source with original equipment',base),('Approved palette using original source tone',over)],native)
    finished.crop((240,1000,780,1420) if n=='A' else (240,1060,780,1420)).save(O/f'{n}-head-and-palms-native.png')
    stats.append({'pose':n,'rawSourceSha256':sha(P/f'originals/{n}-original.png'),'primaryPixels':int(primary.sum()),'secondaryPixels':int(secondary.sum()),'changedOutsideSourceViolet':0,'sourceNeutralRgbaExact':True,'spatialShadingAdded':False,'anatomicalTransforms':0})
(O/'frames').mkdir(exist_ok=True)
for i,n in enumerate(plan['sourcePoseOrder'],1):
    im=Image.open(O/f'{n}-native.png').convert('RGB');im.save(O/f'frames/{i}.webp',lossless=True,quality=100,method=4)
    assert Image.open(O/f'frames/{i}.webp').convert('RGB').tobytes()==im.tobytes()
report={'states':stats,'commonCrop':crop,'integerPadding':pad,'sourceScale':1,'dimensions':canvas,
        'palette':{'primary':'#7B72E9','secondary':'#9590E0'},'newImageRequestsInRecipe':0,'strictCertified':False,'completionCredit':False}
(O/'native-colour-and-exports-proof.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps(report))
