"""Palette-region masks follow source contours using labelled anatomical seeds."""
import heapq
import numpy as np
SEEDS={
 'A':{0:[(480,543),(488,526)],1:[(462,514),(516,545),(539,545),(558,548)],2:[(530,565),(549,585)]},
 'B':{0:[(472,508),(503,475)],1:[(484,439),(528,520),(516,530),(533,541),(526,494)],2:[(532,559),(569,571),(575,528)]},
 'C':{0:[(450,455),(491,433)],1:[(479,402),(490,481),(500,504),(512,520)],2:[(469,511),(522,489),(477,549),(488,575)]},
 'D':{0:[(505,384),(534,352)],1:[(521,332),(553,375),(570,380),(602,388)],2:[(550,411),(588,432)]},
 'E':{0:[(579,312),(610,327)],1:[(558,282),(589,352),(589,376),(587,402)],2:[(562,375),(548,423),(610,368)]},
 'F':{0:[(746,278),(710,278)],1:[(712,247),(720,308),(720,328),(720,351)],2:[(749,329),(758,362)]}}
def regions(name,rgb,violet):
    h,w=violet.shape;grad=np.zeros((h,w),float)
    for dy,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
        grad=np.maximum(grad,np.max(np.abs(rgb-np.roll(np.roll(rgb,dy,0),dx,1)),2))
    owner=np.full((h,w),-1,np.int8);best=np.full((h,w),np.inf);distance=np.full((h,w),np.inf);queue=[]
    ys,xs=np.where(violet)
    for role,points in SEEDS[name].items():
        for x,y in points:
            j=np.argmin((xs-x)**2+(ys-y)**2);a,b=int(ys[j]),int(xs[j]);best[a,b]=0;distance[a,b]=0;owner[a,b]=role;heapq.heappush(queue,(0,0,a,b,role))
    while queue:
        cost,dist,y,x,role=heapq.heappop(queue)
        if cost!=best[y,x] or dist!=distance[y,x]:continue
        for a,b in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
            if not(0<=a<h and 0<=b<w and violet[a,b]):continue
            c=max(cost,round(float(grad[a,b]),1));d=dist+1
            if (c,d)<(best[a,b],distance[a,b]):
                best[a,b]=c;distance[a,b]=d;owner[a,b]=role;heapq.heappush(queue,(c,d,a,b,role))
    # Small disconnected source-colour flecks inherit the nearest reviewed seed.
    for y,x in zip(*np.where(violet&(owner<0))):
        owner[y,x]=min(( (x-a)**2+(y-b)**2,role) for role,pts in SEEDS[name].items() for a,b in pts)[1]
    return violet&(owner==1),violet&(owner==2),violet&(owner==0)
