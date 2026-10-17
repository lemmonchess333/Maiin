"""Read-only source measurements and literal native proof crops; no art edits."""
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image
import hashlib
import json
import math
import numpy as np

R = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
metrics = json.loads((R / 'hardware-measurements.json').read_text(encoding='utf-8'))
sources = [('3-lower-direct-original.png', (0, 0)), ('6-upper-direct-original.png', (-1, 16))]
rows = []
for n, (name, offset) in enumerate(sources, 1):
    original = Image.open(R / name).convert('RGB')
    normalized = Image.new('RGB', original.size)
    normalized.paste(original, offset)
    a = np.asarray(normalized).astype(float).mean(2)
    bottom = [(y, float(a[y, 370:420].mean())) for y in range(1145, 1161)]
    dark_rows = [y for y, value in bottom if value < 25]
    panel_y = (min(dark_rows) + max(dark_rows)) / 2
    right = [(x, float(a[1100:1130, x].mean())) for x in range(430, 451)]
    panel_x = min(right, key=lambda item: item[1])[0]
    spindle = metrics['fixedAnchors'][2]['normalizedNativePoints'][n-1]
    y = round(spindle[1])
    windows = [(505, 520), (570, 585)] if n == 1 else [(510, 525), (585, 600)]
    rim_x = [min(range(lo, hi), key=lambda x: a[y, x]) for lo, hi in windows]
    proof = f'{n}-housing-native-source-proof.png'
    normalized.crop((350, 950, 800, 1320)).save(R / proof)
    rows.append({
        'pose': n, 'source': name, 'sourceSha256': sha(R/name),
        'wholeSceneOffset': list(offset),
        'panelBottomDarkOutlineMeanSamples': bottom,
        'panelBottomDarkRowsAtMeanBelow25': dark_rows,
        'panelBottomOutlineY': panel_y,
        'panelRightOutlineMeanSamples': right,
        'panelRightOutlineX': panel_x,
        'spindleCentroid': spindle,
        'spindleRelativeToPanelRasterReference': [spindle[0]-panel_x, spindle[1]-panel_y],
        'visibleSilverBearingRimHorizontalChordAtRoundedSpindleY': {
            'y': y, 'inspectedOutlineMinimaX': rim_x, 'chordPx': rim_x[1]-rim_x[0],
            'method': 'Literal visible black outline minima bracketing the silver bearing at the rounded aperture-centroid row, in separately inspected left/right windows. This is a raster chord, not a complete 3D diameter or invariant certification.'},
        'nativeProof': proof, 'nativeProofSha256': sha(R/proof),
    })
delta = [rows[1]['spindleRelativeToPanelRasterReference'][axis] - rows[0]['spindleRelativeToPanelRasterReference'][axis] for axis in (0, 1)]
drift = metrics['fixedAnchors'][2]['driftPx']
report = {
    'status': 'read-only native housing-context evidence; root physical-continuity decision pending',
    'exerciseId': 'bike', 'reviewedAt': datetime.now(timezone.utc).isoformat(),
    'reviewScope': 'Source pixels at original scale; no browser review, hardware approval, equipment correction, anatomy edit or completion credit.',
    'sourceCoordinateSpace': [1024,1536], 'nativeCrop': [350,950,800,1320],
    'measurementsInputSha256': sha(R/'hardware-measurements.json'),
    'scriptSha256': sha(Path(__file__)), 'rows': rows,
    'spindleNormalizedSceneDeltaPx': metrics['fixedAnchors'][2]['deltaUpperMinusLowerPx'],
    'spindleNormalizedSceneDriftPx': drift,
    'spindleRelativeToPanelRasterReferenceDeltaPx': delta,
    'spindleRelativeToPanelRasterReferenceDriftPx': math.hypot(*delta),
    'globalDriftAsPercentOfVisibleRimChords': [100*drift/row['visibleSilverBearingRimHorizontalChordAtRoundedSpindleY']['chordPx'] for row in rows],
    'contextInterpretation': 'The recessed panel right edge remains at x442 while its bottom dark outline shifts only2.5px down. The bearing aperture shifts9.440px right and13.723px up. Relative to those actual casing outlines the discrepancy remains, rather than being explained by whole-scene registration. The nearby bearing plate also has visibly different projected width; its measured65/73px horizontal outline chords are contextual source redraw findings, not calibrated dimensions.',
    'impact': 'Switching poses can make the fixed bearing visibly hop within the housing while the crank changes orientation. This is a physical equipment-continuity risk at the central mechanism. The strict1px failure remains. Actual native/mobile playback must determine whether the owner relaxation can accept it as minor; otherwise keep the candidate held.',
    'strictHardwarePassed': False, 'rootAcceptance': None,
    'equipmentOrHumanPixelsEdited': False, 'productionRegisteredByThisReview': False,
    'completionCredit': False,
}
(R/'housing-context-review.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'spindleDriftPx':drift, 'relativeToCasingDeltaPx':delta, 'relativeToCasingDriftPx':math.hypot(*delta), 'bearingChordPx':[r['visibleSilverBearingRimHorizontalChordAtRoundedSpindleY']['chordPx'] for r in rows], 'strictHardwarePassed':False}))
