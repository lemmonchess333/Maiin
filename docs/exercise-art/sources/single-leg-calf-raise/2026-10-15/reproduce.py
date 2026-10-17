"""Portable intact Single-Leg Calf Raise candidate: two native endpoints.

Only an integer whole-scene placement and existing-colour remap are authored.
Defaults resolve adjacent originals; --source1/--source3 permit explicit inputs.
--build writes candidate files under --output-dir; --verify reads them only.
Requires Pillow and NumPy. No repository, registration, UI, or test commands.
"""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import argparse
import json
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring
import numpy as np
from PIL import Image, ImageDraw, __version__ as pillow_version

HERE = Path(__file__).resolve().parent
ORDER = [1, 1, 3, 3, 1, 1]
RAW = {1: "fbebd81cfce565ab461ccf22279a7c109d3131fe0bb2358512de271904e0e558",
       3: "23a5180acd41518fca84b0bd1334f633da3f4c0da6fce32c483e7c4e144522b2"}
P = np.array([123, 114, 233], dtype=float)
S = np.array([149, 144, 224], dtype=float)
# Semantic role traces follow the visible dark border of the original
# gastrocnemius belly. They label existing source chroma, never add anatomy.
PRIMARY = {
  1: [(454,875),(460,896),(466,920),(470,945),(470,965),(462,984),
      (456,999),(449,1017),(445,1027),(442,1015),(437,1002),(427,992),
      (420,979),(415,961),(413,944),(414,924),(421,904),(433,890)],
  3: [(463,779),(469,793),(475,814),(479,838),(479,862),(475,885),
      (468,900),(460,917),(455,931),(453,923),(446,917),(436,904),
      (428,889),(424,873),(424,850),(429,828),(439,807),(452,791)],
}
ROI = {1: (405,870,480,1096), 3: (415,775,490,985)}

def digest(path): return sha256(path.read_bytes()).hexdigest()
def pix(im): return sha256(im.convert("RGBA").tobytes()).hexdigest()
def opened(path): return Image.open(path).convert("RGBA")
def png(im):
    b=BytesIO(); im.save(b, format="PNG"); return b.getvalue()
def save_json(path, value): path.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")

def write_manifest(root):
    paths=[]
    for directory in ["draft","originals","history"]:
        paths += [p for p in (root/directory).rglob("*") if p.is_file()]
    paths += [root/name for name in ["reproduce.py","sequence-plan.json","editables-proof.json","source-provenance.json","README.md"] if (root/name).is_file()]
    save_json(root/"asset-hashes.json",{"status":"candidate-integrity-not-acceptance","files":{p.relative_to(root).as_posix():digest(p) for p in sorted(paths)}})

def colour_finish(original, pose):
    a=np.array(original); rgb=a[:,:,:3].astype(float)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    region=np.zeros(a.shape[:2],bool)
    x1,y1,x2,y2=ROI[pose];region[y1:y2,x1:x2]=True
    support=region & (b-r>=2) & (b-g>=3) & (r-g>=-2)
    # Antialias the semantic role boundary by one native pixel. No new
    # field, spatial shading function, saturation threshold split or gradient.
    field=Image.new("L",(original.width*4,original.height*4),0)
    ImageDraw.Draw(field).polygon([(x*4,y*4) for x,y in PRIMARY[pose]],fill=255)
    field=field.resize(original.size,Image.Resampling.LANCZOS)
    weight=np.array(field,dtype=float)/255
    weight[~support]=0
    maximum=rgb.max(2)
    chroma=(maximum-g)/np.maximum(maximum,1)
    # Existing colour strength and source maximum drive every output pixel.
    # Distinct native light soleus fields have a different source tint range.
    amount_p=np.minimum(chroma/.92,1)
    amount_s=np.minimum(chroma/.42,1)
    neutral=maximum[:,:,None]
    pc=neutral+(P[None,None,:]*maximum[:,:,None]/255-neutral)*amount_p[:,:,None]
    sc=neutral+(S[None,None,:]*maximum[:,:,None]/255-neutral)*amount_s[:,:,None]
    result=pc*weight[:,:,None]+sc*(1-weight[:,:,None])
    edited=a.copy();edited[support,:3]=np.rint(np.clip(result[support],0,255)).astype(np.uint8)
    changed=np.any(edited!=a,axis=2)
    assert not (changed & ~support).any()
    assert np.array_equal(edited[:,:,3],a[:,:,3])
    layer=np.zeros_like(a);layer[support]=edited[support];layer[support,3]=255
    composite=Image.alpha_composite(original,Image.fromarray(layer))
    assert pix(composite)==pix(Image.fromarray(edited))
    return composite,Image.fromarray(layer),Image.fromarray((support*255).astype(np.uint8)),field,{
      "sourceChromaPixels":int(support.sum()),"changedRgbPixels":int(changed.sum()),
      "outsideSourceColourRGBAExact":True,"originalAlphaExact":True,
      "neutralPixelsOutsideExistingChromaExact":True,
      "roleTraceNative":PRIMARY[pose],"sourceColourROI":ROI[pose],
      "sourceTintStrengthDenominators":{"primary":.92,"secondary":.42},
      "limits":"Palette finishing preserves original field contours/neutral RGB; it does not recover an uncoloured original. Semantic role trace is explicitly editable and requires native visual review."
    }

