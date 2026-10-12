"""Genereert assets + js/data.js voor de webapp uit de gedecomprimeerde AI-data van Sheets_PrintReady.
Gebruik: python3 build_webapp.py <sheets.ai> <webapp-map>"""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai2svg import Conv, read_ops, fmt, decompress_ai

src, app = sys.argv[1], sys.argv[2]
A = os.path.join(app, 'assets')
for d in ('tokens', 'sheets'): os.makedirs(os.path.join(A, d), exist_ok=True)
lines = [l for l in decompress_ai(src) if not l.startswith('%_')]
full = '\n'.join(decompress_ai(src))
PT2MM = 25.4 / 72

# ---- artboards
abs_ = re.findall(r'%_\((.*?)\) /UnicodeString \(Name\) ,\n%_1 /Real \(PAR\) ,\n%_(\S+) (\S+) /RealPointRelToROrigin\n%_ \(PositionPoint1\) ,\n%_(\S+) (\S+) /RealPointRelToROrigin', full)
artboards = {n: dict(x0=float(a), y1=float(b), x1=float(c), y0=float(d)) for n, a, b, c, d in abs_}
fronts = [n for n in artboards if not n.endswith('_Back')]

# ---- size classes from symbol frames
SIZES = [('S', 'Klein', 'kleine'), ('M', 'Middel', 'middelgrote'), ('L', 'Groot', 'grote'), ('XL', 'Extra groot', 'extra grote')]
syms = {}; i = 0
while i < len(lines):
    if lines[i].startswith('%AI14_BeginSymbol'):
        name = lines[i+1].strip()[1:-1]; j = i + 2; body = []
        while not lines[j].startswith('%AI10_EndSymbol'): body.append(lines[j]); j += 1
        syms[name] = body; i = j
    i += 1

def slug(n): return re.sub(r'[^A-Za-z0-9]+', '_', n).strip('_')
def nice(n):
    n = re.sub(r'[_ ]?Size[_ ]?[A-Z](?![a-z])', '', n)
    n = n.replace('FireTrack', 'FireTruck').replace('Firetruck', 'FireTruck')
    n = re.sub(r'[_ ]?Type[_ ]?(\d+)', r' type \1', n).replace('_', ' ')
    n = re.sub(r'([a-z])([A-Z])', r'\1 \2', n)
    return re.sub(r'\s+', ' ', n).strip()

# mirror flag on the back side, taken from the instances in the sheet file
mirror = {}
for n, a, ty in re.findall(r'\((.*?)\)  /SymbolRef ,\n+(\S+) \S+ \S+ \S+ \S+ (\S+) /RTransformMatrix', full):
    if float(ty) < -10: mirror[n] = mirror.get(n, False) or float(a) < 0

tokens = []; frames = {}
for name, body in syms.items():
    c = Conv().run(body)
    nums = [float(x) for x in re.findall(r'-?\d*\.?\d+', c.cutline or '')]
    xs, ys = nums[0::2], nums[1::2]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); w, h = x1 - x0, y1 - y0
    frames[name] = (w, h)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%smm" height="%smm" preserveAspectRatio="none">'
           '<defs><clipPath id="f_%s"><rect x="%s" y="%s" width="%s" height="%s"/></clipPath></defs>'
           '<g clip-path="url(#f_%s)" style="isolation:isolate">%s</g></svg>') % (
        fmt(x0), fmt(y0), fmt(w), fmt(h), fmt(w * PT2MM), fmt(h * PT2MM), slug(name), fmt(x0), fmt(y0), fmt(w), fmt(h), slug(name), c.svg_body(prefix=slug(name) + '_c'))
    fn = slug(name) + '.svg'
    open(os.path.join(A, 'tokens', fn), 'w').write(svg)
    tokens.append(dict(id=slug(name), name=nice(name), source=name, file='assets/tokens/' + fn, w=w, h=h, mirrorBack=mirror.get(name, True)))

# distinct frame sizes, smallest area first
dims = []
for w, h in sorted(frames.values(), key=lambda d: d[0] * d[1]):
    if not any(abs(w - a) < 1 and abs(h - b) < 1 for a, b in dims): dims.append((w, h))
sizes = []
for k, (w, h) in enumerate(dims):
    key, label, adj = SIZES[k] if k < len(SIZES) else ('S%d' % k, 'Maat %d' % (k + 1), 'maat %d' % (k + 1))
    sizes.append(dict(id=key, label=label, adj=adj, w=round(w * PT2MM, 1), h=round(h * PT2MM, 1), _w=w, _h=h))
