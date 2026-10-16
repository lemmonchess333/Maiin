"""One complete source athlete/held-bar extraction, no anatomical edits.

Only pre-existing lower-body chroma is neutralised using source luminance and
maximum channel. Outside that colour support every retained RGB byte is exact.
Masks are editable extraction boundaries and require native review before use.
"""
from pathlib import Path
from collections import deque
import hashlib,json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
P=Path(__file__).resolve().parent
SRC=P.parent/'originals'
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
expected={2:'c9e9d5359938dfab494dd01d9bbfe6a09d64bd21df669c376fa8bee307579609',3:'b325b7dec503c4c1b2541a636ebc3434791214ac4d6c6e6eb2e6f8ea0db0a046'}
manifest=json.loads((SRC/'accepted-palette-hashes.json').read_bytes())['files']
POLYS={
2:[(470,129),(558,128),(589,166),(589,243),(564,281),(629,313),(686,368),(833,413),(840,457),(797,469),(739,478),(687,447),(614,408),(588,429),(593,463),(637,504),(711,565),(799,620),(844,605),(887,602),(889,641),(850,686),(817,718),(741,718),(712,686),(667,658),(601,603),(529,567),(455,574),(381,580),(332,568),(322,529),(337,447),(355,389),(380,314),(440,255),(465,236),(465,179)],
3:[(308,128),(385,127),(412,164),(408,247),(438,278),(465,342),(474,387),(508,398),(515,430),(475,443),(438,447),(423,463),(472,458),(535,470),(591,500),(656,551),(741,616),(798,619),(848,604),(887,601),(889,641),(850,687),(817,718),(741,718),(710,685),(669,657),(601,606),(548,581),(482,576),(419,579),(352,580),(319,560),(310,522),(298,466),(256,456),(227,438),(224,402),(241,354),(252,304),(275,274),(289,243),(289,179)]
}
BARS={2:[(690,453),(810,422),(831,436),(832,449),(714,479),(690,477)],3:[(357,426),(493,400),(514,411),(514,426),(378,452),(359,450)]}
records=[]
for number in [2,3]:
    original=SRC/f'{number}-original.png';accepted=SRC/f'{number}-accepted-palette.png'
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    assert sha(original)==expected[number] and sha(accepted)==manifest[f'draft/{number}-native.png']
    a=np.array(Image.open(accepted).convert('RGBA'));rgb=a[:,:,:3].astype(float)
    raw=np.array(Image.open(original).convert('RGBA'));r,g,b=raw[:,:,0].astype(float),raw[:,:,1].astype(float),raw[:,:,2].astype(float)
    chroma=(b-r>=3)&(b-g>=6)&(r-g>=1)
    lower=chroma&(np.indices(r.shape)[0]>=435)
    # Preserve original per-pixel tone/contours; no new spatial shade field.
    luminance=.2126*raw[:,:,0]+.7152*raw[:,:,1]+.0722*raw[:,:,2]
    neutral=np.minimum(raw[:,:,:3].max(2),255-(255-luminance)*.12)
    finished=a.copy();finished[lower,:3]=np.rint(neutral[lower,None]).astype('uint8')
    assert np.array_equal(finished[~lower],a[~lower])
    boundary=Image.new('L',(1536,1024));ImageDraw.Draw(boundary).polygon(POLYS[number],fill=255)
    # Wider upper-body ROI restores original waist/forearm pixels clipped by
    # the first loose polygon; no body coordinate or source RGB is changed.
    bd=ImageDraw.Draw(boundary)
    bd.rectangle((300,125,845,573) if number==2 else (215,125,755,640),fill=255)
    bd.rectangle((710,590,920,725),fill=255)
    roi=np.array(boundary)>0
    seed=roi&((raw[:,:,:3].max(2)>=165)|chroma)
    seed=np.array(Image.fromarray((seed*255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)))>0
    # Keep actual large connected athlete regions before dilation; the first
    # version's dilation joined isolated old machine highlights to the shoes.
    seen=np.zeros(seed.shape,bool);kept=np.zeros(seed.shape,bool)
    for sy,sx in np.argwhere(seed):
        if seen[sy,sx]:continue
        queue=deque([(int(sy),int(sx))]);seen[sy,sx]=True;component=[]
        while queue:
            y,x=queue.popleft();component.append((y,x))
            for yy,xx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
                if 0<=yy<1024 and 0<=xx<1536 and seed[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;queue.append((yy,xx))
        if len(component)>=3000:
            yy,xx=np.array(component).T;kept[yy,xx]=True
    seed=Image.fromarray((kept*255).astype('uint8')).filter(ImageFilter.MaxFilter(5))
    filled=seed.copy();ImageDraw.floodfill(filled,(0,0),128)
    matte=np.array(filled)!=128
    # Restore real large black spaces between intact limbs. Thin source ink
    # stays intact; only regions with a >=7px black interior seed are removed.
    black=(raw[:,:,:3].max(2)<25)&matte
    deep=np.array(Image.fromarray((black*255).astype('uint8')).filter(ImageFilter.MinFilter(7)))>0
    visited=np.zeros(black.shape,bool);void=np.zeros(black.shape,bool)
    for sy,sx in np.argwhere(deep)[::12]:
        if visited[sy,sx]:continue
        queue=deque([(int(sy),int(sx))]);visited[sy,sx]=True
        while queue:
            y,x=queue.popleft();void[y,x]=True
            for yy,xx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
                if 0<=yy<1024 and 0<=xx<1536 and black[yy,xx] and not visited[yy,xx]:visited[yy,xx]=True;queue.append((yy,xx))
    matte&=~void
    bar=Image.new('L',(1536,1024));ImageDraw.Draw(bar).polygon(BARS[number],fill=255)
    matte|=np.array(bar)>0
    matte&=roi
    # Preserve the source's real flexible foot straps, including their dark
    # interiors. These are equipment pixels in each intact source, not grafts.
    straps=Image.new('L',(1536,1024));sd=ImageDraw.Draw(straps)
    for polygon in [[(803,635),(824,640),(812,658),(804,681),(803,702),(796,710),(782,708),(776,700),(776,684),(783,658),(790,643)],[(839,623),(854,624),(844,631),(838,639),(820,642),(822,634),(830,626)]]:sd.polygon(polygon,fill=255)
    matte|=np.array(straps)>0
    # Remove only the obsolete rope beyond the retained held attachment.
    end=827 if number==2 else 502
    if number==2:matte[442:466,end+1:]=False
    if number==3:matte[412:442,end+1:]=False
    layer=finished.copy();layer[:,:,3]=np.where(matte,255,0).astype('uint8')
    label='A' if number==2 else 'B'
    Image.fromarray(layer).save(OUT/f'{label}-whole-athlete-and-bar.png')
    Image.fromarray((matte*255).astype('uint8')).save(OUT/f'{label}-extraction-mask.png')
    Image.fromarray((lower*255).astype('uint8')).save(OUT/f'{label}-lower-source-colour-support.png')
    Image.fromarray(finished).save(OUT/f'{label}-whole-source-colour-proof.png')
    background=Image.new('RGBA',(1536,1024),(0,0,0,255));background=Image.alpha_composite(background,Image.fromarray(layer));background.save(OUT/f'{label}-native-extraction-review.png')
    assert np.array_equal(layer[matte&~lower,:3],a[matte&~lower,:3])
    records.append({'label':label,'originalSource':str(original),'originalSourceSha256':sha(original),'acceptedRowingNative':str(accepted),'acceptedRowingNativeSha256':sha(accepted),'sourceNativeSize':[1536,1024],'wholeSceneScale':1,'wholeSceneTranslation':[0,0],'localBodyTransforms':0,'neutralizationSupportPixels':int(lower.sum()),'retainedSourcePixels':int(matte.sum()),'retainedNeutralAndUpperColourRgbExact':True,'lowerNeutralization':'min(originalMaximum, 255 - (255-originalLuminance)*0.12), pixelwise only, within existing source lower-body chroma. Not claimed recovered pre-tint pixels.','outlinePolygon':POLYS[number],'retainedHeldAttachmentPolygon':BARS[number],'nativeMaskReviewRequired':True})
value={'status':'editable-whole-athlete-mask-and-palette-draft-awaiting-native-review','exerciseId':'seated-row','variation':'Controlled torso-hinge seated cable row','sourcePoses':records,'humanRescaleWarpOrGraft':False,'newNeutralAnatomyPainted':False,'newImageRequests':0,'sourceOriginalsUnchanged':True,'productionEligible':False,'completionCredit':False}
with (OUT/'extraction-proof.json').open('x',encoding='utf8') as f:json.dump(value,f,indent=2)
print(json.dumps({'output':str(OUT),'retainedPixels':[x['retainedSourcePixels'] for x in records],'lowerColourPixels':[x['neutralizationSupportPixels'] for x in records],'nativeReviewRequired':True}))