def placed(im, pose):
    if pose==1:return im.copy()
    out=Image.new("RGBA",im.size,(0,0,0,255));out.paste(im,(0,32));return out
def placed_layer(im, pose):
    if pose==1:return im.copy()
    out=Image.new("RGBA",im.size,(0,0,0,0));out.paste(im,(0,32));return out

def ora(path, source, colour, merged):
    doc=Element("image",w=str(merged.width),h=str(merged.height),name="Single-Leg Calf Raise intact two-endpoint candidate")
    stack=SubElement(doc,"stack")
    for role,label in [("colour","Existing calf/soleus fields: palette only"),("source","Intact source: whole-scene placement only")]:
        SubElement(stack,"layer",name=label,src=f"data/{role}.png",opacity="1.0",visibility="visible",**{"composite-op":"svg:src-over"})
    with zipfile.ZipFile(path,"w") as z:
        for name,data,compression in [("mimetype",b"image/openraster",zipfile.ZIP_STORED),("stack.xml",tostring(doc,encoding="utf-8"),zipfile.ZIP_DEFLATED),("data/source.png",png(source),zipfile.ZIP_DEFLATED),("data/colour.png",png(colour),zipfile.ZIP_DEFLATED),("mergedimage.png",png(merged),zipfile.ZIP_DEFLATED)]:
            info=zipfile.ZipInfo(name,(2026,10,15,0,0,0));info.compress_type=compression;z.writestr(info,data)
    verify_ora(path,merged)
def verify_ora(path, expected):
    with zipfile.ZipFile(path) as z:
        s=opened(BytesIO(z.read("data/source.png")));c=opened(BytesIO(z.read("data/colour.png")))
        assert pix(Image.alpha_composite(s,c))==pix(expected),str(path)
        assert pix(opened(BytesIO(z.read("mergedimage.png"))))==pix(expected)