def size_of(w, h):
    for s in sizes:
        if abs(w - s['_w']) < 1.5 and abs(h - s['_h']) < 1.5: return s['id']
    return None
for t in tokens:
    t['size'] = size_of(t.pop('w'), t.pop('h'))

# ---- slots from the Dieline layer (Cutline rectangles)
def layer(name):
    s = [k for k, l in enumerate(lines) if l.strip() == '(%s) Ln' % name][0]; e = s
    while not lines[e].startswith('%AI5_EndLayer'): e += 1
    return lines[s + 1:e]
rects = []; pts = []
for l in layer('Dieline'):
    p = l.split()
    if not p: continue
    op = p[-1]
    if op == 'm': pts = [(float(p[0]), float(p[1]))]
    elif op in ('L', 'l'): pts.append((float(p[0]), float(p[1])))
    elif op in ('s', 'S') and pts:
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        rects.append((min(xs), min(ys), max(xs), max(ys))); pts = []

def tf_for(ab):
    a = artboards[ab]; return lambda x, y: (x - a['x0'], a['y1'] - y)

sheets = []
for n_i, ab in enumerate(fronts):
    a = artboards[ab]; W = a['x1'] - a['x0']; H = a['y1'] - a['y0']
    seen = set(); slots = []
    for x0, y0, x1, y1 in rects:
        if x0 >= a['x0'] - 1 and x1 <= a['x1'] + 1 and y0 >= a['y0'] - 1 and y1 <= a['y1'] + 1:
            key = (round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1))
            if key in seen: continue
            seen.add(key)
            slots.append(dict(x=round((x0 - a['x0']) * PT2MM, 2), y=round((a['y1'] - y1) * PT2MM, 2),
                              w=round((x1 - x0) * PT2MM, 2), h=round((y1 - y0) * PT2MM, 2), size=size_of(x1 - x0, y1 - y0)))
    slots.sort(key=lambda s: (round(s['y']), s['x']))
    # background + marks (Marges layer: sheet outline / bleed)
    for lay, suffix in (('BG', 'bg'), ('Marges', 'marks')):
        c = Conv(tf_for(ab)).run(layer(lay))
        def inside(nd):
            nums = [float(v) for v in re.findall(r'-?\d*\.?\d+', nd.attrs.get('d', ''))]
            xs = nums[0::2]; ys = nums[1::2]
            return xs and min(xs) > -5 and max(xs) < W + 5 and min(ys) > -5 and max(ys) < H + 5
        def prune(nd):
            nd.children = [ch for ch in nd.children if (ch.kind != 'path' and prune(ch)) or (ch.kind == 'path' and inside(ch))]
            nd.clip = [d for d in nd.clip]
            return nd.children
        prune(c.root)
        open(os.path.join(A, 'sheets', 'sheet%d_%s.svg' % (n_i + 1, suffix)), 'w').write(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" preserveAspectRatio="none">%s</svg>' % (fmt(W), fmt(H), c.svg_body(prefix='m%d' % n_i)))
    allowed = sorted(set(s['size'] for s in slots), key=[z['id'] for z in sizes].index)
    sheets.append(dict(id='sheet%d' % (n_i + 1), name='Sheet %d' % (n_i + 1), artboard=ab, w=round(W * PT2MM, 2), h=round(H * PT2MM, 2),
                       bg='assets/sheets/sheet%d_bg.svg' % (n_i + 1), marks='assets/sheets/sheet%d_marks.svg' % (n_i + 1),
                       sizes=allowed, slots=slots))

for s in sizes: s.pop('_w'); s.pop('_h')
tokens.sort(key=lambda t: ([z['id'] for z in sizes].index(t['size']), t['name']))
data = dict(sizes=sizes, tokens=tokens, sheets=sheets)
os.makedirs(os.path.join(app, 'js'), exist_ok=True)
with open(os.path.join(app, 'js', 'data.js'), 'w') as fh:
    fh.write('/* Gegenereerd uit %s door tools/build_webapp.py. Namen en mirrorBack mag je met de hand aanpassen. */\n' % os.path.basename(src))
    fh.write('window.GFC_DATA = ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n')
for s in sheets: print(s['name'], s['artboard'], len(s['slots']), {z: sum(1 for q in s['slots'] if q['size'] == z) for z in s['sizes']})
for z in sizes: print(z, [t['name'] for t in tokens if t['size'] == z['id']])
print({t['name']: t['mirrorBack'] for t in tokens if not t['mirrorBack']})
