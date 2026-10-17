"""Stage a retained two-endpoint candidate; does not register or accept it."""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
draft=HERE/'draft'
(draft/'frames').mkdir(parents=True,exist_ok=True)
inputs={1:HERE/'top-candidate-colours.png',4:HERE.parent/'4-standing-master-v1.png'}
images={key:Image.open(path).convert('RGB') for key,path in inputs.items()}
bounds=[]
for image in images.values():
    yy,xx=np.where(np.asarray(image).max(axis=2)>14)
    bounds.append([int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1])
crop=[max(0,min(b[0] for b in bounds)-32),max(0,min(b[1] for b in bounds)-32),
      min(1024,max(b[2] for b in bounds)+32),min(1856,max(b[3] for b in bounds)+32)]
for pose,image in images.items():
    framed=image.crop(crop)
    framed.save(draft/f'{pose}-framed.png')
order=[1,1,4,4,1,1]
frame_hashes={}
for index,pose in enumerate(order,1):
    image=images[pose].crop(crop)
    path=draft/'frames'/f'{index}.webp'
    image.save(path,lossless=True,quality=100,method=6)
    assert np.array_equal(np.asarray(image),np.asarray(Image.open(path).convert('RGB')))
    frame_hashes[path.relative_to(HERE).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
plan={'exerciseId':'overhead-extension','name':'Overhead Tricep Extension',
      'sourceScope':'Candidate: two intact retained poses, one integer whole-frame translation and colour-only finishing. No new image requests, anatomical warping, resizing, or grafts. Not accepted or registered.',
      'primary':['Triceps'],'secondary':['Front Delts'],'physicalPoses':2,'sourcePoseOrder':order,
      'commonCrop':crop,'dimensions':list(images[1].crop(crop).size),
      'setup':['Stand or sit, hold one dumbbell with both hands straight overhead.',
               'Keep elbows close to your ears and pointed at the ceiling.'],
      'beats':[
          {'t':0,'label':'Top','cue':'Hold the dumbbell overhead with both hands.'},
          {'t':0,'label':'Brace','cue':'Keep your core braced and elbows up.'},
          {'t':1,'label':'Lower','cue':'Bend elbows; lower the dumbbell behind head.'},
          {'t':1,'label':'Bottom','cue':'Keep your upper arms beside your head.'},
          {'t':0,'label':'Extend','cue':'Straighten your elbows and squeeze your triceps.'},
          {'t':0,'label':'Reset','cue':'Keep the dumbbell steady at full extension.'}],
      'findingsPendingReview':['Residual source head/shoe outline and position differences after global placement.',
                               'Upper arms and elbows are not pixel-fixed; native and playback form assessment required.',
                               'Two physical endpoints only; no continuous path or six unique poses.'],
      'frameHashes':frame_hashes,'releaseApproved':False,'completionCredit':False}
assert all(len(row['cue'].split())<=7 for row in plan['beats'])
(HERE/'sequence-plan.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf8')
old=HERE.parents[1]/'face-pulls'/'ergonomic-rope-production-20261015'
for name in ['review-shared.tsx','native-review.tsx','review-vite.config.mjs','native-review.html']:
    text=(old/name).read_text(encoding='utf8').replace('Face Pulls','Overhead Tricep Extension').replace('62319','62320').replace('ergonomic-rope-production-20261015','whole-frame-registration-20261015')
    if name=='native-review.tsx':
        text=text.replace('CardViews, PlaybackEvidence','PlaybackEvidence').replace('    <CardViews src="/draft/card.webp" />\n','')
    (HERE/name).write_text(text,encoding='utf8')
mobile="""import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../Maiin-burpees/src/index.css';
import ExerciseFormFrames from '../../Maiin-burpees/src/components/ExerciseFormFrames';
import { PlaybackEvidence, ThemeControl } from './review-shared';
import plan from './sequence-plan.json';
const beats=plan.beats.map(({t,label,cue},index)=>({t,label,cue,image:`draft/frames/${index+1}.webp`}));
function Review(){const [index,setIndex]=useState(0);return <main className="min-h-screen bg-background text-foreground p-4"><div className="mx-auto max-w-[390px] space-y-3"><h1 className="text-h2 font-bold">Overhead Tricep Extension</h1><ThemeControl/><p>Unregistered two-pose candidate</p><ExerciseFormFrames name="Overhead Tricep Extension" beats={beats} onStep={setIndex}/><p>{beats[index].cue}</p><PlaybackEvidence/></div></main>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
"""
(HERE/'mobile-review.tsx').write_text(mobile,encoding='utf8')
(HERE/'mobile-review.html').write_text((HERE/'native-review.html').read_text(encoding='utf8').replace('native-review.tsx','mobile-review.tsx'),encoding='utf8')
print(json.dumps({'candidateOnly':True,'commonCrop':crop,'dimensions':plan['dimensions'],'frameHashes':frame_hashes},indent=2))
