import json, sys
rows = json.load(open(sys.argv[1]))
pats = sys.argv[2:]
def fmt(e):
    r = f"{e['reps']}" + (f"-{e['max']}" if e.get('max') else "") + (e.get('unit') or "")
    s = f"{e['name']} {e['sets']}x{r} @{e['w']}"
    if not e['acc']: s += " [M]"
    if e.get('from'): s += f" <-{e['from']}"
    return s
for r in rows:
    if pats and not any(p in r['label'] for p in pats): continue
    print("=== ", r['label'])
    if 'error' in r:
        print("  ERROR", r['error']); continue
    tot = sum(sum(e['sets'] for e in d['ex']) for d in r['days'])
    print(f"  days={len(r['days'])} totalSets={tot} vol=" + ", ".join(f"{v['muscle']}:{v['sets']}" for v in r['volume']))
    for d in r['days']:
        print(f"  -- {d['name']} ({d['type']}/{d.get('role')}) n={len(d['ex'])} sets={sum(e['sets'] for e in d['ex'])} est={d['minutes']}min")
        for e in d['ex']:
            print("       ", fmt(e))
            if e.get('notes'): print("            note:", e['notes'])
