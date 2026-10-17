from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parent
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
frame=Image.open(ROOT/'final-frames/3.webp').convert('RGBA')
framed=Image.open(ROOT/'1-framed.png').convert('RGBA')
prepared=Image.open(ROOT/'prepared-card-source.png').convert('RGBA')
card=Image.open(ROOT/'card-cutout.webp').convert('RGBA')
arr=np.asarray(frame).copy(); actual=np.asarray(prepared)
h,w=arr.shape[:2]

def square_filter(mask, radius, maximum):
    edge=not maximum
    pad=np.pad(mask,((0,0),(radius,radius)),constant_values=edge)
    op=np.logical_or if maximum else np.logical_and
    out=np.full_like(mask,edge)
    for d in range(2*radius+1): out=op(out,pad[:,d:d+w])
    pad=np.pad(out,((radius,radius),(0,0)),constant_values=edge)
    result=np.full_like(mask,edge)
    for d in range(2*radius+1): result=op(result,pad[d:d+h,:])
    return result

dark=np.max(arr[:,:,:3],axis=2)<=14
eroded=square_filter(dark,3,False)
try:
    from scipy.ndimage import label
    labels, n=label(eroded)
    counts=np.bincount(labels.ravel()); counts[0]=0
    keep=counts[labels]>=1200
except ImportError:
    keep=np.zeros_like(eroded); seen=np.zeros_like(eroded)
    for sy,sx in np.argwhere(eroded):
        if seen[sy,sx]: continue
        stack=[(sy,sx)]; region=[]; seen[sy,sx]=True
        while stack:
            y,x=stack.pop();region.append((y,x))
            for yy,xx in ((y,x-1),(y,x+1),(y-1,x),(y+1,x)):
                if 0<=yy<h and 0<=xx<w and eroded[yy,xx] and not seen[yy,xx]:
                    seen[yy,xx]=True;stack.append((yy,xx))
        if len(region)>=1200:
            for yy,xx in region:keep[yy,xx]=True
near=square_filter(keep,4,True)
lum=np.max(arr[:,:,:3],axis=2)
alpha=np.where(lum<=14,0,np.minimum(255,np.floor((lum.astype(float)-14)*255/34+0.5))).astype('uint8')
arr[:,:,3]=np.where(near,alpha,255)
standard=arr.copy()
bright=lum>110
closed=square_filter(square_filter(bright,1,True),1,False)
retained=square_filter(closed,2,True)
arr[810:,:,3]=np.where(retained[810:],arr[810:,:,3],0)
alpha_changed=actual[:,:,3]!=standard[:,:,3]
ys,xs=np.where(alpha_changed)
alpha_bbox=None if not len(ys) else [int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]
visible=actual[:,:,3]>8
vy,vx=np.where(visible)
pad=round(max(int(vx.max()-vx.min()),int(vy.max()-vy.min()))*.04)
box=[max(0,int(vx.min())-pad),max(0,int(vy.min())-pad),min(w,int(vx.max())+pad+1),min(h,int(vy.max())+pad+1)]

