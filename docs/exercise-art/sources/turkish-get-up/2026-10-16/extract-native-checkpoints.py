from pathlib import Path
import hashlib,json
from PIL import Image
P=Path(__file__).resolve().parent;O=P/'native-extraction';O.mkdir(exist_ok=True)
original=P/'six-checkpoint-source-sheet-native.png';correction=P/'kneel-stand-direction-corrected-sheet-native.png'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources={'original':Image.open(original).convert('RGBA'),'correction':Image.open(correction).convert('RGBA')};assert all(im.size==(1536,1024) for im in sources.values())
# Whole native panel registration only. Upward extended lower-row extraction
# preserves the actual bells that begin above the nominal row y512 origin.
rows=[('A','original',(0,0,512,448),(353,205)),('B','original',(512,0,1024,448),(322,205)),('C','original',(1024,0,1536,448),(314,182)),('D','original',(0,470,512,1024),(347,120)),('E','correction',(512,470,1024,1024),(294,124)),('F','original',(1024,470,1536,1024),(494,109))]
facts=[]
for n,source,crop,pad in rows:
    im=sources[source].crop(crop);canvas=Image.new('RGBA',(1024,704),(0,0,0,255));canvas.paste(im,pad);canvas.save(O/f'{n}-native.png')
    facts.append({'pose':n,'source':source,'sourceSha256':sha(original if source=='original' else correction),'sourceCrop':crop,'integerPlacement':pad,'sourceScale':1,'anatomicalTransforms':0,'allSourceHumanAndEquipmentPixelsRetained':True})
Image.open(O/'B-native.png').crop((350,470,500,640)).save(O/'B-support-forearm-native.png')
Image.open(O/'D-native.png').crop((390,370,865,620)).save(O/'D-bridge-contacts-native.png')
(O/'native-registration.json').write_text(json.dumps({'canvas':[1024,704],'poses':facts,'scope':'Unfinished native-review draft. Whole panels translated only. Earlier four and standing F use original source bytes; only corrected E uses the connected new kneeling source. No limb fitting, reflection, head/shoe graft or source rescaling. Manually estimated support-sole registration is qualitative, not calibrated3D.','strictCertified':False,'completionCredit':False},indent=2)+'\n',encoding='utf8')
print(json.dumps({'extracted':6,'canvas':[1024,704],'anatomicalTransforms':0,'completionCredit':False}))
