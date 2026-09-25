import json,re,collections,sys
def load(lab):
    out=[]
    for x in json.load(open(f"out/{lab}.json"))["diagnostics"]:
        m=x['message']; code=x['code']
        sp=x['labels'][0]['span'] if x['labels'] else {'line':0,'offset':0,'length':0}
        cls=None
        if code.startswith('better-tailwindcss'):
            mm=re.search(r'Unknown class detected: (\S+)',m) or re.search(r'Replace "([^"]+)"',m) or re.search(r'The classes: "([^"]+)"',m)
            cls=mm.group(1) if mm else None
        else:
            mm=re.search(r'"([^"]+)"',m); cls=mm.group(1) if mm else None
        out.append(dict(tool=code.split('(')[0],rule=code.split('(')[1][:-1],file=x['filename'],line=sp['line'],off=sp['offset'],len=sp['length'],cls=cls,msg=m))
    return out
otw=load('otw-all'); sh=load('shadcn-all-cold'); bt=load('btw-rec-cold')
def inui(d): return d['file'].startswith('registry/new-york-v4/ui/')
def cmp(name,A,B,la,lb,keyf):
    ka=collections.Counter(keyf(d) for d in A); kb=collections.Counter(keyf(d) for d in B)
    both=sum((ka&kb).values()); ua=sum((ka-kb).values()); ub=sum((kb-ka).values())
    print(f"{name}: {la}={len(A)} {lb}={len(B)} overlap={both} only-{la}={ua} only-{lb}={ub}")
    return ka,kb
def base(c):
    # strip variants and important for class identity
    if c is None: return None
    return c
sel=lambda L,t,r: [d for d in L if d['rule'] in r]
# unknown classes
U_o=sel(otw,'','no-unknown-classes'.split()); U_s=sel(sh,'',['no-unknown-classes']); U_b=sel(bt,'',['no-unknown-classes'])
U_s_restyle=[d for d in sh if d['rule']=='no-restyle' and 'grammar does not recognize' in d['msg']]
print("shadcn no-restyle 'grammar does not recognize' (unknown via restyle):",len(U_s_restyle))
k_fc=lambda d:(d['file'],d['cls'])
k_flc=lambda d:(d['file'],d['line'],d['cls'])
k_fl=lambda d:(d['file'],d['line'])
for nm,kf in [('file+class',k_fc),('file+line+class',k_flc)]:
    cmp('UNKNOWN otw vs shadcn(unknown+restyle-unrecognized) '+nm,U_o,U_s+U_s_restyle,'otw','shadcn',kf)
    cmp('UNKNOWN otw vs btw '+nm,U_o,U_b,'otw','btw',kf)
    cmp('UNKNOWN shadcn vs btw '+nm,U_s+U_s_restyle,U_b,'shadcn','btw',kf)
# arbitrary (exclude ui dir since shadcn override disables there)
A_o=[d for d in otw if d['rule']=='no-arbitrary-value' and not inui(d)]
A_s=[d for d in sh if d['rule']=='no-arbitrary-values' and not inui(d)]
for nm,kf in [('file+class',k_fc),('file+line+class',k_flc)]:
    cmp('ARBITRARY (non-ui) '+nm,A_o,A_s,'otw','shadcn',kf)
# colors
C_o=[d for d in otw if d['rule'] in ('no-hardcoded-colors','prefer-theme-tokens')]
C_s=[d for d in sh if d['rule']=='no-raw-colors']
cmp('COLORS file+class',C_o,C_s,'otw','shadcn',k_fc)
# deprecated
cmp('DEPRECATED file+class',sel(otw,'',['no-deprecated-classes']),sel(bt,'',['no-deprecated-classes']),'otw','btw',k_fc)
# canonical: compare by file+line only (btw reports per class)
Co=sel(otw,'',['enforce-canonical','enforce-shorthand']); Cb=sel(bt,'',['enforce-canonical-classes'])
print('CANONICAL otw',len(Co),'btw',len(Cb),'btw unique (file,line,msg)',len(set((d['file'],d['line'],d['msg']) for d in Cb)))
json.dump(dict(otw=otw,sh=sh,bt=bt),open('out/norm.json','w'))
