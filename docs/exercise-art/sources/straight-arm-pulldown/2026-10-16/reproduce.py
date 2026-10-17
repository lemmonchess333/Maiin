"""Portable native source recipe. Original pixels never change coordinates.

Equipment is separately authored. Same-coordinate source-colour restoration of
former occlusion is documented; it is not an exact original-pixel guarantee.
"""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, json, hashlib, zipfile, xml.etree.ElementTree as ET, math
P=Path(__file__).resolve().parent
C=P;I=C/'originals';O=C/'draft';O.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
size=(1024,1536);pad=(128,160);canvas=(1152,1728)
raw={n:np.array(Image.open(I/f'{n}.png').convert('RGB')) for n in ('A','B')}
def poly(points):
    im=Image.new('L',size);ImageDraw.Draw(im).polygon(points,fill=255);return im
def hand_mask(n):
    polygons=([[ (440,675),(472,687),(485,716),(481,742),(472,758),(462,765),(451,764),(453,741),(448,720)],
               [(627,697),(676,697),(682,737),(678,759),(668,783),(655,799),(643,800),(640,794),(632,801),(623,797),(629,774),(631,743)]] if n=='A' else
              [[(192,254),(219,251),(231,272),(229,298),(218,318),(207,329),(194,329),(194,315),(200,296)],
               [(389,259),(425,264),(443,283),(439,314),(424,338),(410,342),(403,339),(395,343),(386,339),(392,319)]])
    m=np.maximum.reduce([np.array(poly(p)) for p in polygons])>0
    light=(raw[n].max(2)>145)&m
    light=np.array(Image.fromarray(light.astype('uint8')*255).filter(ImageFilter.MaxFilter(3)))>0
    if n=='A':
        light[:,595:]=False
        near_hand=poly([(638,678),(682,678),(677,695),(673,710),(678,727),(680,746),(679,759),(674,771),(669,782),(663,789),(657,790),(651,797),(643,798),(640,795),(636,800),(625,800),(624,797),(630,781),(633,768),(631,752),(627,738),(623,726),(619,718),(613,709),(612,705),(621,701),(629,694)])
        light |= np.array(near_hand)>0
    return light
hands={n:hand_mask(n) for n in raw}
clean={n:raw[n].copy() for n in raw};restore_masks={}
# Former dumbbell silhouettes and their cast shadows. Genuine same-set source
# B supplies only already drawn anatomy/background at unchanged coordinates.
near=poly([(528,726),(537,710),(554,701),(604,699),(624,712),(632,708),(652,698),(700,698),(722,706),(739,724),(747,755),(746,791),(731,817),(712,834),(686,851),(634,866),(583,864),(547,846),(531,823),(523,780)])
far=poly([(349,705),(358,687),(377,675),(411,672),(440,678),(469,673),(510,675),(532,689),(537,723),(533,763),(517,795),(489,811),(446,812),(411,807),(377,806),(355,788),(348,754)])
alpha=np.maximum(np.array(near.filter(ImageFilter.GaussianBlur(13))).astype(float)/255,(np.array(near)>0).astype(float))
alpha[hands['A']]=0
alpha[(raw['B'].max(2)<40)&(raw['A'].max(2)>190)]=0
clean['A']=np.rint(raw['A']*(1-alpha[:,:,None])+raw['B']*alpha[:,:,None]).astype('uint8')
light=Image.fromarray((raw['A'].max(2)>190).astype('uint8')*255).filter(ImageFilter.MaxFilter(3))
fm=(np.array(far)>0)&(~hands['A'])&(np.array(light)==0)
clean['A'][fm]=raw['B'][fm]
restore_masks['A']=np.maximum(alpha,fm.astype(float))
# Top equipment is wholly outside the body except the existing closed hands;
# preserve the original bright forearms and their one-pixel contour neighbours.
bm=Image.new('L',size);bd=ImageDraw.Draw(bm)
bd.rectangle((79,225,287,369),fill=255);bd.rectangle((282,233,542,389),fill=255)
light=Image.fromarray((raw['B'].max(2)>175).astype('uint8')*255).filter(ImageFilter.MaxFilter(5))
erase=(np.array(bm)>0)&(np.array(light)==0)&(~hands['B'])
clean['B'][erase]=0;restore_masks['B']=erase.astype(float)

