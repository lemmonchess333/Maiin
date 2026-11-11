import json, sys, glob, os
D="/tmp/work/train/run"
T={t["id"]:t for t in json.load(open(f"{D}/_templates.json"))}
for f in sorted(glob.glob(f"{D}/p*.json")):
    j=json.load(open(f)); name=os.path.basename(f)[:-5]
    sp=[(r["date"],r["templateId"],round(r["done"]["km"],1),round(r["longestBefore"],1),round(r["done"]["km"]/r["longestBefore"],2)) for r in j["runs"] if r["longestBefore"]>0 and r["done"]["km"]>1.1*r["longestBefore"]]
    longs=[(r["date"][5:],r["templateId"],round(r["done"]["km"],1),round(r["done"]["minutes"])) for r in j["runs"] if r["type"] in("long","race")]
    print("##",name)
    print("  spikes(>1.1x 30d longest):", [(d[5:],t,k,f"x{ra}") for d,t,k,lb,ra in sp])
    print("  long/race runs done:", [f"{d} {k}km/{m}m" for d,t,k,m in longs])