def run(args):
    root=args.output_dir.resolve();originals={1:args.source1.resolve(),3:args.source3.resolve()}
    assert all(digest(path)==RAW[pose] for pose,path in originals.items())
    if args.build:
        for name in ["draft","draft/frames","draft/layers"]:(root/name).mkdir(parents=True,exist_ok=True)
    d=root/"draft";full={};native={};layers={};proof=[]
    for pose,path in originals.items():
        original=opened(path);assert original.size==(1024,1536)
        finish,layer,support,primary,details=colour_finish(original,pose)
        native[pose]=placed(original,pose);layers[pose]=placed_layer(layer,pose);full[pose]=placed(finish,pose)
        assert pix(Image.alpha_composite(native[pose],layers[pose]))==pix(full[pose])
        if pose==3:
            src=np.array(original);reg=np.array(native[pose]);assert np.array_equal(reg[32:],src[:-32])
            assert src[-32:,:,:3].max()<=2
        if args.build:
            full[pose].save(d/f"{pose}-full.png");native[pose].save(d/f"{pose}-registered-source.png")
            layers[pose].save(d/"layers"/f"{pose}-colour.png")
            support.save(d/"layers"/f"{pose}-source-colour-support-native.png")
            primary.save(d/"layers"/f"{pose}-primary-role-native.png")
        proof.append({"pose":pose,"sourceSha256":RAW[pose],"wholeSceneTranslation":[0,0 if pose==1 else 32],"sourceMappedRGBAExact":True,"equipmentEdited":False,"colour":details})
    mask=np.zeros((1536,1024),bool)
    for im in full.values():mask|=np.array(im)[:,:,:3].max(2)>2
    yy,xx=np.where(mask);crop=(max(0,int(xx.min())-24),max(0,int(yy.min())-24),min(1024,int(xx.max())+25),min(1536,int(yy.max())+25))
    framed={}
    for pose in ORDER:
        if pose in framed:continue
        framed[pose]=full[pose].crop(crop)
        a=np.array(full[pose]);outside=np.ones(a.shape[:2],bool);outside[crop[1]:crop[3],crop[0]:crop[2]]=False
        maximum=int(a[:,:,:3][outside].max()) if outside.any() else 0
        assert maximum<=2
        if args.build:
            framed[pose].save(d/f"{pose}-framed.png")
            ora(d/f"{pose}-full.ora",native[pose],layers[pose],full[pose])
            ora(d/f"{pose}-framed.ora",native[pose].crop(crop),layers[pose].crop(crop),framed[pose])
        else:
            assert pix(opened(d/f"{pose}-full.png"))==pix(full[pose])
            assert pix(opened(d/f"{pose}-framed.png"))==pix(framed[pose])
            verify_ora(d/f"{pose}-full.ora",full[pose]);verify_ora(d/f"{pose}-framed.ora",framed[pose])
    frame_rows=[]
    encoded={}
    for i,pose in enumerate(ORDER,1):
        path=d/"frames"/f"{i}.webp"
        if args.build:
            if pose not in encoded:
                out=BytesIO();framed[pose].save(out,format="WEBP",lossless=True,quality=100,method=6,exact=True);encoded[pose]=out.getvalue()
            path.write_bytes(encoded[pose])
        assert pix(opened(path))==pix(framed[pose]);assert b"VP8L" in path.read_bytes()[:40]
        frame_rows.append({"path":f"draft/frames/{i}.webp","sourcePose":pose,"sha256":digest(path),"decodedRGBAExact":True})
    cues=[(0,"Low","Lower heel slightly below the step."),(0,"Brace","Keep your knee straight; balance lightly."),(1,"Top","Rise onto your toes without pulling."),(1,"Hold","Pause tall; squeeze your working calf."),(0,"Lower","Lower slowly through the shown range."),(0,"Reset","Reset below step; keep forefoot planted.")]
    assert all(len(c.split())<=7 for _,_,c in cues)
    plan={"exerciseId":"single-leg-calf-raise","name":"Single-Leg Calf Raise","sourceScope":"Candidate: two intact retained endpoints, whole-source3+32px y registration, existing calf/soleus palette only. No body/equipment edits. Not accepted or registered.","primary":["Calves"],"secondary":["Soleus"],"equipment":"Bodyweight","physicalPoses":2,"sourcePoseOrder":ORDER,"excursionPositions":[0,0,1,1,0,0],"commonCrop":list(crop),"dimensions":list(framed[1].size),"setup":["Stand on one foot on a step's edge, ball of the foot planted, heel hanging free.","Hold a wall or rail for balance only \u2014 don't pull yourself up with it."],"beats":[{"t":t,"label":label,"cue":cue} for t,label,cue in cues],"findingsPendingReview":["Modest pictured below-step heel range, not a deep or maximum stretch claim.","Small inherited posture/contour differences; no established material proportion failure, no claim of exact anatomical identity.","Several-pixel residual original step/rail and hand/forefoot contact differences; not strict1px hardware certification.","Two physical endpoints repeated honestly across six paths; no authored intermediate or continuous trajectory.","Only the source-visible near calf/soleus is coloured; no invented hidden-side muscle geometry."],"frameHashes":{x["path"]:x["sha256"] for x in frame_rows},"releaseApproved":False,"completionCredit":False}
    result={"status":"candidate-pixel-integrity-only-not-native-acceptance","pillowVersion":pillow_version,"dimensions":plan["dimensions"],"commonCrop":list(crop),"physicalPoses":2,"sourcePoseOrder":ORDER,"poses":proof,"frames":frame_rows,"allFourORAsReopenedRGBAExact":True,"commonCropExcludesOnlyRgbAtMost2":True,"newImageRequests":0,"bodyOrEquipmentEdits":0,"repoChanges":0}
    if args.build:
        save_json(root/"sequence-plan.json",plan);save_json(root/"editables-proof.json",result)
        write_manifest(root)
    else:
        manifest=json.loads((root/"asset-hashes.json").read_bytes())
        for name,expected in manifest["files"].items():assert digest(root/name)==expected,name
        assert json.loads((root/"sequence-plan.json").read_bytes())==plan
    print(json.dumps({"mode":"build" if args.build else "verify","dimensions":plan["dimensions"],"crop":list(crop),"frames":len(frame_rows),"physicalPoses":2,"all4OrasReopenedExact":True,"manifestSha256":digest(root/"asset-hashes.json")},indent=2),flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--source1",type=Path,default=HERE/"originals/1.png");p.add_argument("--source3",type=Path,default=HERE/"originals/3-rejected.png");p.add_argument("--output-dir",type=Path,default=HERE);mode=p.add_mutually_exclusive_group(required=True);mode.add_argument("--build",action="store_true");mode.add_argument("--verify",action="store_true");mode.add_argument("--refresh-manifest",action="store_true");args=p.parse_args()
    if args.refresh_manifest:write_manifest(args.output_dir.resolve())
    else:run(args)
