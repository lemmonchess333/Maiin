"""Assemble independent source observations; no image writes or transformations."""
from pathlib import Path
import json
import math
import hashlib

root=Path(__file__).resolve().parent
native=json.loads((root/'native-readonly-extraction.json').read_text(encoding='utf-8'))
gear=json.loads((root/'equipment-readonly-extraction.json').read_text(encoding='utf-8'))
front=json.loads((root/'pad-feature-readonly-extraction.json').read_text(encoding='utf-8'))
wheel=json.loads((root/'wheel-run-readonly-extraction.json').read_text(encoding='utf-8'))

def delta(points):
    return max(math.dist(a,b) for a in points for b in points)

def deviation(values):
    return max(abs(v-values[0])/values[0]*100 for v in values)

upper=[[g['padRight']['boundsInclusive'][2],g['padRight']['rightmostFirstY']] for g in gear]
lower=[next(s for s in f['samples'] if s['threshold']==40)['lastRowMidpoint'] for f in front]
crop=[48,8,1496,932]
crop_points=lambda pts:[[x-crop[0],y-crop[1]] for x,y in pts]
widths=[g['padProjectedHorizontalSpan'] for g in gear]
diagonals=[math.dist(a,b) for a,b in zip(upper,lower)]
tyre=[next(s for s in w['samples'] if s['threshold']==30 and s['minimumRun']==10) for w in wheel]
tyre35=[next(s for s in w['samples'] if s['threshold']==35 and s['minimumRun']==10) for w in wheel]
tip_spans=[g['outerAxleProjectedHorizontalSpan'] for g in gear]
sources=[]
for n in native:
    sources.append({'path':str(root/n['file']),'sha256':n['sha256'],'nativeSize':n['size'],'mode':'RGB'})

