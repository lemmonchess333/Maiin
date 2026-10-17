from pathlib import Path
import json,re
R=Path(__file__).resolve().parent;mobile=[]
for theme in ['dark','light']:
    trace=json.loads((R/f'staged-{theme}-trace.json').read_text());good=[x for x in trace if x['theme']==theme and x['viewport']==[390,844] and x['playing'] and not x['documentHidden'] and x['naturalWidth']==940 and x['naturalHeight']==940]
    frames=sorted(set(int(re.search(r'/([1-6])\.webp$',x['src']).group(1))for x in good));loop=any(good[i-1]['src'].endswith('/6.webp')and x['src'].endswith('/1.webp')for i,x in enumerate(good)if i)
    assert frames==list(range(1,7))and loop
    mobile.append(dict(theme=theme,viewport=[390,844],decodedFrames=frames,loop6to1=loop,qualifyingObservations=len(good)))
controls=json.loads((R/'staged-controls.json').read_text());assert controls['pausePlayVisible'] and controls['selectSix'].endswith('/6.webp') and controls['nextWrap'].endswith('/1.webp') and controls['previousWrap'].endswith('/6.webp') and controls['slowerPressed']=='true' and not controls['consoleErrors'] and 1.8<controls['timing']['ratio']<2.2
native=json.loads((R/'native-final-trace.json').read_text());assert len(native)==6 and all(x['complete']and x['natural']==[940,940]and x['display']==[940,940]for x in native)
out=dict(passed=True,scope='Staged actual component/native source review, not release completion',mobile=mobile,controls=controls,native='Six actual WebP paths decoded at natural/rendered940x940;6to1 manual return inspected. Final three original stills and inherited shading reviewed.',identity='Same canonical bald faceless lean white-grey anatomy, neutral pelvis and white trainers; complete originals retained',minorFindings=['Three genuine physical poses; floor/lockout pauses and return reuse disclosed.','Original shoe/toe contours and projected neutral muscle contours vary slightly; both posterior sole envelopes remain within1px after uniform whole-scene translations.','Projected shaft-angle variation and grey join shade variation retained; copied plate/end pixels and actual dimensions checked, not3D calibration.'],remaining='Registered paths/standard card/full project checks/required CI and merge before completion credit')
(R/'staged-visual-validation.json').write_text(json.dumps(out,indent=2))
print(json.dumps(dict(passed=True,mobile=mobile,normalMedianMs=controls['timing']['normalMedianMs'],slowerMedianMs=controls['timing']['slowerMedianMs'])))
