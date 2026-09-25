import re,glob,sys
V4='ui/apps/v4/'; UI=V4+'registry/new-york-v4/ui/'
LAYOUT=re.compile(r'^(-?m[trblxyse]?-|flex$|inline-flex$|grid$|block$|hidden$|flex-|grid-|items-|justify-|self-|place-|gap-|w-|min-w-|max-w-|size-|relative$|absolute$|fixed$|sticky$|inset|top-|left-|right-|bottom-|z-|overflow|shrink|grow|order-|col-|row-|text-(left|center|right|start|end)$|@container|group|peer|whitespace|truncate$|outline-none$|select-none$|transition|duration|ease|animate|cursor|pointer-events|\[&|\*|has-|data-|aria-|focus|hover|disabled|dark|sm|md|lg|xl|file|placeholder|selection)')
def app(cls): return {c for c in cls if not LAYOUT.match(c)}
sigs={}
for f in glob.glob(UI+'*.tsx'):
    src=open(f).read()
    for m in re.finditer(r'function (\w+)\s*\(', src):
        name=m.group(1)
        if not name[0].isupper(): continue
        body=src[m.end():m.end()+3000]; nxt=re.search(r'\nfunction ',body); body=body[:nxt.start()] if nxt else body
        s=re.search(r'cn\((.*?)className',body,re.S)
        if s:
            strs=re.findall(r'"([^"]+)"',s.group(1)); sigs[name]=app(set(' '.join(strs).split()))
    for m in re.finditer(r'const (\w+)Variants\s*=\s*cva\(\s*"([^"]+)"(.*?)\n\)', src, re.S):
        ds=re.findall(r'default:\s*"([^"]+)"',m.group(3))
        sigs[m.group(1)+'(cva default)']=app(set((m.group(2)+' '+' '.join(ds[:2])).split()))
sigs={k:v for k,v in sigs.items() if len(v)>=4}
files=[]
for p in sys.argv[1:]: files+= glob.glob(p+'/**/*.tsx',recursive=True)
n=0; hits=[]
for f in files:
    if 'new-york-v4/ui/' in f: continue
    src=open(f).read()
    for m in re.finditer(r'<([a-z][a-z0-9]*)\b[^<>]*?className="([^"]+)"', src, re.S):
        n+=1; cls=app(set(m.group(2).split())); line=src[:m.start()].count('\n')+1
        best=None
        for name,sig in sigs.items():
            inter=len(cls&sig); cov=inter/len(sig)
            if inter>=4 and cov>=0.6 and (best is None or cov>best[1]): best=(name,cov,inter,len(sig),sorted(cls&sig))
        if best: hits.append((f.replace(V4,''),line,m.group(1),best))
for h in hits: print(f"{h[0]}:{h[1]} <{h[2]}> ~ {h[3][0]} cov={h[3][1]:.2f} shared={h[3][2]}/{h[3][3]} {h[3][4]}")
print('TOTAL hits',len(hits),'of raw static-className elements',n,'signatures',len(sigs),file=sys.stderr)