# NEW source, authored by the built-in image editor for the previously occluded
# forearm and thighs. Undo documented whole-window 2x previews only. Never fit
# individual limbs. Original hands remain the foreground source at native coords.
ga=Image.open(I/'A-weight-window-landscape-generated-2x.png').convert('RGB')
gb=Image.open(I/'B-arm-window-generated-2x.png').convert('RGB')
assert ga.size==(1536,1024) and gb.size==(1536,1024)
ga=ga.resize((768,512),Image.Resampling.LANCZOS)
gb=gb.resize((768,512),Image.Resampling.LANCZOS)
generated={}
for n,im,xy in [('A',ga,(256,512)),('B',gb,(128,192))]:
    full=Image.new('RGB',size);full.paste(im,xy);generated[n]=np.array(full)
# A: far weights have no hidden body besides the preserved original hand.
clean['A']=raw['A'].copy();clean['A'][fm]=0
am=np.array(near.filter(ImageFilter.GaussianBlur(7))).astype(float)/255
am=np.maximum(am,(np.array(near)>0).astype(float))
keepA=hands['A']
keepA=keepA.copy();keepA[:,595:]=False
am[keepA]=0
am[(raw['A'].max(2)>175)&(np.array(near)==0)]=0
am[(generated['A'].max(2)<30)&(raw['A'].max(2)>190)]=0
clean['A']=np.rint(clean['A']*(1-am[:,:,None])+generated['A']*am[:,:,None]).astype('uint8')
clean['A'][keepA]=raw['A'][keepA]
# The old front plate also occluded part of the near thumb. Preserve the newly
# authored local near hand with the repaired thigh, at its unchanged window
# coordinates; no fitted hand or arm, no whole-body redraw. Use this actual new
# hand silhouette, rather than mistakenly preserving the old plate as a thumb.
hands['A'][:,595:]=False
new_hand=poly([(631,684),(682,684),(677,699),(673,715),(675,727),(678,739),(680,750),(680,760),(677,768),(672,776),(666,788),(658,794),(651,794),(646,798),(640,799),(634,798),(630,799),(626,796),(621,790),(617,783),(617,774),(611,769),(608,764),(606,759),(606,750),(606,742),(605,732),(609,724),(614,715),(619,707),(625,700)])
hands['A'] |= np.array(new_hand)>0
restore_masks['A']=np.maximum(am,fm.astype(float))
# B: old near dumbbell had hidden the far forearm. Its entire silhouette is
# replaced locally; the surrounding full model and original hands are untouched.
bp=poly([(279,237),(311,228),(365,229),(394,241),(405,260),(405,298),(397,340),(386,375),(278,375)])
ba=np.array(bp.filter(ImageFilter.GaussianBlur(2))).astype(float)/255
ba=np.maximum(ba,(np.array(bp)>0).astype(float))
keepB=np.array(Image.fromarray(hands['B'].astype('uint8')*255).filter(ImageFilter.MaxFilter(3)))>0
ba[keepB]=0
clean['B']=np.rint(clean['B']*(1-ba[:,:,None])+generated['B']*ba[:,:,None]).astype('uint8')
clean['B'][220:390,60:190]=0
restore_masks['B']=np.maximum(restore_masks['B'],ba)
for n,ms in [('A',am),('B',ba)]:
    Image.fromarray(np.rint(ms*255).astype('uint8')).save(O/f'{n}-generated-insert-alpha.png')
    Image.fromarray(generated[n]).save(O/f'{n}-generated-source-native-coordinates.png')

