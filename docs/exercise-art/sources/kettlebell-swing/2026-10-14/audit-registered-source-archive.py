"""Read-only post-registration preservation audit; output stays in KB work sidecar."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from PIL import Image
import argparse, io, json, re, subprocess, zipfile
import xml.etree.ElementTree as ET
import numpy as np

SIDE=Path(__file__).resolve().parent
REPO=SIDE.parents[1]/'Maiin-burpees'
CANONICAL='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
ORDER=[2,3,1,1,3,2]
SOURCE_NAMES=['1-master.png','2-hike-candidate.png','3-mid-candidate.png']
SOURCE_HASHES=['c48e17588b1c937dc54a49bb28713bfdeb3783cdf20713977a684c719b52c00e','5552c7d32578de3a5417e1940ac679580654f78d38df0658ead7ecb04889d2c4','6a0ff5550d20ff24088f1558b0acec3f07a27d6946eb20bf2cf052dda1c9d248']
PROMPT_NAMES=['master-prompt.txt','2-hike-prompt.txt','3-mid-prompt.txt']
PROMPT_HASHES=['c6b8d6d000e909697d0c70333bffbb8760b0eb0e6a3e9a450ac6910a8bde16ae','c2ebc7ed616d3ae37804e6a883bac3cd7197beb6b68056d2a3ae58d27cdce8ef','11725f4245e64e6a671c7123d1705a4b02d43648daa8bcc80d9f5df87713b980']
CARD_HASH='1e8b1d6b4f0140fe2eed49b9c90718affa3283e772829ebc916583262a72b9be'
PREPARED_HASH='08e4e912eb1303ac565f6057208449fce224062e07ef9cf408cbe6d259add1a0'
CHECK_NAMES=['identity','camera','anatomy','equipment','contact','physics','muscles','cueAgreement','sequenceAndLoop','mobileLight','mobileDark']
sha=lambda p:sha256(p.read_bytes()).hexdigest()
pixels=lambda p:np.asarray(Image.open(p).convert('RGBA'))
git=lambda *args:subprocess.check_output(['git',*args],cwd=REPO,text=True).strip()

def reopen_ora(path, expected):
    with zipfile.ZipFile(path) as z:
        tree=ET.fromstring(z.read('stack.xml')); stack=tree.find('stack')
        assert stack is not None and all(e.tag=='layer' for e in stack)
        canvas=Image.new('RGBA',(int(tree.attrib['w']),int(tree.attrib['h'])))
        for node in reversed(list(stack)):
            assert node.attrib.get('composite-op','svg:src-over')=='svg:src-over'
            assert node.attrib.get('visibility','visible')=='visible'
            assert float(node.attrib.get('opacity','1'))==1
            layer=Image.open(io.BytesIO(z.read(node.attrib['src']))).convert('RGBA')
            canvas.alpha_composite(layer,(int(node.attrib.get('x','0')),int(node.attrib.get('y','0'))))
        assert np.array_equal(np.asarray(canvas),expected)
        assert np.array_equal(np.asarray(Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA')),expected)
        return {'path':str(path),'sha256':sha(path),'layerCount':len(stack),'recomposedExactly':True,'mergedPreviewExactly':True}

def measurements(path):
    a=pixels(path)[:,:,:3].astype(int); out={}
    white=lambda q:(q.min(axis=2)>130)&(q.max(axis=2)-q.min(axis=2)<30)
    for side,hb,sb in [('near',(360,943,390,963),(360,942,524,973)),('far',(504,908,540,925),(505,912,674,925))]:
        x0,y0,x1,y1=hb;ys,xs=np.where(white(a[y0:y1,x0:x1]));lx=int(xs.min())
        anchor={'x':lx+x0-280,'y':int(ys[xs==lx].max())+y0}
        x0,y0,x1,y1=sb;ys,xs=np.where(white(a[y0:y1,x0:x1]))
        out[side]={'anchor':anchor,'span':int(xs.max()-xs.min()+1),'soleROI':list(sb)}
    return out

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',type=Path)
    parser.add_argument('--master',type=Path)
    parser.add_argument('--output',default='registered-source-archive-audit.json')
    args=parser.parse_args()
    output=SIDE/args.output
    assert output.resolve().parent==SIDE.resolve(), 'Audit output must remain in the KB sidecar.'
    report={'auditedAt':datetime.now(timezone.utc).isoformat(),'exerciseId':'kettlebell-swing','passed':False,'scope':'Independent read-only registration/source-archive/preservation audit. No repo/public/source edits, counter credit, image generation or project-test reruns.','checks':{},'failures':[]}
    def check(name,fn):
        try:report['checks'][name]={'passed':True,'evidence':fn()}
        except Exception as exc:report['checks'][name]={'passed':False,'error':str(exc)};report['failures'].append(name)

    report['gitAtStart']={'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'statusPorcelain':git('status','--porcelain')}
    inputs=json.loads((SIDE/'post-registration-audit-inputs.json').read_text())
    original_rows=json.loads((SIDE/'retained-original-provenance.json').read_text())
    archive=args.archive or REPO/'docs/exercise-art/sources/kettlebell-swing'
    archive_files=[f for f in archive.rglob('*') if f.is_file()] if archive.exists() else []
    archive_hashes={f:sha(f) for f in archive_files}
    def archive_matches(digest):return [str(p) for p,h in archive_hashes.items() if h==digest]
    archive_prompt_bytes={}
    exact_prompt_zip=archive/'original-prompts-exact.zip'
    if exact_prompt_zip.exists():
        with zipfile.ZipFile(exact_prompt_zip) as z:
            archive_prompt_bytes={Path(name).name:z.read(name) for name in z.namelist() if not name.endswith('/')}

    def preservation():
        old=json.loads((SIDE/'previous-artwork-hashes.json').read_text());assert len(old)==896
        changed=[p for p,h in old.items() if not (REPO/p).is_file() or sha(REPO/p)!=h]
        assert not changed, f'Prior public artwork changed/missing: {changed}'
        cp=REPO/'docs/exercise-art/identity/athlete-anatomy-v3.png';assert sha(cp)==CANONICAL
        current={f.relative_to(REPO).as_posix() for part in ['form-frames','form-art'] for f in (REPO/'public'/part).rglob('*') if f.is_file()}
        expected={f'public/form-frames/kettlebell-swing/{n}.webp' for n in range(1,7)}|{'public/form-art/kettlebell-swing.webp'}
        assert current-set(old)==expected,f'Unexpected new public assets: {sorted(current-set(old))}'
        return {'prior896PublicFilesUnchanged':True,'canonicalSha256':CANONICAL,'currentPublicAssetCount':len(current),'onlyNewPublicAssets':sorted(expected)}
    check('previous-artwork-and-canonical',preservation)

    def originals():
        rows=[]
        for i,name in enumerate(SOURCE_NAMES):
            row=original_rows[i];assert row['name']==name and row['sha256']==SOURCE_HASHES[i] and row['promptSha256']==PROMPT_HASHES[i]
            original=Path(row['originalPath']);copy=SIDE/name;prompt=SIDE/PROMPT_NAMES[i];op=original.parent/PROMPT_NAMES[i]
            assert sha(original)==sha(copy)==SOURCE_HASHES[i]
            assert original.read_bytes()==copy.read_bytes()
            assert sha(op)==sha(prompt)==PROMPT_HASHES[i] and op.read_bytes()==prompt.read_bytes()
            sm=archive_matches(SOURCE_HASHES[i]);pm=archive_matches(PROMPT_HASHES[i]);assert sm,f'Archive lacks exact original {name}'
            zip_bytes=archive_prompt_bytes.get(PROMPT_NAMES[i])
            if not pm:
                assert zip_bytes==op.read_bytes() and sha256(zip_bytes).hexdigest()==PROMPT_HASHES[i],f'Archive lacks exact prompt bytes {PROMPT_NAMES[i]}'
                pm=[str(exact_prompt_zip)+'::'+PROMPT_NAMES[i]]
            loose=archive/PROMPT_NAMES[i]
            loose_hash=sha(loose) if loose.exists() else None
            if loose.exists():
                normalize=lambda data:data.replace(b'\r\n',b'\n').rstrip(b'\n')
                assert normalize(loose.read_bytes())==normalize(op.read_bytes()),'Loose archived prompt changed beyond terminal newline normalization.'
            rows.append({'pose':i+1,'source':name,'originalSource':str(original),'sourceSha256':SOURCE_HASHES[i],'promptSha256':PROMPT_HASHES[i],'sourceBytesAndExactArchivedPromptBytesVerified':True,'sourceArchiveCopies':sm,'promptExactByteArchiveCopies':pm,'looseReadablePromptSha256':loose_hash,'loosePromptBytesExact':loose_hash==PROMPT_HASHES[i],'loosePromptNormalizationIfDifferent':'Only line-ending/terminal-newline normalization; exact historical bytes retained in ZIP.'})
        return {'retainedOriginals':3,'originalPrompts':3,'archive':str(archive),'newGeneration':False,'rows':rows}
    check('exact-originals-prompts-and-source-archive',originals)

    framed={n:pixels(SIDE/f'{n}-framed.png') for n in range(1,4)}
    def editables():
        rows=[]
        for n in range(1,4):
            path=SIDE/f'{n}-framed.ora';expected_hash=inputs['acceptedFileHashes'][path.name];assert sha(path)==expected_hash
            result=reopen_ora(path,framed[n]);matches=archive_matches(expected_hash);assert matches,f'Archive lacks ORA {n}'
            result['sourceArchiveCopies']=matches
            for p in matches:reopen_ora(Path(p),framed[n])
            rows.append(result)
        return {'threeEditableStacksIndependentlyReopenedExact':True,'rows':rows}
    check('three-openraster-editables',editables)

    def frames_and_master():
        rows=[]
        for beat,pose in enumerate(ORDER,1):
            src=SIDE/'final-frames'/f'{beat}.webp';dst=REPO/f'public/form-frames/kettlebell-swing/{beat}.webp'
            assert sha(src)==inputs['acceptedFileHashes'][f'final-frames/{beat}.webp']
            assert dst.read_bytes()==src.read_bytes() and np.array_equal(pixels(dst),framed[pose])
            rows.append({'beat':beat,'sourcePose':pose,'publicPath':dst.relative_to(REPO).as_posix(),'sha256':sha(dst),'decodedPixelsExactlyFramed':True})
        masters=[args.master] if args.master else [p for p in (REPO/'masters/kettlebell-swing').rglob('*') if p.is_file() and p.suffix.lower() in {'.png','.webp'}]
        matches=[p for p in masters if p.is_file() and np.array_equal(pixels(p),pixels(REPO/'public/form-frames/kettlebell-swing/3.webp'))]
        assert matches,'Registered master does not decode exactly to frame3/Float.'
        return {'sourcePoseOrder':ORDER,'threeGenuinePosesSixPaths':True,'referenceFrame':3,'frames':rows,'masterMatches':[{'path':str(p),'sha256':sha(p)} for p in matches]}
    check('frame-order-and-master-frame3',frames_and_master)

    def prepared_card():
        native=SIDE/'prepared-card-source.png';cut=SIDE/'card-cutout.webp';public=REPO/'public/form-art/kettlebell-swing.webp'
        assert sha(native)==PREPARED_HASH and sha(cut)==CARD_HASH and public.read_bytes()==cut.read_bytes()
        registered_source=REPO/'docs/exercise-art/cutout-sources/kettlebell-swing.png'
        assert registered_source.read_bytes()==native.read_bytes()
        a=pixels(native);frame=pixels(REPO/'public/form-frames/kettlebell-swing/3.webp')
        assert a.shape==frame.shape and np.array_equal(a[:,:,:3],frame[:,:,:3])
        bright=frame[:,:,:3].max(axis=2)>110;assert np.all(a[:,:,3][bright]==255)
        assert Image.open(public).size==(307,480)
        for name,h in inputs['acceptedCardReviewProofHashes'].items():assert sha(SIDE/name)==h,f'Review seal changed: {name}'
        card_review=json.loads((SIDE/'prepared-card-review.json').read_text());assert all(c['passed'] for c in card_review['visualReview'].values() if isinstance(c,dict))
        return {'preparedNativeSha256':PREPARED_HASH,'registeredCutoutSourceBytesExact':True,'cardSha256':CARD_HASH,'publicCardBytesExact':True,'preparedRGBExactlyFrame3':True,'allOriginalBrightPixelsRemainOpaque':int(bright.sum()),'dimensions':[307,480],'priorIndependentAlphaAndLightDarkReviewHashSealExact':True,'cardRGBExactnessLimit':'Only native prepared PNG RGB is exact; resized lossy card retains accepted reviewed bytes.'}
    check('prepared-card-preservation-and-public-copy',prepared_card)

    records=[]
    for path in (REPO/'docs/exercise-art/releases').glob('*/*.json'):
        try:obj=json.loads(path.read_text(encoding='utf-8-sig'))
        except Exception:continue
        if obj.get('exerciseId')=='kettlebell-swing' and obj.get('decision')=='approved':records.append((path,obj))
    def release_geometry():
        assert records,'No approved KB release record.'
        path,record=max(records,key=lambda x:x[1]['reviewedAt'])
        assert record['width']==690 and record['height']==1008 and record['version'].strip()
        assert record['reference']=={'path':'form-frames/kettlebell-swing/3.webp','sha256':sha(SIDE/'final-frames/3.webp')}
        assert record.get('reviewer') and record.get('reviewedAt')
        for name in CHECK_NAMES:assert record['checks'][name]['passed'] is True and record['checks'][name]['evidence'].strip()
        assert not record.get('contactPhases') and not record.get('airborneFrames'),'All three retained poses remain planted; phase exception is unwarranted.'
        m={n:measurements(SIDE/name) for n,name in enumerate(SOURCE_NAMES,1)}
        rows=[]
        assert len(record['frames'])==6
        for beat,pose in enumerate(ORDER,1):
            r=record['frames'][beat-1]
            anchors={'nearSoleHeelEdge':m[pose]['near']['anchor'],'farSoleHeelEdge':m[pose]['far']['anchor']}
            dims={'nearLowerSoleBrightSpan':m[pose]['near']['span'],'farLowerSoleBrightSpan':m[pose]['far']['span']}
            assert r['path']==f'form-frames/kettlebell-swing/{beat}.webp' and r['sha256']==sha(REPO/'public'/r['path'])
            assert r['anchors']==anchors and r['invariantDimensions']==dims,f'Frame{beat} geometry does not equal measured source shoe pixels.'
            for side in ['near','far']:
                x0,y0,x1,y1=m[pose][side]['soleROI'];original=pixels(SIDE/SOURCE_NAMES[pose-1])
                assert np.array_equal(framed[pose][y0:y1,x0-280:x1-280],original[y0:y1,x0:x1])
            rows.append({'beat':beat,'sourcePose':pose,'anchors':anchors,'invariantDimensions':dims})
        base=rows[0]
        for r in rows:
            for name,a in r['anchors'].items():assert all(abs(a[ax]-base['anchors'][name][ax])<=1 for ax in ['x','y'])
            for name,v in r['invariantDimensions'].items():assert abs(v/base['invariantDimensions'][name]-1)<=.01
        beats=json.loads((SIDE/'draft-beats.json').read_text())
        cue_hash=sha256(json.dumps([{'label':b['label'],'cue':b['cue']} for b in beats],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
        assert record['cueSha256']==cue_hash
        assert record.get('physicalPoses')==3 and record.get('sourcePoseOrder')==ORDER and record.get('newImageRequests')==0
        registry=(REPO/'src/lib/formArtReleases.data.ts').read_text()
        match=re.search(r'"kettlebell-swing"\s*:\s*\{([^}]+)\}',registry,re.S);assert match
        body=match.group(1)
        for field,value in [('folder',path.parent.name),('version',record['version'])]:assert re.search(r'\b'+field+r'\s*:\s*'+re.escape(json.dumps(value)),body)
        for field,value in [('width',690),('height',1008),('reference',3)]:assert re.search(r'\b'+field+r'\s*:\s*'+str(value)+r'\b',body)
        return {'recordPath':str(path),'recordSha256':sha(path),'all11ReviewChecksWithEvidence':True,'referenceFrame3':True,'registryMatchesRecord':True,'cueSha256':cue_hash,'measurementsRecomputedFromOriginalWhiteShoePixels':True,'soleROIOriginalNeutralPixelsExact':True,'anchorsWithin1Pixel':True,'spansWithin1Percent':True,'frames':rows,'truthfulLimits':'Planted heel-edge raster anchors and projected outsole spans only; no fake constant rotating-bell bbox, moving head y or head scale invariant.'}
    check('approved-release-truthful-geometry-and-registry',release_geometry)

    def platform_and_provenance():
        path,record=max(records,key=lambda x:x[1]['reviewedAt'])
        p=archive/'provenance.json';prov=json.loads(p.read_text())
        assert prov['exerciseId']=='kettlebell-swing' and prov['canonicalSha256']==CANONICAL
        assert prov['sourcePoseOrder']==ORDER and prov['physicalPoses']==3 and prov['newImageRequests']==0
        assert prov['fullGenerationIDsAvailable'] is False and prov['originalPromptBytesArchive']=='original-prompts-exact.zip'
        assert len(prov['sourceGenerations'])==3
        for i,r in enumerate(prov['sourceGenerations']):
            assert r['name']==SOURCE_NAMES[i] and r['sha256']==SOURCE_HASHES[i] and r['promptSha256']==PROMPT_HASHES[i] and r['newGeneration'] is False
            assert not r.get('generationId') and not r.get('invocationId'),'Unavailable full historical IDs must not be invented.'
        sealed=prov.get('sourceHashes',{})
        for name,digest in sealed.items():assert sha(archive/name)==digest,f'Archive seal mismatch: {name}'
        text=(REPO/'src/lib/releasedFormPlacards.ts').read_text()
        match=re.search(r'"kettlebell-swing"\s*:\s*placard\((.*?)\n\s*\),',text,re.S);assert match
        block=match.group(1)
        raw_rows=re.findall(r'\[\s*(\d+(?:\.\d+)?)\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*("(?:\\.|[^"\\])*")\s*\]',block)
        actual=[{'t':float(t),'label':json.loads(label),'cue':json.loads(cue)} for t,label,cue in raw_rows]
        expected=[{k:b[k] for k in ['t','label','cue']} for b in json.loads((SIDE/'draft-beats.json').read_text())]
        assert actual==expected and len(actual)==6
        assert all(len(b['cue'].split())<=7 for b in actual)
        assert '["Glutes", "Hamstrings"]' in block and '["Core", "Lower Back"]' in block
        catalogue=(REPO/'src/lib/exercises.ts').read_text().split('id: "kettlebell-swing",',1)[1].split('\n  },',1)[0]
        instructions=re.search(r'instructions:\s*\[(.*?)\]',catalogue,re.S).group(1)
        setup=[json.loads(x) for x in re.findall(r'"(?:\\.|[^"\\])*"',instructions)][:2]
        assert record['authoredSetupInstructions']==setup
        assert all(json.dumps(s,ensure_ascii=False) in block for s in setup)
        return {'recordedSourceRouteTruthful':True,'noInventedFullGenerationIDs':True,'exactHistoricalPromptsRetainedInZIP':True,'sourceArchiveSealEntriesCurrentlyVerified':len(sealed),'sourceArchiveSealStatus':prov.get('archiveStatus'),'actualPlatformSixCueRowsExact':True,'actualPrimarySecondaryKeyExact':True,'actualPreparationStringsExactlyCatalogueFirstTwoInstructions':True,'writtenPickupScopeHonestlyDisclosed':True}
    check('platform-cues-preparation-and-source-provenance',platform_and_provenance)

    report['sourceArchivePath']=str(archive)
    report['acceptedInputsSha256']=sha(SIDE/'post-registration-audit-inputs.json')
    report['gitAtEnd']={'head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'statusPorcelain':git('status','--porcelain')}
    report['passed']=not report['failures']
    report['limitations']=['This script verifies accepted assets/provenance and schema facts. Root owns integrated public-path playback/mobile review, project checks, CI and actual merge.','Git status is observed, not forced clean during active root registration. No completion credit is assigned by this report.']
    output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'failures':report['failures'],'report':str(output)},indent=2))
    raise SystemExit(0 if report['passed'] else 1)

if __name__=='__main__':main()
