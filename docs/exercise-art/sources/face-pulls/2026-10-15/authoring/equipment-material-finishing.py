"""One bounded neutral-rubber finish; immutable v1 geometry and human guard."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import ast
import json
import math
import shutil
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT=Path(__file__).resolve().parent
SOURCE=OUT.parent
V1=SOURCE/'ergonomic-handle-equipment-proposal-20261015'
V1_SCRIPT_SHA='a142ec3ec029003b7f1271247ed44c56bd01a178c1472df12bccc679b8356514'

def digest(path): return sha256(path.read_bytes()).hexdigest()

def png_bytes(im):
    b=BytesIO(); im.save(b,format='PNG'); return b.getvalue()

assert digest(V1/'prepare-ergonomic-proposal.py')==V1_SCRIPT_SHA
review=json.loads((V1/'ergonomic-proposal-review.json').read_bytes())
for name,value in review['files'].items():
    assert digest(V1/name)==value,name

# Import only pure geometry definitions; never execute the historical builder.
tree=ast.parse((V1/'prepare-ergonomic-proposal.py').read_text(encoding='utf-8'))
definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['curved','handle']]
geometry={'np':np,'math':math,'ImageDraw':ImageDraw,'SCALE':4}
exec(compile(ast.Module(body=definitions,type_ignores=[]),str(V1/'prepare-ergonomic-proposal.py'),'exec'),geometry)

def shade_equipment_shape(unclipped):
    """One shared soft-form/bevel shader for all fixed equipment silhouettes.

    Lighting is top-left, neutral and restrained. Contour distance generates
    rounded rubber form; the complete UNCLIPPED shape controls shading so
    fingers' occlusion edges do not acquire a false bright bevel.
    """
    alpha=np.array(unclipped.getchannel('A'))
    ys,xs=np.where(alpha>0)
    box=(int(xs.min())-3,int(ys.min())-3,int(xs.max())+4,int(ys.max())+4)
    cropped=alpha[box[1]:box[3],box[0]:box[2]]
    inside=cropped>127
    padded=np.pad(inside,1)
    near=np.logical_or.reduce([padded[dy:dy+inside.shape[0],dx:dx+inside.shape[1]] for dy in range(3) for dx in range(3)])
    boundary=np.argwhere(near&~inside).astype(float)
    pixels=np.argwhere(inside)
    distance=np.zeros(inside.shape,dtype=float)
    # Exact Euclidean distance removes the visible diagonal facets seen in
    # the preserved first grid-distance material diagnostic.
    for start in range(0,len(pixels),256):
        p=pixels[start:start+256]
        delta=p[:,None,:]-boundary[None,:,:]
        nearest=np.sqrt(np.min(np.sum(delta*delta,axis=2),axis=1))
        distance[p[:,0],p[:,1]]=nearest
    height=np.sqrt(np.clip(distance/max(float(distance.max()),1),0,1))*19
    kernel=np.exp(-np.arange(-4,5,dtype=float)**2/(2*1.35**2));kernel/=kernel.sum()
    for axis in [0,1]:
        padding=[(0,0),(0,0)];padding[axis]=(4,4)
        padded_height=np.pad(height,padding)
        if axis==0:
            height=sum(w*padded_height[i:i+inside.shape[0],:] for i,w in enumerate(kernel))
        else:
            height=sum(w*padded_height[:,i:i+inside.shape[1]] for i,w in enumerate(kernel))
    gy,gx=np.gradient(height)
    normals=np.stack([-gx,-gy,np.ones_like(gx)],axis=2)
    normals/=np.maximum(np.linalg.norm(normals,axis=2,keepdims=True),1e-8)
    light=np.array([-.52,-.64,.76]);light/=np.linalg.norm(light)
    halfway=light+np.array([0.,0.,1.]);halfway/=np.linalg.norm(halfway)
    diffuse=np.maximum(normals@light,0)
    sheen=np.maximum(normals@halfway,0)**22
    # Values remain in the original black-rubber material's observed range.
    tone=9+40*diffuse+32*sheen
    bevel=6*np.exp(-((distance-1.4)/1.0)**2)*diffuse
    tone=np.uint8(np.clip(np.round(tone+bevel),10,90))
    full=np.zeros(alpha.shape,dtype=np.uint8)
    full[box[1]:box[3],box[0]:box[2]]=tone
    return full,alpha

def write_ora(path,base,layer,merged):
    root=Element('image',w=str(base.width),h=str(base.height),name='Face Pull equipment material-only v2')
    stack=SubElement(root,'stack')
    for name,src in [('Fixed equipment geometry with neutral rubber shading','data/equipment-material.png'),('Untouched original source','data/original.png')]:
        SubElement(stack,'layer',name=name,src=src,opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'})
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
        for name,im in [('data/equipment-material.png',layer),('data/original.png',base),('mergedimage.png',merged)]:
            z.writestr(name,png_bytes(im),compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('stack.xml',tostring(root,encoding='utf-8'),compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(path) as z:
        original=Image.open(BytesIO(z.read('data/original.png'))).convert('RGBA')
        equipment=Image.open(BytesIO(z.read('data/equipment-material.png'))).convert('RGBA')
        assert np.array_equal(np.array(Image.alpha_composite(original,equipment)),np.array(merged))
        assert np.array_equal(np.array(Image.open(BytesIO(z.read('mergedimage.png'))).convert('RGBA')),np.array(merged))

rows=[]
for pose in review['poses']:
    name=pose['pose']
    source=Path(pose['source'])
    assert digest(source)==pose['sourceSha256']
    base=Image.open(source).convert('RGBA')
    flat=Image.open(V1/f'{name}-ergonomic-proposal.png').convert('RGBA')
    old_layer=Image.open(V1/f'{name}-equipment-layer.png').convert('RGBA')
    a=np.array(base);old=np.array(old_layer);material=old.copy()
    tone=np.zeros((base.height,base.width),dtype=np.uint8)
    combined=np.zeros_like(tone)
    for equipment in pose['equipmentGeometry']:
        high=Image.new('RGBA',(base.width*4,base.height*4))
        geometry['handle'](high,equipment['terminalApprox'],equipment['innerFlangeApprox'],equipment['farTerminalOmittedAsOccluded'])
        shape=high.resize(base.size,Image.Resampling.LANCZOS)
        shade,shape_alpha=shade_equipment_shape(shape)
        support=shape_alpha>0
        tone[support]=shade[support]
        combined=np.maximum(combined,shape_alpha)
    guard=np.array(Image.open(V1/f'{name}-human-contour-guard.png'))>0
    derived_alpha=combined.copy();derived_alpha[guard]=0;derived_alpha[derived_alpha<=8]=0
    assert np.array_equal(derived_alpha,old[:,:,3]),'Geometry changed'
    support=old[:,:,3]>0
    for channel in range(3): material[:,:,channel][support]=tone[support]
    assert np.array_equal(material[:,:,3],old[:,:,3])
    assert np.array_equal(material[~support],old[~support])
    layer=Image.fromarray(material)
    merged=Image.alpha_composite(base,layer)
    b=np.array(merged);flat_array=np.array(flat)
    changed=np.any(b!=a,axis=2)
    material_changes=np.any(b!=flat_array,axis=2)
    assert not (changed&guard).any()
    assert not (material_changes&~support).any()
    assert np.array_equal(a[:,:,3],b[:,:,3])
    layer.save(OUT/f'{name}-equipment-material-v2-layer.png')
    merged.save(OUT/f'{name}-ergonomic-material-v2.png')
    shutil.copyfile(V1/f'{name}-equipment-mask.png',OUT/f'{name}-equipment-mask-exact-v1.png')
    write_ora(OUT/f'{name}-equipment-material-v2.ora',base,layer,merged)
    box=(65,190,665,385)
    comparison=Image.new('RGBA',(1200,1170))
    for i,im in enumerate([base,flat,merged]):
        comparison.alpha_composite(im.crop(box).resize((1200,390),Image.Resampling.NEAREST),(0,i*390))
    comparison.save(OUT/f'{name}-original-flat-material-rows-2x.png')
    rows.append({'pose':name,'sourceSha256':pose['sourceSha256'],'oldFlatSha256':digest(V1/f'{name}-ergonomic-proposal.png'),'geometryAlphaPixelsExact':True,'geometryMaskFileByteExact':digest(OUT/f'{name}-equipment-mask-exact-v1.png')==digest(V1/f'{name}-equipment-mask.png'),'humanBrightPlus4pxGuardChangedPixels':0,'outsideEquipmentSupportRGBAExact':True,'alphaOriginalExact':True,'RGBMaterialChangesFromFlatPixels':int(material_changes.sum()),'totalChangedPixelsFromOriginal':int(changed.sum()),'visibleRubberToneRange':[int(tone[support].min()),int(tone[support].max())],'oraReopenedMergedRGBAExact':True,'farStartTerminalOcclusionUnresolved':name=='1-start'})

for name,value in review['files'].items(): assert digest(V1/name)==value,name
report={'status':'single-material-only-v2-proposal-awaiting-root-native-review','v1ReviewSha256':digest(V1/'ergonomic-proposal-review.json'),'v1BuilderSha256':V1_SCRIPT_SHA,'method':'Shared neutral soft-form rubber shader from the original equipment silhouette Euclidean contour distance with float Gaussian smoothing, top-left diffuse light, restrained broad sheen and soft edge bevel. Form calculated before human occlusion; exact original v1 equipment alpha used at final composition. No body gradient, geometry, position, contour-mask or cable/stack movement. No noise/painterly texture.','materialDryRunDefect':'First grid-distance render showed diagonal facets on native review. Its script/PNGs/ORAs/proof are preserved in diagnostic-first-grid-distance-faceting. Only the shader distance/normal smoothing was corrected before handoff; exact geometry/alpha retained.','sourceMaterialSample':{'source':str(SOURCE/'4-rope-rejected.png'),'region':[323,252,354,283],'nativeBallGrayscaleApproxP10P50P90':[12.7,34.7,81.9],'shaderAllowedNeutralRange':[10,90]},'poses':rows,'remainingFindings':review['remainingFindings'],'noApprovalOrProductionClaim':True,'v1FilesStillExact':True,'files':{p.name:digest(p) for p in OUT.iterdir() if p.is_file() and p.name!='material-v2-preservation-review.json'}}
(OUT/'material-v2-preservation-review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'poses':rows,'reviewSha256':digest(OUT/'material-v2-preservation-review.json')},indent=2))
