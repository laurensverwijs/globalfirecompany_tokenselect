import re, sys, json, os

NUM = r'-?\d*\.?\d+(?:[eE][-+]?\d+)?'

from PIL import Image, ImageCms
_ICC = os.environ.get('GFC_ICC_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icc'))
_T = ImageCms.buildTransform(os.path.join(_ICC, 'default_cmyk.icc'), ImageCms.createProfile('sRGB'), 'CMYK', 'RGB', renderingIntent=1)
_cache = {}
def cmyk2rgb(c, m, y, k, tint=0.0):
    f = 1 - tint
    key = tuple(round(v*f*255) for v in (c, m, y, k))
    if key not in _cache:
        im = Image.new('CMYK', (1, 1), key)
        _cache[key] = '#%02x%02x%02x' % ImageCms.applyTransform(im, _T).getpixel((0, 0))
    return _cache[key]

def fmt(v): 
    s = ('%.3f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

class Node:
    def __init__(self, kind, attrs=None):
        self.kind = kind; self.children = []; self.attrs = attrs or {}; self.clip = []
    def bbox(self):
        pass

class Conv:
    def __init__(self, flipY=None):
        # flipY: function mapping (x,y)->(X,Y)
        self.tf = flipY or (lambda x, y: (x, y))
        self.fill = '#000000'; self.stroke = 'none'; self.lw = 1; self.cap = 0; self.join = 0; self.miter = 10
        self.dash = None; self.rule = 'nonzero'; self.opacity = 1.0; self.blend = 0
        self.root = Node('g'); self.stack = [self.root]
        self.d = []; self.cur = (0, 0); self.compound = None; self.clipflag = False
        self.last_closed = None; self.cutline = None; self.cutcolor = False; self.fillname = None; self.strokename = None
        self.pts = []

    def P(self, x, y):
        X, Y = self.tf(x, y); self.pts.append((X, Y)); return fmt(X) + ' ' + fmt(Y)

    def emit(self, op):
        d = ' '.join(self.d); self.d = []
        if not d: return
        if self.clipflag:
            self.stack[-1].clip.append(d); self.clipflag = False; return
        if self.compound is not None:
            self.compound['d'].append(d); self.compound['op'] = op; self.compound['state'] = self.state(); return
        self.add_path(d, op, self.state())

    def state(self):
        return dict(fill=self.fill, stroke=self.stroke, lw=self.lw, cap=self.cap, join=self.join, miter=self.miter,
                    dash=self.dash, rule=self.rule, opacity=self.opacity, blend=self.blend, sname=self.strokename)

    def add_path(self, d, op, st):
        fill = op in 'fFbB'; stroke = op in 'sSbB'
        if not fill and not stroke: return
        if stroke and st['sname'] == 'Cutline' and not fill:
            self.cutline = d; return
        a = {'d': d}
        a['fill'] = st['fill'] if fill else 'none'
        if st['rule'] == 'evenodd' and fill: a['fill-rule'] = 'evenodd'
        if stroke:
            a['stroke'] = st['stroke']; a['stroke-width'] = fmt(st['lw'])
            if st['cap']: a['stroke-linecap'] = ['butt', 'round', 'square'][st['cap']]
            if st['join']: a['stroke-linejoin'] = ['miter', 'round', 'bevel'][st['join']]
            if st['miter'] != 4 and st['join'] == 0: a['stroke-miterlimit'] = fmt(st['miter'])
            if st['dash']: a['stroke-dasharray'] = st['dash']
        if st['opacity'] < 1: a['opacity'] = fmt(st['opacity'])
        if st['blend'] == 1: a['style'] = 'mix-blend-mode:multiply'
        n = Node('path', a); self.stack[-1].children.append(n)

    def run(self, lines):
        for raw in lines:
            line = raw.strip()
            if not line or line.startswith('%'): continue
            parts = line.split()
            op = parts[-1]
            nums = parts[:-1]
            try:
                self.do(op, nums, line)
            except Exception as e:
                raise RuntimeError('%s: %s' % (line, e))
        return self

    def do(self, op, a, line):
        f = lambda i: float(a[i])
        if op in ('m', 'l', 'L', 'c', 'C', 'v', 'V', 'y', 'Y', 'h', 'H', 'As', 'Ap', 'O', 'R', 'Xk', 'XK', 'k', 'K', 'x', 'X', 'g', 'G', 'Xa', 'XA', 'w', 'D'):
            self.last_closed = None
        if op == 'm':
            self.d.append('M' + self.P(f(0), f(1))); self.cur = (f(0), f(1))
        elif op in ('l', 'L'):
            self.d.append('L' + self.P(f(0), f(1))); self.cur = (f(0), f(1))
        elif op in ('c', 'C'):
            self.d.append('C' + self.P(f(0), f(1)) + ' ' + self.P(f(2), f(3)) + ' ' + self.P(f(4), f(5))); self.cur = (f(4), f(5))
        elif op in ('v', 'V'):
            x0, y0 = self.cur
            self.d.append('C' + self.P(x0, y0) + ' ' + self.P(f(0), f(1)) + ' ' + self.P(f(2), f(3))); self.cur = (f(2), f(3))
        elif op in ('y', 'Y'):
            self.d.append('C' + self.P(f(0), f(1)) + ' ' + self.P(f(2), f(3)) + ' ' + self.P(f(2), f(3))); self.cur = (f(2), f(3))
        elif op in ('h', 'H'):
            pass
        elif op in ('f', 'F', 's', 'S', 'b', 'B', 'n', 'N'):
            if op in 'fsbn' and self.d: self.d.append('Z')
            self.emit(op)
        elif op == 'W':
            self.clipflag = True
        elif op == 'u':
            g = Node('g'); self.stack[-1].children.append(g); self.stack.append(g); self.last_closed = None
        elif op == 'U':
            self.last_closed = self.stack.pop()
        elif op == 'q':
            g = Node('g'); self.stack[-1].children.append(g); self.stack.append(g); self.last_closed = None
        elif op == 'Q':
            self.last_closed = self.stack.pop()
        elif op == '*u':
            self.compound = {'d': [], 'op': 'n', 'state': None}; self.last_closed = None
        elif op == '*U':
            c = self.compound; self.compound = None
            if c['d'] and c['state']: self.add_path(' '.join(c['d']), c['op'], c['state'])
        elif op == 'Xy':
            blend, op_ = int(float(a[0])), float(a[1])
            if self.last_closed is not None:
                if op_ < 1: self.last_closed.attrs['opacity'] = fmt(op_)
                if blend == 1: self.last_closed.attrs['style'] = 'mix-blend-mode:multiply'
                self.last_closed = None
            else:
                self.opacity = op_; self.blend = blend
        elif op in ('Xk', 'XK', 'x', 'X'):
            m = re.match(r'(%s) (%s) (%s) (%s) \((.*)\) (%s)' % (NUM, NUM, NUM, NUM, NUM), line)
            c, mm, y, k = map(float, m.group(1, 2, 3, 4)); name = m.group(5); tint = float(m.group(6))
            typ = 0
            if op in ('Xk', 'XK'):
                rest = line[m.end():].split(); typ = int(float(rest[0]))
            col = cmyk2rgb(c, mm, y, k, tint) if typ == 0 else '#%02x%02x%02x' % tuple(round(255*v) for v in (c, mm, y))
            if op in ('Xk', 'x'): self.fill = col; self.fillname = name
            else: self.stroke = col; self.strokename = name
        elif op == 'k':
            self.fill = cmyk2rgb(*map(float, a[:4])); self.fillname = None
        elif op == 'K':
            self.stroke = cmyk2rgb(*map(float, a[:4])); self.strokename = None
        elif op == 'g':
            v = round(255*f(0)); self.fill = '#%02x%02x%02x' % (v, v, v); self.fillname = None
        elif op == 'G':
            v = round(255*f(0)); self.stroke = '#%02x%02x%02x' % (v, v, v); self.strokename = None
        elif op == 'Xa':
            self.fill = '#%02x%02x%02x' % tuple(round(255*float(v)) for v in a[:3]); self.fillname = None
        elif op == 'XA':
            self.stroke = '#%02x%02x%02x' % tuple(round(255*float(v)) for v in a[:3]); self.strokename = None
        elif op == 'w':
            self.lw = f(0)
        elif op == 'D':
            self.rule = 'evenodd' if f(0) == 1 else 'nonzero'
        elif op in ('J', 'j', 'M', 'd', 'XR') or line.endswith(' d') or ' d' in line:
            # combined style line: "0 J 0 j 1 w 10 M []0 d"
            toks = re.findall(r'\[[^\]]*\]|\S+', line)
            stackv = []
            for t in toks:
                if t in ('J', 'j', 'w', 'M', 'd', 'XR', 'D'):
                    if t == 'J': self.cap = int(float(stackv[-1]))
                    elif t == 'j': self.join = int(float(stackv[-1]))
                    elif t == 'w': self.lw = float(stackv[-1])
                    elif t == 'M': self.miter = float(stackv[-1])
                    elif t == 'D': self.rule = 'evenodd' if float(stackv[-1]) == 1 else 'nonzero'
                    elif t == 'd':
                        arr = stackv[-2] if len(stackv) >= 2 else '[]'
                        inner = arr.strip('[]').strip()
                        self.dash = ' '.join(fmt(float(x)) for x in inner.split()) if inner else None
                    stackv = []
                else:
                    if t.startswith('[') and ']' in t and not t.endswith(']'):
                        i = t.index(']'); stackv.append(t[:i+1]); stackv.append(t[i+1:])
                    else: stackv.append(t)
        # everything else ignored (A, Ae, Ap, As, O, R, XW, Xd, Xw, Lb, Ln, LB ...)

    def svg_body(self, node=None, ids=None, prefix='c'):
        node = node or self.root
        if ids is None: ids = [0]
        out = []
        for ch in node.children:
            if ch.kind == 'path':
                out.append('<path ' + ' '.join('%s="%s"' % kv for kv in ch.attrs.items()) + '/>')
            else:
                inner = self.svg_body(ch, ids, prefix)
                if not inner and not ch.clip: continue
                attrs = dict(ch.attrs); defs = ''
                if ch.clip:
                    ids[0] += 1; cid = '%s%d' % (prefix, ids[0])
                    defs = '<clipPath id="%s">%s</clipPath>' % (cid, ''.join('<path d="%s"/>' % d for d in ch.clip))
                    attrs['clip-path'] = 'url(#%s)' % cid
                if not inner: continue
                if attrs:
                    out.append(defs + '<g ' + ' '.join('%s="%s"' % kv for kv in attrs.items()) + '>' + inner + '</g>')
                else:
                    out.append(defs + inner)
        return ''.join(out)

def read_ops(path):
    txt = open(path, 'rb').read().decode('latin1').replace('\r\n', '\n').replace('\r', '\n')
    return txt.split('\n')

def decompress_ai(path):
    """Leest de native Illustrator-data (AIPrivateData, zstd of zlib) en geeft regels terug."""
    d = open(path, 'rb').read()
    ids = sorted((int(a), int(b)) for a, b in re.findall(rb'/AIPrivateData(\d+) (\d+) 0 R', d))
    buf = b''
    for _, oid in ids:
        m = re.search(rb'(?<!\d)%d 0 obj\s*<<(.*?)>>\s*stream\r?\n' % oid, d, re.S)
        L = int(re.search(rb'/Length (\d+)', m.group(1)).group(1))
        buf += d[m.end():m.end() + L]
    if buf.startswith(b'%AI24_ZStandard_Data'):
        import zstandard
        data = zstandard.ZstdDecompressor().stream_reader(buf[len(b'%AI24_ZStandard_Data'):]).read()
    elif buf.startswith(b'%AI12_CompressedData'):
        import zlib
        data = zlib.decompress(buf[len(b'%AI12_CompressedData'):])
    else:
        data = buf
    return data.decode('latin1').replace('\r\n', '\n').replace('\r', '\n').split('\n')
