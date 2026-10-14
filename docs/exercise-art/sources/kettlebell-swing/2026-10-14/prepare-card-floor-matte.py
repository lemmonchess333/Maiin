from pathlib import Path
import json
r=Path(__file__).resolve().parent
source=(r/'stage-card.mts').read_text()
needle='const box=contentBox(rgba,width,height);'
assert source.count(needle)==1
cleanup='''
// One background-only card correction. Strong light lower-body pixels seed
// the retained matte; a two-pixel native grow preserves their dark outline.
// Original RGB and the frame WebPs remain unchanged. Abovey810 the standard
// keyed alpha remains unchanged, including the original dark kettlebell.
const lowForeground=new Uint8Array(width*height);
for(let i=0;i<lowForeground.length;i++){const p=i*4;lowForeground[i]=Math.max(rgba[p],rgba[p+1],rgba[p+2])>110?1:0;}
const closed=squareFilter(squareFilter(lowForeground,width,height,1,"max"),width,height,1,"min");
const retained=squareFilter(closed,width,height,2,"max");
for(let y=810;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!retained[i])rgba[i*4+3]=0;}
await sharp(rgba,{raw:{width,height,channels:4}}).png().toFile(PREPARED_PATH);
'''.replace('PREPARED_PATH',json.dumps(str(r/'prepared-card-source.png')))
source=source.replace(needle,cleanup+needle)
source=source.replace('algorithmSource:"scripts/art/cut-out-form-art.ts"','algorithmSource:"scripts/art/cut-out-form-art.ts",preparedCardSource:"prepared-card-source.png",backgroundOnlyCorrection:{fromNativeY:810,brightSeed:110,closeRadius:1,growRadius:2,originalRGBUnchanged:true,humanPoseEdited:false}')
(r/'stage-prepared-card.mts').write_text(source)
print('Prepared one card-floor alpha-only correction; original reference/frame RGB unchanged.')
