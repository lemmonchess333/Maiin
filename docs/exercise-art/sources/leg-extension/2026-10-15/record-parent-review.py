"""Bind actual parent observations to this final, unregistered draft only."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,shutil
root=Path(__file__).resolve().parent;work=root.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=json.loads((root/'sequence-plan.json').read_bytes())
read=lambda n:json.loads((root/'review'/n).read_bytes())
paths={f'/draft/frames/{n}.webp' for n in range(1,7)}
for theme in ['light','dark']:
 rows=read(f'extension-draft-manual-{theme}.json')['observations']
 assert len(rows)==7 and rows[0]['src']==rows[-1]['src'] and {r['src'] for r in rows}==paths
 for r in rows:
  assert r['viewport']==[390,844] and r['theme']==theme and r['complete'] and r['visible']=='visible' and not r['overflow']
  n=int(r['src'].rsplit('/',1)[1].split('.')[0]);assert plan['beats'][n-1]['cue'] in r['cues']
 normal=read(f'extension-draft-mobile-{theme}-normal.json')['observations']
 assert {r['src'] for r in normal}==paths
 assert all(r['playing'] and not r['documentHidden'] and r['viewport']==[390,844] and r['display']==[334,360] for r in normal)
 assert any(x['src'].endswith('/6.webp') and y['src'].endswith('/1.webp') for x,y in zip(normal,normal[1:]))
 cards=read(f'extension-draft-cards-{theme}.json')['cards']
 assert len(cards)==2 and all(r['complete'] and r['natural']==[480,384] and r['viewport']==[390,844] and r['theme']==theme for r in cards)
slow=read('extension-draft-mobile-light-slower.json')['observations']
assert {r['src'] for r in slow}==paths and all(r['playing'] and 'Slower' in r['sectionText'] for r in slow)
assert all(1800<y['ms']-x['ms']<3200 for x,y in zip(slow,slow[1:]))
assert [r['alt'] for r in read('extension-draft-manual-wrap.json')['observations']]==['Leg Extension, Set','Leg Extension, Reset','Leg Extension, Set']
assert read('extension-draft-console.json')['errors']==[]
assert all(sha(root/n)==h for n,h in plan['frameHashes'].items())
card=json.loads((root/'card-preview-proof.json').read_bytes())
assert card['referenceSha256']==plan['frameHashes']['draft/frames/3.webp'] and card['sha256']==sha(root/'draft/card.webp') and card['noThresholdOrAlphaOverride']
independent=work/'independent-leg-extension-endpoint-review-20261015/single-material-correction-review.json'
assert sha(independent)=='a51be5d18d5ca90e44f64d9a62487d7af1e72d688079b2632efd4ad21d56b41f'
shutil.copyfile(independent,root/'review/independent-source-review.json')
observations={
 'identity':'Parent viewed FA56 and original/final native endpoints. Original bald faceless grey-white athlete without shorts, full white trainers and anatomical contour detail remain. Small original head/seat/hand differences remain disclosed; no exact canonical pixel identity certification.',
 'camera':'Original source1/4 intact scenes retain coordinates after the common whole-scene placement(0,+40) on1536x1104. Common crop[114,14,1433,1070] yields1319x1056. Replacement apparatus has one explicit orthographic3D camera; it does not establish the original human camera or unseen joint depth.',
 'anatomy':'All human shapes remain from intact successful originals. No anatomical warping, limb fitting, head/shoe graft or hidden reconstruction. Parent final native pair and mobile views show readable bent and extended legs without obvious material body distortion.',
 'equipment':'Both states use the same constructed fixed covered generic selectorized chassis and dual independent rotary working units. Actual world arm lengths, pad radii/lengths and axes remain constant. Short pads have documented positive axial clearance. Original foreground/occlusion masks and all unoccluded replacement gear layers are retained for inspection. Neutral material finish now follows original contour/shading detail; minor facet bands/simpler panels remain. Covered cams/belts/resistance and brand-specific routing are unverified.',
 'contact':'Preserved hands grip original seat handles and hips/back remain supported. True rotary pad contact targets project onto the original shin positions at both endpoints; feet remain free. Source depth assumptions and joint-centre estimates remain disclosed, rather than a biomechanical calibration. No visible mobile collision or major contact gap observed.',
 'physics':'Actual bent/extended states show knee extension while hips remain seated and hands retain support. A common rigid apparatus geometry explains both pad positions, without frame-specific shrinking arms or separate fitted SVG paths. Two endpoints are repeated; no drawn intermediate or continuous mechanics certification. Hidden resistance transmission remains unverified.',
 'muscles':'Existing Quads primary and Hip Flexors secondary colour fields remap to base#7B72E9/#9590E0 using source-local maximum-channel/chroma. Original fibre shading, neutral contours and support alpha are retained. No spatial body shading gradient is authored. Native and mobile final colours/shadows are coherent with retained approved source style.',
 'cueAgreement':'All six paths manually selected plus wrap in both390x844 themes; labels/cues match each visible bent/extended endpoint, all cues at most7words. Setup uses exact catalogue shin-pad placement. Registered guide review remains pending.',
 'sequenceAndLoop':'Actual native player1319x1056 and mobile390x844 playback observed all six paths and automatic6-to-1 wraps. Normal intervals approximately1.2s, slower2.4s; manual previous1-to-6 and next6-to-1 verified. Source order[1,1,4,4,1,1],2physical poses. No six-unique-pose claim.',
 'mobileLight':'Parent actual390x844 light view checked all6cues, normal/slower playback, full athlete/equipment and normal-generator transparent480/160px cards. No horizontal overflow, major clipping or unreadable cue observed. Final integrated guide review remains pending.',
 'mobileDark':'Parent actual390x844 dark view checked all6cues, normal playback and normal-generator transparent480/160px cards. Full athlete/equipment remains readable; no material clipping/contact defect. Captured browser warnings/errors empty. Final integrated guide review remains pending.'}
result={'reviewedAt':datetime.now(timezone.utc).isoformat(),'exerciseId':'leg-extension','version':plan['version'],
 'planSha256':sha(root/'sequence-plan.json'),'cardSha256':sha(root/'draft/card.webp'),
 'allowLocalIntegration':True,'completionCredit':False,'strictChecksRemainNull':True,
 'findings':plan['findings']+['Minor neutral-metal facet bands and simplified covered panels remain.','Only a constructed apparatus camera is proven; original human depth and covered resistance routing remain uncertain.'],
 'observations':observations,'draftActualUiOnly':'Final integrated guide/card, normal project checks, CI, merge and preservation audit remain pending.'}
(root/'parent-draft-review.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({'exerciseId':'leg-extension','allowLocalIntegration':True,'completionCredit':False,'reviewSha256':sha(root/'parent-draft-review.json')}))