diagnostics=[]
for name,bg in [('white',(255,255,255,255)),('dark-card',(23,23,27,255))]:
    for tag,img in [('prepared',prepared),('cutout',card)]:
        canvas=Image.new('RGBA',img.size,bg);canvas.alpha_composite(img)
        path=ROOT/f'prepared-card-review-{tag}-{name}.png'
        canvas.convert('RGB').save(path)
        diagnostics.append({'path':str(path),'sha256':sha(path),'purpose':'Review-only alpha composite; no production image modification.'})
    # Review small card display at 160px height with the same aspect ratio.
    thumb=card.resize((round(card.width*160/card.height),160),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(200,180),bg);canvas.alpha_composite(thumb,((200-thumb.width)//2,10))
    path=ROOT/f'prepared-card-review-160px-{name}.png';canvas.convert('RGB').save(path)
    diagnostics.append({'path':str(path),'sha256':sha(path),'purpose':'Review-only approximation of h-40 card display; actual integrated CUA review remains pending.'})

result={
  'status':'independent-prepared-card-review-passed-integrated-mobile-pending',
  'reviewer':'pullup_source_rescue independent reviewer',
  'scope':'Read-only review; only diagnostics and this report are written outside repo/public. No image/card/source edits.',
  'hashes':{str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'final-frames/3.webp',ROOT/'1-framed.png',ROOT/'prepared-card-source.png',ROOT/'card-cutout.webp',ROOT/'card-cutout-before-floor-cleanup.webp',ROOT/'stage-prepared-card.mts',ROOT/'staged-card-provenance.json']},
  'sourceDimensions':[w,h], 'cardDimensions':list(card.size),
  'proof':{
    'frame3DecodedExactlyMatchesFramedPNG':bool(np.array_equal(np.asarray(frame),np.asarray(framed))),
    'preparedRGBExactlyMatchesFrame3':bool(np.array_equal(actual[:,:,:3],np.asarray(frame)[:,:,:3])),
    'preparedMatchesIndependentlyReproducedAlphaOnlyCorrection':bool(np.array_equal(actual,arr)),
    'upperBodyAndBellAlphaAboveY810ExactlyStandardKey':bool(np.array_equal(actual[:810,:,3],standard[:810,:,3])),
    'alphaChangeCount':int(alpha_changed.sum()),
    'alphaChangeBoundingBoxInclusive':alpha_bbox,
    'alphaOnlyReducedNotIncreased':bool(np.all(actual[:,:,3]<=standard[:,:,3])),
    'allBrightOriginalRGBPixelsRetainedFullyOpaque':bool(np.all(actual[:,:,3][bright]==255)),
    'brightOriginalRGBPixelCount':int(bright.sum()),
    'lowerBrightPixelCount':int(bright[810:].sum()),
    'lowerBrightOriginalPixelsRemoved':int(np.count_nonzero(actual[810:,:,3][bright[810:]]!=255)),
    'lowerTwoPixelGrownSeedRegionExactlyRetainsStandardAlpha':bool(np.array_equal(actual[810:,:,3][retained[810:]],standard[810:,:,3][retained[810:]])),
    'paddedNativeExtractionBoxExclusive':box,
    'cardRGBPixelEqualityNotClaimed':'307x480 card is Lanczos-downscaled and lossy WebP quality82/alpha90; RGB exactness is established at the native prepared PNG, not the resized card.'
  },
  'visualReview':{
    'method':'view_image at original dimensions on prepared native source, current card, original pre-cleanup card, source 1-framed.png, white and #17171B composites, and 160px-height review composites.',
    'fullLowerLegsAndTrainers':{'passed':True,'evidence':'Both calves/ankles, full near and far trainers, heels, toe caps and outsole contours remain intact at native 690x1008 and card 307x480. No missing leg section or visible silhouette notch at the y810 transition. The cleanup retains a thin inherited dark shoe outline; it does not redraw a shoe.'},
    'lightCardAppearance':{'passed':True,'evidence':'On white, the full canonical no-shorts figure, hands/handle and bell are readable. The previous broad black floor slab is absent. Fine grey anatomical shading and trainer details remain visible. The light upper-body standard-key edge is thin at native size and does not form a material background patch in the 307x480 or 160px-height views.'},
    'darkCardAppearance':{'passed':True,'evidence':'On actual dark-card #17171B, the pale body, purple fields, complete white trainers and ordinary dark bell retain their outlines. No slab or residual floor shadow is visible. The dark bell has naturally lower contrast than the body but remains recognizable with its inherited metallic highlights; this correction leaves its alpha unchanged.'},
    'noHumanAnatomyOrPoseChanged':{'passed':True,'evidence':'Exact native RGB equality plus unchanged upper alpha and native light/dark visual inspection show no reshaped body, new clothing, changed pose, limb graft, or new trainer contour. The modification reduces background alpha only. Lower dark outline retention is also visually checked rather than inferred from the bright-pixel statistic alone.'},
    'reviewOnly160pxDisplay':{'passed':True,'evidence':'At approximately the staged h-40 card display, both trainers and the entire figure remain visible on white and dark-card backgrounds. These local composites supplement rather than replace root actual integrated mobile review.'}
  },
  'diagnostics':diagnostics,
  'limitations':['Bright-pixel retention is a preservation check, not alone proof that every dark contour is part of anatomy. Native light/dark inspection is separately required.','Actual application mobile light/dark card review belongs to root.']
}
(ROOT/'prepared-card-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'proof':result['proof'],'diagnosticCount':len(diagnostics)},indent=2))
