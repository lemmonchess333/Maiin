"""Reopen the retained native bottom layers and stage exact editable sources."""
from pathlib import Path
import hashlib
import io
import json
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
plan=json.loads((HERE/'sequence-plan.json').read_text())
crop=tuple(plan['commonCrop'])
size=(1024,1856)
def png(image):
    data=io.BytesIO();image.save(data,format='PNG');return data.getvalue()
def compose(layers,dimensions):
    image=Image.new('RGBA',dimensions)
    for name,layer in reversed(layers):image=Image.alpha_composite(image,layer)
    return image
def reopen(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        root=ET.fromstring(z.read('stack.xml'))
        dimensions=(int(root.attrib['w']),int(root.attrib['h']))
        layers=[]
        for item in root.find('stack'):
            assert item.tag=='layer' and item.get('opacity','1') in ['1','1.0']
            assert item.get('visibility','visible')=='visible'
            assert item.get('composite-op','svg:src-over')=='svg:src-over'
            canvas=Image.new('RGBA',dimensions)
            layer=Image.open(io.BytesIO(z.read(item.attrib['src']))).convert('RGBA')
            canvas.alpha_composite(layer,dest=(int(item.get('x',0)),int(item.get('y',0))))
            layers.append((item.get('name','layer'),canvas))
        merged=compose(layers,dimensions)
        assert np.array_equal(np.asarray(merged),np.asarray(Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA')))
        return dimensions,layers,merged
def save_ora(path,layers,dimensions):
    root=ET.Element('image',{'w':str(dimensions[0]),'h':str(dimensions[1]),'name':'Retained Overhead Tricep Extension'})
    stack=ET.SubElement(root,'stack')
    merged=compose(layers,dimensions)
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
        for index,(name,layer) in enumerate(layers):
            member=f'data/layer-{index}.png'
            ET.SubElement(stack,'layer',{'name':name,'src':member,'x':'0','y':'0','opacity':'1','visibility':'visible','composite-op':'svg:src-over'})
            z.writestr(member,png(layer))
        z.writestr('stack.xml',ET.tostring(root,encoding='utf-8'))
        z.writestr('mergedimage.png',png(merged))
        thumbnail=merged.copy();thumbnail.thumbnail((256,256))
        z.writestr('Thumbnails/thumbnail.png',png(thumbnail))
    reopened_size,reopened_layers,reopened=reopen(path)
    assert reopened_size==dimensions and len(reopened_layers)==len(layers)
    assert np.array_equal(np.asarray(reopened),np.asarray(merged))
    return merged
bottom_ora=HERE.parent/'standing-master-authoring-v1.ora'
dimensions,bottom_layers,bottom=reopen(bottom_ora)
assert dimensions==size
assert np.array_equal(np.asarray(bottom.convert('RGB')),np.asarray(Image.open(HERE.parent/'4-standing-master-v1.png').convert('RGB')))
top_layers=[('Existing muscle colours — approved exact palette',Image.open(HERE/'top-colour-layer.png').convert('RGBA')),
            ('Intact source — integer whole-frame placement (-13,+37)',Image.open(HERE/'top-whole-frame-placement.png').convert('RGBA'))]
top=compose(top_layers,size)
assert np.array_equal(np.asarray(top.convert('RGB')),np.asarray(Image.open(HERE/'top-candidate-colours.png').convert('RGB')))
records={}
for pose,layers in [(1,top_layers),(4,bottom_layers)]:
    for variant,selected,dimensions in [('full',layers,size),('framed',[(name,layer.crop(crop)) for name,layer in layers],(crop[2]-crop[0],crop[3]-crop[1]))]:
        path=HERE/'draft'/f'{pose}-{variant}.ora'
        merged=save_ora(path,selected,dimensions)
        if variant=='framed':assert np.array_equal(np.asarray(merged.convert('RGB')),np.asarray(Image.open(HERE/'draft'/f'{pose}-framed.png').convert('RGB')))
        records[path.name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'dimensions':list(dimensions),'layers':[name for name,layer in selected],'reopenedPixelExact':True}
(HERE/'editables-proof.json').write_text(json.dumps({'scope':'Editable integrity only; no visual acceptance inferred','retainedBottomOra':str(bottom_ora),'records':records},indent=2)+'\n',encoding='utf8')
print(json.dumps({'reopenedExact':len(records),'records':records},indent=2))