report={
    'exerciseId':'ab-wheel',
    'reviewer':'independent native measurement review',
    'scope':'Original native pixels and visual source review only. No source edits, anatomical transforms, generated pixels, registration, public assets or completion credit.',
    'sources':sources,
    'canonical':{'path':str(root.parents[1]/'Maiin-burpees/docs/exercise-art/identity/athlete-anatomy-v3.png'),'sha256':'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b','visuallyInspected':True},
    'sourceOrder':['Brace','Roll','Reach'],
    'units':'native raster pixels; dimensions are projected visible contours, not 3D calibration',
    'proposedCommonCrop':{'boxXYXY':crop,'size':[1448,924],'status':'Coordinate conversion only; crop authoring and final asset recheck owned by parent. All dimensions unchanged.'},
    'proposedReleaseFixedAnchors':[
        {'name':'Exposed upper-right outer knee-pad edge','nativePoints':upper,'expectedCropPoints':crop_points(upper),'maxPairwiseEuclideanDriftPx':delta(upper),'limitPx':1,'pass':delta(upper)<=1,
         'method':'Rightmost qualifying pixel in the exposed right pad ROI, then first qualifying y at that x. Actual pad boundary, not a canvas coordinate.',
         'roiXYXY':[575,802,600,846],'pixelRule':{'minRGB':40,'maxRGB':140,'maxChannelSpread':12}},
        {'name':'Midpoint of exposed frontmost lower rounded knee-pad edge plateau','nativePoints':lower,'expectedCropPoints':crop_points(lower),'maxPairwiseEuclideanDriftPx':delta(lower),'limitPx':1,'pass':delta(lower)<=1,
         'method':'Lowest qualifying pad row in exposed front pad ROI; midpoint of its qualifying x range. The rounded front corner has a real visible plateau, so a half-pixel midpoint is retained without rounding.',
         'roiXYXY':[350,845,460,880],'pixelRule':{'minRGB':40,'maxRGB':140,'maxChannelSpread':12},
         'sensitivity':{'threshold45Points':[next(s for s in f['samples'] if s['threshold']==45)['lastRowMidpoint'] for f in front],
                        'threshold50Points':[next(s for s in f['samples'] if s['threshold']==50)['lastRowMidpoint'] for f in front],
                        'interpretation':'Threshold40/45/50 gives the same y863 and front midpoint within1px across all sources and sampled thresholds. Thresholds20-35 can capture floor/shadow; those points are rejected as pad features.'}}
    ],
    'proposedReleaseInvariantDimensions':[
        {'name':'Projected full visible pad horizontal extent','valuesPx':widths,'maxDeviationFromBracePercent':deviation(widths),'limitPercent':1,'pass':deviation(widths)<=1,
         'method':'Rightmost exposed pad x minus leftmost exposed pad x, common neutral threshold40. Measures actual pad footprint extent.',
         'roisXYXY':[[230,808,258,849],[575,802,600,846]],'pixelRule':{'minRGB':40,'maxRGB':140,'maxChannelSpread':12},
         'caveat':'Leftmost y is unstable on a rounded antialiased edge and is not selected as a fixed anchor.'},
        {'name':'Projected exposed bright-neutral tyre vertical contour span','valuesPx':[t['brightContourVerticalSpan'] for t in tyre],'topYs':[t['topY'] for t in tyre],'bottomYs':[t['bottomY'] for t in tyre],
         'maxDeviationFromBracePercent':deviation([t['brightContourVerticalSpan'] for t in tyre]),'limitPercent':1,'pass':deviation([t['brightContourVerticalSpan'] for t in tyre])<=1,
         'method':'At least10 consecutive neutral tyre pixels in each qualifying row, common brightness threshold30, outer top/bottom exposed tyre ROIs. Run filter excludes isolated human-outline anti-alias pixels.',
         'roisBySource':[w['topBottomROIs'] for w in wheel],
         'pixelRule':{'minRGB':30,'maxRGB':140,'maxChannelSpread':12,'minimumContiguousHorizontalRun':10},
         'sensitivity':{'threshold35SpansPx':[t['brightContourVerticalSpan'] for t in tyre35],'maxDeviationFromBracePercent':deviation([t['brightContourVerticalSpan'] for t in tyre35]),
                        'interpretation':'193px at threshold30 across all3; threshold35 yields192/193/193px, within1%. Threshold40 erodes the dark lower tyre rim and is unsuitable for this contour.'},
         'caveat':'This is a consistently defined visible raster tyre contour. It is not a true3D radius, unoccluded geometric diameter, axle length or calibrated grip-width claim.'}
    ],
    'additionalPadDiagnostic':{'name':'Frontmost lower corner to upper-right corner projected distance','valuesPx':diagonals,'maxDeviationFromBracePercent':deviation(diagonals),'status':'Additional observed pad footprint measurement; not needed as the second proposed release dimension.'},
    'rawOutOfLimitDiagnosticsRetained':{
        'nearTrainerBrightToeMidpoints':{'points':[n['nearToe']['lastRowMidpoint'] for n in native],'maxPairwiseEuclideanDriftPx':delta([n['nearToe']['lastRowMidpoint'] for n in native]),'strict1pxPass':False},
        'farTrainerBrightToeMidpoints':{'points':[n['farToe']['lastRowMidpoint'] for n in native],'maxPairwiseEuclideanDriftPx':delta([n['farToe']['lastRowMidpoint'] for n in native]),'strict1pxPass':False},
        'nearTrainerProjectedBrightVerticalSpan':{'valuesPx':[n['nearTrainerProjectedBrightVerticalSpan'] for n in native],'maxDeviationFromBracePercent':deviation([n['nearTrainerProjectedBrightVerticalSpan'] for n in native]),'strict1percentPass':False},
        'farTrainerProjectedBrightVerticalSpan':{'valuesPx':[n['farTrainerProjectedBrightVerticalSpan'] for n in native],'maxDeviationFromBracePercent':deviation([n['farTrainerProjectedBrightVerticalSpan'] for n in native]),'strict1percentPass':False},
        'shoeDiagnosticInterpretation':'These brightness extrema show genuine small contour redraw/heel-pitch variation. They are not selected as release anchors/dimensions and must not be represented as passing1px/1%. The visible trainers remain supported without distracting sliding; no anatomy fitting was used.',
        'visibleAxleEndcapProjectedHorizontalSpan':{'valuesPx':tip_spans,'maxDeviationFromBracePercent':deviation(tip_spans),'strict1percentPass':False,'method':'Neutral threshold30 near exposed left cap xmin to far exposed right cap xmax, using native endcap ROIs in equipment-readonly-extraction.json.',
                                                  'interpretation':'A real10.03%2D shortening of exposed endcap extent; not proof of changing3D shaft length. No camera/yaw explanation is established. It is minor exposed-tip/projection drawing variation visually: both grips remain around one axle, connected to one hub, with a comparable tyre and no gross equipment/contact break.'},
        'kneeContours':'Independent cycle reviewer recorded near silhouette around(+1,+1),far(+3,+1) versus Brace. These exceed a blanket1px contour claim, remain small visible redraws, and are disclosed. This review does not force knee locations into1px.'
    },
    'rejectedMeasurementAttempts':[
        'Leftmost pad bright pixel y varies822/815/818 on rounded edge; unsuitable as fixed anchor.',
        'First wheel neutral pixel without a contiguous run is contaminated by human forearm contour anti-aliases; initial top/bottom spans in equipment-readonly-extraction.json are not wheel-radius measurements.',
        'Threshold20-35 lower pad ROI can capture the floor shadow to its ROI boundary; rejected, not accepted as a pad anchor.',
        'Projected head bounding-box height varies with head pitch and visible chin/neck articulation; it cannot establish an invariant skull length.'
    ],
    'nativePhysicalReview':{
        'sequence':'Three genuinely different intact configurations: upright kneeling brace, mid rollout with shoulder/hip travel, and longer controlled reach; reverse reuse is truthful for a controlled return.',
        'endpoint':'Reach retains residual hip flexion and a neutral braced trunk. Do not label perfectly straight or fully horizontal. It visibly stays clear of the floor without lumbar sag or chest collapse.',
        'contacts':'Both knees remain supported on the pad; rear trainers rest behind them; both hands appear to retain closed grips on the single axle/hub throughout. Forward wheel y travel follows the oblique ground plane and is not alone evidence of losing floor contact.',
        'identity':'Native full sources and FA56 were visually inspected. Same bald faceless lean pale anatomical identity, no shorts or waistband, smooth neutral featureless pelvis and white trainers. No gross head/body scale switch or malformed joint/limb is apparent. Head pitch and limb foreshortening change; exact3D proportions cannot be proved from2D rasters.',
        'equipment':'One tyre with comparable visible contour dimensions and persistent hub/grips. Exposed shaft tips shorten in projection; minor drawing variation is present and disclosed, not an exact rigid-shaft pass.',
        'colour':'Native source palette is not certified as final exact primary/secondary release colours. Ordinary approved colour/contour finishing and final native/mobile review remain separate gates.',
        'judgment':'Native physical sequence is usable for a controlled-range kneeling rollout proposal under the revised allowance for small nondistracting contour variation. Raw source pad anchors and measured pad/tyre projected dimensions satisfy the proposed1px/1% checks. This is not final release acceptance.'
    },
    'sourceIntegrity':{'sha256CheckedBeforeReport':True,'humanPixelEdits':False,'gearEdits':False,'imageGeneration':False,'publicEdits':False},
    'evidenceFiles':['measure-native-readonly.py','native-readonly-extraction.json','equipment-readonly-extraction.json','measure-pad-features-readonly.py','pad-feature-readonly-extraction.json','wheel-run-readonly-extraction.json']
}
for s in sources:
    if hashlib.sha256(Path(s['path']).read_bytes()).hexdigest()!=s['sha256']:
        raise RuntimeError('Source changed before independent report: '+s['path'])
if hashlib.sha256(Path(report['canonical']['path']).read_bytes()).hexdigest()!=report['canonical']['sha256']:
    raise RuntimeError('Canonical source hash mismatch')
(root/'measurements-independent.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'report':str(root/'measurements-independent.json'),'padAnchors':{'upper':upper,'lower':lower},'padWidths':widths,'padDiagonals':diagonals,'tyreSpans':[t['brightContourVerticalSpan'] for t in tyre],'rawTipSpanDeviationPercent':deviation(tip_spans)},indent=2))
