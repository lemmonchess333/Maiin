"""Custom illustrative twin 1:1 high-cable towers, finite sheave tangencies.

Screen-space engineering drawing, not a recovered anatomical 3D camera or a
manufacturer replica. Both circuits conserve one cable length between endpoints.
"""
import math
import numpy as np
from PIL import Image,ImageDraw

OUTPUTS=[(-35,-100),(71,-60)]
GRIPS={'A':[(467,744),(654,768)],'B':[(207,306),(416,318)]}
RADIUS=20

def geometry(output,anchor,reach_y):
    ox,oy=output;ax,ay=anchor
    dx,dy=ax-ox,ay-oy;distance=math.hypot(dx,dy)
    phi=math.atan2(dy,dx)-math.acos(RADIUS/distance)
    tangent=(ox+RADIUS*math.cos(phi),oy+RADIUS*math.sin(phi))
    free=math.sqrt(distance*distance-RADIUS*RADIUS)
    arc=RADIUS*(math.pi+phi)
    return {'free':free,'arc':arc,'tangent':tangent,'phi':phi,'reachY':reach_y}

def render(n,pad,canvas,hands):
    eq=Image.new('RGBA',(canvas[0]*4,canvas[1]*4));d=ImageDraw.Draw(eq)
    def pt(v):return ((v[0]+pad[0])*4,(v[1]+pad[1])*4)
    def line(points,fill,w):d.line([pt(v) for v in points],fill=fill,width=round(w*4),joint='curve')
    def box(rect,fill,outline=None,w=1):d.rectangle((*pt(rect[:2]),*pt(rect[2:])),fill=fill,outline=outline,width=round(w*4))
    def ellipse(cx,cy,rx,ry,fill,outline=None,w=1):d.ellipse((*pt((cx-rx,cy-ry)),*pt((cx+rx,cy+ry))),fill=fill,outline=outline,width=round(w*4))
    states=[]
    for j,output in enumerate(OUTPUTS):
        ox,oy=output;cx=ox-RADIUS;reach_y=1110+j*14
        bx,by=GRIPS['B'][j];base=geometry(output,(bx-40,by-63),reach_y)
        x,y=GRIPS[n][j];anchor=(x-40,y-63);g=geometry(output,anchor,reach_y)
        total=(reach_y-oy)+base['arc']+base['free']
        plate_y=oy+total-g['arc']-g['free'];lift=reach_y-plate_y
        box((cx-43,-126+j*40,cx+53,1470),(36,36,41),(100,100,107),2)
        box((cx-34,410,cx+34,1435),(11,11,14),(55,55,62),1)
        for rod in [cx-27,cx+27]:line([(rod,435),(rod,1430)],(124,124,132),3)
        for k in range(10):
            py=reach_y+k*25-(lift if k<3 else 0)
            box((cx-35,py,cx+35,py+21),(69,69,76),(128,128,136),1.5)
            line([(cx-29,py+4),(cx+27,py+4)],(95,95,103),1)
        ellipse(cx+25,plate_y+2*25+10,5,4,(163,163,172))
        line([(ox,oy-22),(ox,oy-43)],(101,101,110),11)
        ellipse(ox,oy,RADIUS,RADIUS,(30,30,36),(124,124,134),2)
        ellipse(ox,oy,5,5,(153,153,165))
        # Continuous vertical load branch, actual sheave wrap, tangent free span.
        arc_points=[(ox+RADIUS*math.cos(a),oy+RADIUS*math.sin(a))
                    for a in np.linspace(math.pi,2*math.pi+g['phi'],65)]
        line([(cx,plate_y),(cx,oy)]+arc_points+[anchor],(162,162,173),2.4)
        # Cable attaches to top selected plate, not to unselected bottom stack.
        ellipse(cx,plate_y,4,5,(138,138,149))
        line([(cx-57,1474),(cx+72,1474)],(84,84,94),14)
        # The same grey D-handles are behind the unchanged original closed hands.
        line([(x-35,y),anchor,(x+35,y)],(149,149,161),4.5)
        line([(x-35,y),(x+35,y)],(66,66,77),12)
        line([(x-33,y-4),(x+33,y-4)],(136,136,151),1.5)
        ellipse(anchor[0],anchor[1],5,7,None,(171,171,185),2.5)
        actual=(plate_y-oy)+g['arc']+g['free']
        states.append({'circuit':j,'ratio':'1:1','radiusPx':RADIUS,
            'output':output,'handleCableAnchor':anchor,'tangentPoint':g['tangent'],
            'wrapRadians':math.pi+g['phi'],'freeLengthPx':g['free'],
            'topSelectedPlateY':plate_y,'loadRisePx':lift,
            'constantCableLengthPx':total,'constantPathResidualPx':actual-total})
    eq=eq.resize(canvas,Image.Resampling.LANCZOS)
    arr=np.array(eq);reg=arr[pad[1]:pad[1]+1536,pad[0]:pad[0]+1024]
    reg[hands,3]=0
    return Image.fromarray(arr),states