roles={
 'A':{'primary':[], 'secondary':[
   [(553,408),(578,415),(610,417),(632,433),(638,458),(629,486),(613,502),(619,527),(609,551),(608,581),(586,609),(570,594),(561,558),(551,518),(543,478),(541,443)],
   [(777,364),(786,373),(781,402),(768,430),(745,453),(720,472),(708,470),(724,441),(745,413),(760,386)]]},
 'B':{'primary':[
   [(775,351),(793,368),(788,410),(771,455),(749,489),(726,516),(717,512),(733,476),(747,433),(755,394)]],
      'secondary':[
   [(553,408),(582,416),(611,419),(633,434),(646,454),(641,480),(624,502),(620,530),(605,555),(609,582),(584,615),(568,593),(560,555),(552,516),(544,477),(542,440)],
   [(572,312),(608,318),(649,322),(694,321),(718,327),(710,340),(680,345),(641,342),(605,334),(579,329)]]}
}

# Colour boundaries follow the existing visible anatomical surfaces. Smooth the
# traced mask perimeter, not body geometry; no new spatial shading gradient.
roles['A']['secondary']=[
 [(546,411),(542,429),(545,456),(549,479),(551,501),(558,527),(563,553),(568,584),(575,609),(581,617),(591,602),(598,578),(602,553),(607,528),(613,504),(625,483),(634,459),(627,439),(611,426),(586,416),(560,411)],
 [(781,367),(794,380),(792,398),(782,420),(765,439),(743,458),(719,475),(728,444),(745,423),(756,401),(767,379)]]
roles['B']['secondary']=[roles['A']['secondary'][0],
 [(607,318),(638,321),(673,322),(700,319),(725,326),(740,334),(719,343),(694,346),(663,341),(639,335),(615,330)]]
roles['B']['primary']=[[(781,354),(793,365),(793,386),(784,416),(769,446),(749,475),(727,496),(737,463),(748,430),(754,398),(764,375)]]

def muscle_poly(points):
    pts=np.array(points,float);curve=[]
    for i in range(len(pts)):
        p0,p1,p2,p3=[pts[j%len(pts)] for j in [i-1,i,i+1,i+2]]
        for t in np.linspace(0,1,8,endpoint=False):
            curve.append(tuple((.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))*4))
    m=Image.new('L',(size[0]*4,size[1]*4));ImageDraw.Draw(m).polygon(curve,fill=255)
    return np.array(m.resize(size,Image.Resampling.LANCZOS)).astype(float)/255
toned={};masks={};summary={}
for n,a in clean.items():
    rgb=a.astype(float);mx=rgb.max(2);mn=rgb.min(2)
    scope=np.zeros((1536,1024),bool);scope[220:820,150:815]=True
    violet=(rgb[:,:,2]-np.minimum(rgb[:,:,0],rgb[:,:,1])>3)&(mx>65)&scope
    t=a.copy();t[violet]=np.repeat(mx[:,:,None],3,2)[violet].astype('uint8')
    masks[n]={}
    for role,target in [('primary',(123,114,233)),('secondary',(149,144,224))]:
        field=np.zeros((1536,1024),float)
        for p in roles[n][role]:field=np.maximum(field,muscle_poly(p))
        ms=field>.5
        # Actual source contours define region boundaries; no texture or muscle
        # lines are generated. Source maximum supplies the original shade.
        ms &= mx>90
        # Restrained secondary tint; the target base stays exact while source
        # grey rendering remains visible. A two-pixel mask edge is colour-only.
        amount=(1 if role=='primary' else .48)*field*(mx>90)
        support=amount>0
        tint=mx[:,:,None]*(1-amount[:,:,None]*(1-np.array(target)/255))
        t[support]=np.rint(tint[support]).astype('uint8');masks[n][role]=ms
        Image.fromarray(ms.astype('uint8')*255).save(O/f'{n}-{role}-mask.png')
    toned[n]=t
    Image.fromarray(t).save(O/f'{n}-athlete-colour.png')
    Image.fromarray(clean[n]).save(O/f'{n}-equipment-removed.png')
    Image.fromarray(np.rint(restore_masks[n]*255).astype('uint8')).save(O/f'{n}-restoration-alpha.png')
    Image.fromarray(hands[n].astype('uint8')*255).save(O/f'{n}-hands-occlusion.png')
    summary[n]={'sourceSha256':sha(I/f'{n}.png'),'equipmentRemovalOrRestorationChangedPixels':int(np.any(clean[n]!=raw[n],2).sum()),
                'primaryPixels':int(masks[n]['primary'].sum()),'secondaryPixels':int(masks[n]['secondary'].sum()),
                'headExact':bool(np.array_equal(t[0:215,540:735],raw[n][0:215,540:735])),
                'trainersExact':bool(np.array_equal(t[1240:1536],raw[n][1240:1536]))}
    assert summary[n]['headExact'] and summary[n]['trainersExact']

