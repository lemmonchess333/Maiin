import json, sys
D="/tmp/work/train/run"
T={t["id"]:t for t in json.load(open(f"{D}/_templates.json"))}
def clock(s):
    s=round(s); return f"{s//60}:{s%60:02d}"
def ab(tid):
    t=T[tid]
    if tid.startswith("run_walk_"): return "RW"+tid[-1]
    if tid.startswith("run_nonstop_"): return "NS"+tid.split("_")[-1]
    if tid.startswith("easy_"):
        p=tid.split("_"); m=int(p[1]); s="s" if len(p)>2 else ""
        return ("ML" if m>=60 else "E")+str(m)+s
    if tid.startswith("tempo_"): return "T"+tid.split("_")[1]
    if tid=="8x400": return "8x400"
    if tid.endswith("x1k"): return tid[0]+"x1k"
    if tid.startswith("long_"): return "L"+tid.split("_")[1][:-1]
    if tid.endswith("_race"): return "RACE"
    return tid
def tmin(tid, easy, table):
    t=T[tid]; c=t["config"]
    if c.get("targetDistanceKm"): 
        if t["type"]=="race": return c["targetDistanceKm"]*(table["race"][{5:"5k",10:"10k",21.1:"half",42.2:"marathon"}[c["targetDistanceKm"]]] if table else easy*0.9)/60
        return c["targetDistanceKm"]*easy/60
    if t["type"]=="intervals":
        iv=c["intervals"]; ip=(sum(table["interval"])/2) if table else easy*0.8
        return (iv["reps"]*iv["workDistance"]/1000*ip + (iv["reps"]-1)*iv["restDuration"] + iv.get("warmupDuration",0)+iv.get("cooldownDuration",0))/60
    if c.get("targetDurationMinutes"): return c["targetDurationMinutes"]
    return t["minutes"]
def tkm(tid, easy, table):
    t=T[tid]; c=t["config"]
    if c.get("targetDistanceKm"): return c["targetDistanceKm"]
    if tid.startswith("run_walk") or tid.startswith("run_nonstop"):
        rw=c["runWalk"]; run=sum(rw["runSecs"]); walk=rw["warmupWalkSec"]+sum(rw["walkSecs"])+rw["cooldownWalkSec"]
        return run/easy + walk/720
    m=tmin(tid,easy,table)
    if t["type"]=="tempo":
        w=sum(c["tempo"]["workSecs"])/60; thr=(sum(table["threshold"])/2) if table else easy*0.87
        return w*60/thr + (m-w)*60/easy
    if t["type"]=="intervals":
        iv=c["intervals"]; km=iv["reps"]*iv["workDistance"]/1000
        rest=((iv["reps"]-1)*iv["restDuration"]+iv.get("warmupDuration",0)+iv.get("cooldownDuration",0))
        return km + rest/ (easy*1.05)
    return m*60/easy
def hardmin(tid, table, easy):
    t=T[tid]; c=t["config"]
    if t["type"]=="tempo": return sum(c["tempo"]["workSecs"])/60
    if t["type"]=="intervals":
        iv=c["intervals"]; ip=(sum(table["interval"])/2) if table else easy*0.8
        return iv["reps"]*iv["workDistance"]/1000*ip/60
    return 0
def main(name, easy_override=None, maxweeks=None, title=None, cols="full"):
    j=json.load(open(f"{D}/{name}.json"))
    table=j["paceTable"]
    r=j["runner"]
    # easy pace: from table, else the runner's own (true vdot) from first run record
    if table: easy=sum(table["easy"])/2
    else:
        own=[x["ownEasy"] for x in j["runs"] if x.get("ownEasy")]
        easy=sum(own[0])/2 if own else 336.0
    print(f"**{title or name}**")
    print()
    weeks=j["runWeeks"]
    if maxweeks: weeks=weeks[:maxweeks]
    print("| Wk | Phase | Sessions (Mon→Sun) | Min | ≈km | Long km | Long % | Δ min | Hard % |")
    print("|---|---|---|---|---|---|---|---|---|")
    prev=None; rec_seen=0
    for i,w in enumerate(weeks):
        if not w["planned"]:
            if w["phase"] is None or w["phase"]=="none" or True:
                print(f"| {w['week']} | {'no plan' if not w['phase'] or w['phase']=='recovery' else w['phase']} | (nothing planned) | 0 | 0 | – | – | – | – |")
            prev=None; continue
        ids=[p.split(":")[1] for p in w["planned"]]
        days=[p.split(":")[0] for p in w["planned"]]
        mins=sum(tmin(x,easy,table) for x in ids); km=sum(tkm(x,easy,table) for x in ids)
        longs=[x for x in ids if T[x]["type"] in("long","race")]
        lm=max([tmin(x,easy,table) for x in longs],default=0)
        lk=max([T[x]["config"].get("targetDistanceKm",0) for x in longs],default=0)
        hm=sum(hardmin(x,table,easy) for x in ids)
        israce=any(T[x]["type"]=="race" for x in ids)
        ph=w["phase"] or "none"
        if w["leadIn"]: ph="lead-in"
        if israce: ph="race"
        elif ph=="recovery": ph="recovery"
        d="" if prev in (None,0) else f"{(mins/prev-1)*100:+.0f}%"
        sess=" · ".join(f"{dd} {ab(x)}" for dd,x in zip(days,ids))
        print(f"| {w['week']} | {ph} | {sess} | {mins:.0f} | {km:.0f} | {lk if lk else '–'} | {('%.0f%%'%(100*lm/mins)) if lm else '–'} | {d} | {('%.0f%%'%(100*hm/mins)) if hm else '0%'} |")
        prev=mins
    print()
if __name__=="__main__":
    args=sys.argv[1:]
    for a in args:
        parts=a.split("@")
        main(parts[0], maxweeks=int(parts[1]) if len(parts)>1 else None)
