import json, sys, os
D="/tmp/work/train/run"
T={t["id"]:t for t in json.load(open(f"{D}/_templates.json"))}
DAY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
def clock(s):
    s=round(s); return f"{s//60}:{s%60:02d}"
def tmin(tid, easy):
    t=T[tid]; c=t["config"]
    if c.get("targetDistanceKm"): return c["targetDistanceKm"]*easy/60
    if c.get("targetDurationMinutes"): return c["targetDurationMinutes"]
    return t["minutes"]
def tkm(tid, easy, table):
    t=T[tid]; c=t["config"]
    if c.get("targetDistanceKm"): return c["targetDistanceKm"]
    m=tmin(tid,easy)
    # quality: approximate: work at threshold/interval pace
    if t["type"]=="tempo" and table:
        w=sum(c["tempo"]["workSecs"])/60; thr=sum(table["threshold"])/2
        return w*60/thr + (m-w)*60/easy
    if t["type"]=="intervals" and table:
        iv=c["intervals"]; km=iv["reps"]*iv["workDistance"]/1000
        ip=sum(table["interval"])/2
        return km + max(0,(m-km*ip/60))*60/easy*0.6
    return m*60/easy
def hardmin(tid, table, easy):
    t=T[tid]; c=t["config"]
    if t["type"]=="tempo": return sum(c["tempo"]["workSecs"])/60
    if t["type"]=="intervals":
        iv=c["intervals"]; ip=(sum(table["interval"])/2) if table else easy*0.85
        return iv["reps"]*iv["workDistance"]/1000*ip/60
    if t["type"]=="race": return tmin(tid,easy)
    return 0
def main(name, full=False):
    j=json.load(open(f"{D}/{name}.json"))
    table=j["paceTable"]
    easy=(sum(table["easy"])/2) if table else 336.0  # nominal 5:36
    print(f"## {name}")
    r=j["runner"]; a=j["answers"]
    print(f"runner VDOT {r['vdot']} · {r['weeklyMinutes']} min/wk · longest {r.get('longestRunKm','-')} km · {a.get('runFrequency')} · {a.get('runMode')} · {a.get('weeklyRunDays')} runs/wk · race {a.get('raceDistance','-')} {a.get('raceTargetDate','-')}")
    if table:
        print("paces: easy %s-%s  M %s-%s  T %s-%s  I %s-%s  R %s-%s | predicted 5k %s 10k %s half %s mar %s"%(
          clock(table['easy'][0]),clock(table['easy'][1]),clock(table['marathon'][0]),clock(table['marathon'][1]),
          clock(table['threshold'][0]),clock(table['threshold'][1]),clock(table['interval'][0]),clock(table['interval'][1]),
          clock(table['repetition'][0]),clock(table['repetition'][1]),
          clock(table['race']['5k']),clock(table['race']['10k']),clock(table['race']['half']),clock(table['race']['marathon'])))
    else: print("paces: NONE (no benchmark) — nominal 5:36/km used for minutes")
    if j["baseline"]: print("baseline:", j["baseline"])
    if j["breaks"]: print("breaks (weeks off):", j["breaks"], "awayFromApp" if j["awayFromApp"] else "opens app")
    print("coaching findings:", j["coaching"], "| rule failures:", len(j["failures"]))
    print("| wk | start | phase | runs (day:session) | min | km | long km | long % | Δmin | Q | hard% | done |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    prev=None
    weeks=j["runWeeks"]
    for i,w in enumerate(weeks):
        mins=sum(tmin(p.split(":")[1],easy) for p in w["planned"])
        km=sum(tkm(p.split(":")[1],easy,table) for p in w["planned"])
        longs=[p.split(":")[1] for p in w["planned"] if T[p.split(":")[1]]["type"] in("long","race")]
        lm=max([tmin(x,easy) for x in longs],default=0)
        lk=max([T[x]["config"].get("targetDistanceKm",0) for x in longs],default=0)
        hm=sum(hardmin(p.split(":")[1],table,easy) for p in w["planned"] if T[p.split(":")[1]]["type"] in ("tempo","intervals"))
        ph = "lead-in" if w["leadIn"] else (w["phase"] or "none")
        if w["planWeek"] is not None and w["totalWeeks"]: ph+=f" {w['planWeek']+1}/{w['totalWeeks']}"
        d = "" if prev in (None,0) else f"{(mins/prev-1)*100:+.0f}%"
        to = weeks[i+1]["weekStart"] if i+1<len(weeks) else "9999"
        runs=[x for x in j["runs"] if w["weekStart"]<=x["date"]<to]
        dk=sum(x["done"]["km"] for x in runs); inj=[x for x in runs if x["done"]["injury"]]
        donetxt=f"{len(runs)}/{len(w['planned'])} {dk:.0f}km"+(" INJ" if inj else "")
        print(f"| {w['week']} | {w['weekStart'][5:]} | {ph} | {' · '.join(w['planned'])} | {mins:.0f} | {km:.0f} | {lk:g} | {('%.0f%%'%(100*lm/mins)) if mins and lm else '-'} | {d} | {w['quality']} | {('%.0f%%'%(100*hm/mins)) if mins else '-'} | {donetxt} |")
        prev=mins
    for e in j["events"]:
        if "loaded" in e or "took" in e or "picked up" in e: continue
        print("  ·", e)
    races=[x for x in j["runs"] if x.get("raceTimeS")]
    for x in races: print(f"  race {x['date']} {x['templateId']} {clock(x['raceTimeS'])} (true VDOT {x['trueVdot']:.1f}), longest in prior 30d {x['longestBefore']:.1f} km")
    print()
if __name__=="__main__":
    for n in sys.argv[1:]: main(n)
