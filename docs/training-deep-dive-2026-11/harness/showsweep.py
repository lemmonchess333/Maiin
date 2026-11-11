import json, sys
rows=[json.loads(l) for l in open('/tmp/work/train/adapt-sweep.jsonl')]
def find(**kw):
    for r in rows:
        if all(r[k]==v for k,v in kw.items()): yield r
def show(r):
    print(f"=== {r['g']} {r['l']} {r['d']}d {r['m']}min {r['k']}{'+bar' if r['b'] else ''} inj={r['inj'] or '-'} | vol " + ", ".join(f"{k}:{v}" for k,v in r['vol'].items()))
    for d in r['days']:
        print(f"  -- {d['n']} ({d['r']}) est={d['s']/60:.0f}")
        for x in d['x']:
            rr=f"{x[2]}" + (f"-{x[3]}" if x[3] else "")
            print(f"       {x[0]} {x[1]}x{rr} @{x[4]}{'' if x[5] else ' [M]'}{' <-'+x[7] if x[7] else ''} {x[8]}")
if __name__=='__main__':
    args=dict(a.split('=') for a in sys.argv[1:])
    kw={}
    for k,v in args.items():
        if k in('m','d'): kw[k]=int(v)
        elif k=='b': kw[k]= v=='1'
        elif k=='has': continue
        elif k=='n': continue
        else: kw[k]=v
    n=0
    for r in find(**kw):
        if 'has' in args and not any(x[0]==args['has'] for d in r['days'] for x in d['x']): continue
        show(r); n+=1
        if n>=int(args.get('n',2)) if 'n' in args else n>=2: break
