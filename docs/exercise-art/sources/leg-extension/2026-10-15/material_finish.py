"""RGB-only material shading and source-tonal body colour mapping.

Mesh vertices, raster coverage, camera, depth order and body positions are inputs,
never authored here. The equipment finish uses an illustration softbox/edge
shader, not a recovered photometric calibration of the generated source.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE=Path(__file__).resolve().parent
PRIMARY=np.array([123.,114.,233.])
SECONDARY=np.array([149.,144.,224.])

def colour_finish(base,reference):
    a=np.array(base.convert('RGBA'));rgb=a[:,:,:3].astype(float)
    ref=np.array(reference.convert('RGBA'))
    primary=(ref[:,:,3]>0)&np.all(ref[:,:,:3]==PRIMARY,axis=2)
    secondary=(ref[:,:,3]>0)&np.all(ref[:,:,:3]==SECONDARY,axis=2)
    maximum=rgb.max(2)
    # Exactly the original chromatic support, labelled by the prior semantic
    # role map. Neutral pixels are excluded. No polygon or spatial body gradient.
    chromatic=(rgb[:,:,2]-rgb[:,:,0]>=2)&(rgb[:,:,2]-rgb[:,:,1]>=3)
    primary&=chromatic;secondary&=chromatic
    support=primary|secondary
    chroma=(maximum-rgb[:,:,1])/np.maximum(maximum,1)
    neutral=maximum[:,:,None]
    # One common strength normalization for both native sources. All output
    # shading comes from that pixel's original maximum and original chroma.
    pc=neutral+(PRIMARY*maximum[:,:,None]/255-neutral)*np.minimum(chroma/.64,1)[:,:,None]
    sc=neutral+(SECONDARY*maximum[:,:,None]/255-neutral)*np.minimum(chroma/.42,1)[:,:,None]
    layer=np.zeros_like(a)
    layer[primary,:3]=np.rint(np.clip(pc[primary],0,255)).astype('uint8')
    layer[secondary,:3]=np.rint(np.clip(sc[secondary],0,255)).astype('uint8')
    layer[support,3]=255
    result=np.array(Image.alpha_composite(base.convert('RGBA'),Image.fromarray(layer)))
    assert np.array_equal(result[~support],a[~support])
    assert np.array_equal(result[:,:,3],a[:,:,3])
    details={'method':'Source-local maximum-channel and chroma remapping to canonical palette bases, following the Calf source-tonal method. No spatial body shading function.','canonicalBases':{'primary':'#7B72E9','secondary':'#9590E0'},'strengthDenominators':{'primary':.64,'secondary':.42},'primaryPixels':int(primary.sum()),'secondaryPixels':int(secondary.sum()),'primaryOutputUniqueRgb':int(len(np.unique(layer[primary,:3],axis=0))),'primaryOutputExactlyFlatCanonicalRgb':int(np.all(layer[primary,:3]==PRIMARY,axis=1).sum()),'sourcePrimaryMaximumRange':[float(maximum[primary].min()),float(maximum[primary].max())],'allOutsideOriginalColourSupportRgbaExact':True,'originalAlphaExact':True,'sourceRoleCoordinatesUnchanged':True,'newSpatialBodyGradient':False}
    return Image.fromarray(layer),details

def _unit(a):return a/np.linalg.norm(a)

def render(faces,size,aa,project):
    """Same painter mesh/raster silhouette, illustrated neutral metal RGB only."""
    dimensions=(size[0]*aa,size[1]*aa)
    styled=Image.new('RGBA',dimensions)
    matte=Image.new('L',dimensions)
    matte_draw=ImageDraw.Draw(matte)
    light=_unit(np.array([-.35,-.5,-.8]))
    view=np.array([0.,0.,-1.]);half=_unit(light+view)
    grain=np.asarray(Image.open(HERE/'inputs/source-metal-highpass.png').convert('L')).astype(float)-128
    for vertices,normal,base in sorted(faces,key=lambda f:float(np.mean([p[2] for p in f[0]])),reverse=True):
        polygon=np.array([project(p)*aa for p in vertices])
        matte_draw.polygon([tuple(p) for p in polygon],fill=255)
        left=max(0,int(math.floor(polygon[:,0].min()))-2)
        top=max(0,int(math.floor(polygon[:,1].min()))-2)
        right=min(dimensions[0],int(math.ceil(polygon[:,0].max()))+3)
        bottom=min(dimensions[1],int(math.ceil(polygon[:,1].max()))+3)
        if left>=right or top>=bottom:continue
        mask=Image.new('L',(right-left,bottom-top))
        ImageDraw.Draw(mask).polygon([tuple(p-[left,top]) for p in polygon],fill=255)
        yy,xx=np.indices((bottom-top,right-left),dtype=float)
        xx=(xx+left+.5)/aa;yy=(yy+top+.5)/aa
        native=polygon/aa
        diffuse=max(0,float(normal@light))
        specular=max(0,float(normal@half))
        wide=(native[:,0].max()-native[:,0].min())
        high=(native[:,1].max()-native[:,1].min())
        # Brushed reflection bands and fine metal grain are equipment material,
        # anchored to the unchanged common image camera. Not a body gradient.
        uv=(yy-native[:,1].min())/max(high,1) if wide>high*3 else (xx-native[:,0].min())/max(wide,1)
        reflection=17*np.exp(-((uv-.22)/.16)**2)-9*np.exp(-((uv-.76)/.25)**2)
        texture=grain[np.floor(yy).astype(int)%grain.shape[0],np.floor(xx).astype(int)%grain.shape[1]]
        if base>=100:
            shade=base*(.64+.32*diffuse)+58*specular**32+reflection+texture*.7
        else:
            shade=base*(.53+.36*diffuse)+14*specular**18+reflection*.32+texture*.35
        distance=np.full_like(xx,np.inf)
        closest_light=np.zeros_like(xx)
        perimeter=0.
        for i,a in enumerate(native):
            b=native[(i+1)%len(native)];edge=b-a
            length=float(np.linalg.norm(edge));perimeter+=length
            if length<1e-9:continue
            t=np.clip(((xx-a[0])*edge[0]+(yy-a[1])*edge[1])/(length*length),0,1)
            dx=xx-(a[0]+t*edge[0]);dy=yy-(a[1]+t*edge[1])
            q=np.sqrt(dx*dx+dy*dy)
            chosen=q<distance
            # Narrow normal-map bevel/highlight is inside unchanged coverage.
            edge_lit=.55+.45*abs((-edge[1]*light[0]+edge[0]*light[1])/length)
            closest_light[chosen]=edge_lit;distance=np.minimum(distance,q)
        area=abs(float(np.dot(native[:,0],np.roll(native[:,1],-1))-np.dot(native[:,1],np.roll(native[:,0],-1))))/2
        # Do not outline every narrow cylindrical mesh facet. Only broad flats
        # and actual endcaps get this source-frame-like fine edge treatment.
        if area/max(perimeter,1)>2.5:
            shade+=45*closest_light*np.exp(-distance/.55)-15*np.exp(-((distance-1.65)/.6)**2)
        grey=np.rint(np.clip(shade,12,220)).astype('uint8')
        tile=Image.fromarray(np.dstack([grey,grey,grey,np.asarray(mask)]))
        styled.paste(tile,(left,top),mask)
    styled=styled.resize(size,Image.Resampling.LANCZOS)
    # Pin coverage to the exact same original polygon rasterizer independently
    # of material RGB. No silhouette, alpha, edge position or depth mask changes.
    styled.putalpha(matte.resize(size,Image.Resampling.LANCZOS))
    return styled