from importlib.machinery import SourceFileLoader
equipment=SourceFileLoader('pulldown_equipment',str(P/'equipment.py')).load_module()

def stable_write(z,name,data,compress=zipfile.ZIP_DEFLATED):
    info=zipfile.ZipInfo(name,(2026,10,16,0,0,0));info.compress_type=compress;z.writestr(info,data)

def ora(path,layers,merged):
    root=ET.Element('image',{'version':'0.0.3','w':str(canvas[0]),'h':str(canvas[1]),'name':path.stem});stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w') as z:
        stable_write(z,'mimetype','image/openraster',zipfile.ZIP_STORED)
        for i,(title,im) in enumerate(reversed(layers)):
            rel=f'data/layer{i}.png';bio=BytesIO();im.save(bio,format='PNG')
            stable_write(z,rel,bio.getvalue());ET.SubElement(stack,'layer',{'name':title,'src':rel,'opacity':'1.0','visibility':'visible','composite-op':'svg:src-over','x':'0','y':'0'})
        stable_write(z,'stack.xml',ET.tostring(root));bio=BytesIO();merged.save(bio,format='PNG');stable_write(z,'mergedimage.png',bio.getvalue())

for n in ['A','B']:
    eq,state=equipment.render(n,pad,canvas,hands[n])
    athlete=Image.new('RGBA',canvas);athlete.paste(Image.fromarray(toned[n]).convert('RGBA'),pad)
    background=Image.new('RGBA',canvas,(0,0,0,255))
    # Black source background is transparent only in the athlete layer.
    aa=np.array(athlete);aa[np.max(aa[:,:,:3],2)<=2,3]=0;athlete=Image.fromarray(aa)
    final=Image.alpha_composite(Image.alpha_composite(background,athlete),eq)
    final.save(O/f'{n}-native.png');eq.save(O/f'{n}-equipment.png')
    ora(O/f'{n}-native.ora',[('Black background',background),('Native athlete with documented source restoration and palette',athlete),('Independent cable circuits and handles; reviewed hand silhouettes foreground',eq)],final)
    summary[n]['mechanics']=state
    final.crop((pad[0]+330,pad[1]+650,pad[0]+790,pad[1]+900) if n=='A' else (pad[0]+60,pad[1]+215,pad[0]+545,pad[1]+400)).save(O/f'{n}-contacts-native.png')
    final.crop((pad[0]+530,pad[1]+350,pad[0]+815,pad[1]+680)).save(O/f'{n}-flank-native.png')
(C/'native-build-evidence.json').write_text(json.dumps({'status':'native-review-pending','sourceSize':size,'canvas':canvas,'integerPadding':pad,'sourceScale':1,'states':summary,'anatomicalTransforms':0,'newImageRequests':3,'selectedNewSourceImages':2,'rejectedSquareOutput':{'size':[1254,1254],'reason':'Service changed the requested1024 square canvas; not fitted or inserted.'},'calibratedHumanCamera':False,'equipment':'Custom illustrative twin high pulley towers, two independent 1:1 circuits with finite sheave tangencies and constant full cable paths. Pixel dimensions are not recovered human measurements or a stock-machine replica.','restoration':'New locally authored missing forearm/thigh pixels at documented native crop coordinates after exact whole-window2x undo. Local A near hand restored together with the occluded thigh at unchanged crop coordinates; original A far hand and B hands retained. Exposed heads/trainers byte exact. No fitted or warped limbs.','palette':{'primary':'#7B72E9','secondary':'#9590E0'},'primaryOcclusion':'Source A lowered near arm occludes the latissimus surface; no false lat highlight painted onto that arm.','strictCertified':False,'completionCredit':False},indent=2)+'\n')
print(json.dumps({'built':str(O),'states':summary}))
