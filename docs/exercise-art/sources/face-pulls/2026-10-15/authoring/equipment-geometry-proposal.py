"""Review-only equipment redraw. No anatomical edits or release claims."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import json
import math
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent
SOURCE = OUT.parent
SCALE = 4
PINS = {
    "1-master.png": "30c17a6d7c4416cb908d6f87ac5fb754bb45cb86116844a953893b761f48f8aa",
    "4-rope-rejected.png": "eb07393aa9a70788874b70bfc48cdab5de143798082cc300d627fd3aeea7c628",
}

def digest(path):
    return sha256(path.read_bytes()).hexdigest()

def png_bytes(im):
    b = BytesIO(); im.save(b, format="PNG"); return b.getvalue()

def curved(points):
    """Closed Catmull-Rom equipment contour from explicitly placed controls."""
    result=[]
    for i in range(len(points)):
        p0=np.array(points[(i-1)%len(points)],float)
        p1=np.array(points[i],float)
        p2=np.array(points[(i+1)%len(points)],float)
        p3=np.array(points[(i+2)%len(points)],float)
        for t in np.linspace(0,1,12,endpoint=False):
            q=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
            result.append(q.tolist())
    return result

def handle(canvas, terminal, inner, occluded_terminal=False):
    p=np.array(terminal,float); q=np.array(inner,float)
    u=q-p; length=float(np.linalg.norm(u)); u/=length
    v=np.array([-u[1],u[0]])
    draw=ImageDraw.Draw(canvas)
    def projected(points):
        return [tuple((p+u*x+v*y)*SCALE) for x,y in points]
    def polygon(points,fill,outline=None):
        pts=projected(points); draw.polygon(pts,fill=fill)
        if outline: draw.line(pts+[pts[0]], fill=outline,width=SCALE,joint="curve")
    def ellipse(cx,rx,ry,fill,outline):
        points=[(cx+rx*math.cos(t),ry*math.sin(t)) for t in np.linspace(0,2*math.pi,100,endpoint=False)]
        polygon(points,fill,outline)
    # Solid source-compatible neutral rubber tones, no invented gradient.
    # The photographed construction is re-illustrated, not pasted or claimed
    # as an exact LMX2315 model/size replica.
    rubber=(35,35,35,255); rim=(70,70,70,255); edge=(54,54,54,255)
    if not occluded_terminal:
        polygon([(0,-8),(length,-8),(length,8),(0,8)],rubber,edge)
        palm=curved([(-8,-24),(-25,-25),(-31,-12),(-30,7),(-20,21),(-4,25),(9,21),(13,14),(8,5),(8,-4),(13,-13),(7,-21)])
        polygon(palm,rubber,rim)
        # Shallow finger scallops distinguish the ergonomic grip's neck.
        for x in np.linspace(14,max(15,length-23),3):
            draw.line(projected([(x,-7),(x-1,-4)]),fill=edge,width=SCALE)
    # A flanged cable end covers the old sphere footprint. In the far start
    # only this evidenced inner end is rendered; no new visible free end.
    ellipse(length,17,21,rubber,rim)
    draw.line(projected([(length-10,-13),(length+9,-10)]), fill=edge,width=SCALE)
    return {"terminalApprox":terminal,"innerFlangeApprox":inner,"projectedBetweenEndCentersPx":length,"farTerminalOmittedAsOccluded":occluded_terminal}

def ora(path,base,equipment,merged):
    root=Element("image",w=str(base.width),h=str(base.height),name="Face Pull equipment-only ergonomic proposal")
    stack=SubElement(root,"stack")
    for name,src in [("Equipment redraw behind original human contours","data/equipment.png"),("Untouched source athlete and scene","data/original.png")]:
        SubElement(stack,"layer",name=name,src=src,opacity="1.0",visibility="visible",**{"composite-op":"svg:src-over"})
    with zipfile.ZipFile(path,"w") as z:
        z.writestr("mimetype","image/openraster",compress_type=zipfile.ZIP_STORED)
        for name,im in [("data/equipment.png",equipment),("data/original.png",base),("mergedimage.png",merged)]:
            z.writestr(name,png_bytes(im),compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("stack.xml",tostring(root,encoding="utf-8"),compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(path) as z:
        b=Image.open(BytesIO(z.read("data/original.png"))).convert("RGBA")
        e=Image.open(BytesIO(z.read("data/equipment.png"))).convert("RGBA")
        assert np.array_equal(np.array(Image.alpha_composite(b,e)),np.array(merged))
        assert np.array_equal(np.array(Image.open(BytesIO(z.read("mergedimage.png"))).convert("RGBA")),np.array(merged))

OUT.mkdir(exist_ok=True)
results=[]
poses=[
    ("1-master.png","1-start",[((584,344),(606,289),False),((439,318),(469,311),True)]),
    ("4-rope-rejected.png","4-finish",[((88,275),(158,262),False),((339,267),(419,265),False)]),
]
for original,name,handles in poses:
    assert digest(SOURCE/original)==PINS[original]
    base=Image.open(SOURCE/original).convert("RGBA")
    a=np.array(base)
    bright=Image.fromarray(np.uint8(a[:,:,:3].max(2)>110)*255).copy()
    ImageDraw.floodfill(bright,(225,200),128)
    human=Image.fromarray(np.uint8(np.array(bright)==128)*255)
    assert int((np.array(human)>0).sum())>100000
    guard=human.filter(ImageFilter.MaxFilter(9))
    guard.save(OUT/f"{name}-human-contour-guard.png")
    high=Image.new("RGBA",(base.width*SCALE,base.height*SCALE))
    geometry=[handle(high,p,q,hidden) for p,q,hidden in handles]
    layer=high.resize(base.size,Image.Resampling.LANCZOS)
    alpha=np.array(layer.getchannel("A"))
    alpha[np.array(guard)>0]=0
    alpha[alpha<=8]=0
    layer.putalpha(Image.fromarray(alpha))
    layer.save(OUT/f"{name}-equipment-layer.png")
    layer.getchannel("A").save(OUT/f"{name}-equipment-mask.png")
    proposal=Image.alpha_composite(base,layer)
    proposal.save(OUT/f"{name}-ergonomic-proposal.png")
    b=np.array(proposal); changed=np.any(a!=b,axis=2)
    assert not (changed&(np.array(guard)>0)).any()
    assert not (changed&(alpha==0)).any()
    assert np.array_equal(a[:,:,3],b[:,:,3])
    ora(OUT/f"{name}-equipment-editable.ora",base,layer,proposal)
    box=(65,190,665,385)
    original_crop=base.crop(box).resize((1200,390),Image.Resampling.NEAREST)
    changed_crop=proposal.crop(box).resize((1200,390),Image.Resampling.NEAREST)
    proof=Image.new("RGBA",(1200,780));proof.alpha_composite(original_crop);proof.alpha_composite(changed_crop,(0,390))
    proof.save(OUT/f"{name}-hands-original-top-proposal-bottom-2x.png")
    yy,xx=np.where(changed)
    results.append({"pose":name,"source":str(SOURCE/original),"sourceSha256":PINS[original],"humanConnectedBrightPixels":int((np.array(human)>0).sum()),"humanBrightPlus4pxGuardChangedPixels":0,"outsideEquipmentSupportRGBAExact":True,"originalAlphaExact":True,"changedPixels":int(changed.sum()),"changedBoundsExclusive":[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],"equipmentGeometry":geometry,"oraReopenedMergedRGBAExact":True,"sourceStillExact":digest(SOURCE/original)==PINS[original]})

files={p.name:digest(p) for p in OUT.iterdir() if p.is_file() and p.name!="ergonomic-proposal-review.json"}
report={"status":"equipment-only-two-endpoint-proposal-awaiting-root-native-review","manufacturerReference":{"path":str(SOURCE/'lifemaxx-lmx2315-manufacturer-reference.png'),"sha256":digest(SOURCE/'lifemaxx-lmx2315-manufacturer-reference.png'),"page":"https://www.lifemaxx.com/en/lmx2315-lmxr-ergo-tricep-rope.html","observedTopology":"Broad curved terminal palm support, narrower intervening grip with finger scallops, cable-side inner flange, rope continuing toward central connector.","claimLimit":"This neutral-rubber illustrative redraw follows that actual construction topology; it is NOT an exact manufacturer replica, dimension match, brand endorsement or claimed identified source accessory."},"method":"One equipment-only contour model: curved palm support, narrow grip and oval inner flange; projected onto existing stop/hand positions. Solid existing-style neutral grays; no added gradient. Composite is clipped behind the original connected human bright field plus4px contour guard. Original connector, exposed rope branches, pulley, cable and selected/unselected stack coordinates are not moved.","remainingFindings":["Far start outer free-end/palm support is omitted as potentially occluded behind the unchanged fist. Hidden rope ordering is plausible but unproven; root must reject any visibly impossible hand/load contact.","New supports extend into black background and cover original equipment footprints, preserving human pixels. Original dark rubber directly beside fingers within the contour guard remains untouched; inspect for small sphere-outline remnants.","Projected handle lengths/foreshortening vary with the retained source projections; no calibrated3D/strict invariant-hardware claim.","Equipment contour/material rendering is a native review draft. No colour normalization, mobile pass, strict approval, owner acceptance, registration, publication or completion claim."],"poses":results,"files":files}
(OUT/'ergonomic-proposal-review.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({"status":report['status'],"poses":results,"reportSha256":digest(OUT/'ergonomic-proposal-review.json')},indent=2))
