"""Zet de ronde fiches (25 mm) en het punch board in de webapp.

Gebruik:
  python3 tools/build_round.py <rollen.pdf> <punchboard_front.pdf>

- rollen.pdf: één pagina per fiche (25 mm, PDF/X), met als laatste twee pagina's de
  achterkanten GFC_Background en Triage_Background (zie PAGES hieronder).
- punchboard_front.pdf: het sjabloon met de rode snijcirkels; daaruit komen de posities.

Maakt assets/round/*.svg (31 mm: 25 mm fiche + 3 mm afloop rondom), assets/sheets/round1_bg.svg
en round1_marks.svg, en werkt js/data.js bij (maat R, het punch board en de fiches). Opnieuw
draaien is veilig: oude ronde fiches en het oude punch board worden eerst weggehaald.
Nodig: pdftocairo (poppler) en pypdf.
"""
import sys, os, re, json, subprocess, tempfile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject, DecodedStreamObject, NameObject

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PT2MM = 25.4 / 72
CUT = 25.0          # diameter snijlijn (mm)
BLEED = 3.0         # afloop rondom (mm)
SHEET_ID = 'round1'

# pagina -> (id, nl, en, de, achterkant)
G, TR = 'GFC', 'TRIAGE'
PAGES = {}
for i in range(1, 9):
    PAGES[i] = ('Round_Firefighter_%d' % i, 'Brandweer %d' % i, 'Firefighter %d' % i, 'Feuerwehr %d' % i, G)
PAGES[9] = ('Round_Firefighter_HazMat', 'Brandweer gevaarlijke stoffen', 'Firefighter HazMat', 'Feuerwehr Gefahrstoffe', G)
PAGES[10] = ('Round_Firefighter_BA', 'Brandweer ademlucht', 'Firefighter breathing apparatus', 'Feuerwehr Atemschutz', G)
PAGES[11] = ('Round_Diver', 'Duiker', 'Diver', 'Taucher', G)
for i in range(1, 9):
    PAGES[11 + i] = ('Round_Paramedic_%d' % i, 'Ambulance %d' % i, 'Paramedic %d' % i, 'Rettungsdienst %d' % i, G)
for i in range(1, 7):
    PAGES[19 + i] = ('Round_Civilian_%d' % i, 'Burger %d' % i, 'Civilian %d' % i, 'Zivilperson %d' % i, G)
PAGES[26] = ('Round_Triage_Gray', 'Triage grijs (overleden)', 'Triage grey (deceased)', 'Triage grau (verstorben)', TR)
PAGES[27] = ('Round_Triage_Red', 'Triage rood', 'Triage red', 'Triage rot', TR)
PAGES[28] = ('Round_Triage_Yellow', 'Triage geel', 'Triage yellow', 'Triage gelb', TR)
PAGES[29] = ('Round_Triage_Green', 'Triage groen', 'Triage green', 'Triage grün', TR)
PAGES[30] = ('Round_Fire', 'Vuur', 'Fire', 'Feuer', G)
PAGES[31] = ('Round_Smoke_Dark', 'Rook donker', 'Smoke dark', 'Rauch dunkel', G)
PAGES[32] = ('Round_Arrow', 'Pijl', 'Arrow', 'Pfeil', G)
PAGES[33] = ('Round_Smoke_Light', 'Rook licht', 'Smoke light', 'Rauch hell', G)
PAGES[34] = ('Round_Marker_X', 'Markering kruis (rood)', 'Marker cross (red)', 'Markierung Kreuz (rot)', G)
PAGES[35] = ('Round_Marker_Plus', 'Markering plus (groen)', 'Marker plus (green)', 'Markierung Plus (grün)', G)
BACKS = {36: ('Round_Back_GFC', G), 37: ('Round_Back_Triage', TR)}

CUTLINE = 'stroke="rgb(22.460938%, 50.87738%, 73.843384%)"'


def page_svg(reader, pn, tmp):
    """Pagina als SVG van 31 mm: de artboard-clip eruit, de paginagrenzen 3 mm ruimer."""
    w = PdfWriter(); w.add_page(reader.pages[pn - 1]); p = w.pages[0]
    data = p.get_contents().get_data()
    data, n = re.subn(rb'0 70\.866 70\.866 -70\.866 re\s+W n', b'', data, count=1)
    if n != 1: raise SystemExit('pagina %d: artboard-clip niet gevonden' % pn)
    s = DecodedStreamObject(); s.set_data(data)
    p[NameObject('/Contents')] = w._add_object(s)
    b = BLEED / PT2MM
    box = RectangleObject([-b, -b, 70.866 + b, 70.866 + b])
    for k in ('/MediaBox', '/CropBox', '/BleedBox', '/TrimBox', '/ArtBox'): p[NameObject(k)] = box
    pdf = os.path.join(tmp, 'p%d.pdf' % pn); svg = os.path.join(tmp, 'p%d.svg' % pn)
    w.write(pdf)
    subprocess.run(['pdftocairo', '-svg', pdf, svg], check=True)
    return open(svg, encoding='utf-8').read()


def clean(svg, prefix):
    # snijlijn weg (de app tekent zijn eigen snijlijn)
    svg, n = re.subn(r'<path [^>]*%s[^>]*/>\s*' % re.escape(CUTLINE), '', svg)
    if n != 1: raise SystemExit('%s: %d snijlijnen gevonden' % (prefix, n))
    # glyphs (tekst) uitschrijven, zodat er geen <use> naar gedeelde ids overblijft
    glyphs = dict(re.findall(r'<g id="(glyph-[\d-]+)">\s*(.*?)\s*</g>', svg, re.S))
    def use(m):
        attrs = m.group(1)
        ref = re.search(r'xlink:href="#([^"]+)"', attrs).group(1)
        x = re.search(r'\bx="([^"]*)"', attrs); y = re.search(r'\by="([^"]*)"', attrs)
        return '<g transform="translate(%s,%s)">%s</g>' % (x.group(1) if x else 0, y.group(1) if y else 0, glyphs.get(ref, ''))
    svg = re.sub(r'<use ([^>]*)/>', use, svg)
    svg = re.sub(r'<g id="glyph-[\d-]+">.*?</g>\s*', '', svg, flags=re.S)
    svg = re.sub(r'<g>\s*</g>\s*', '', svg)
    if '<use' in svg or 'xlink:href' in svg: raise SystemExit(prefix + ': <use> blijft over')
    # ids uniek maken per fiche (svg2pdf zet alle fiches in één document)
    svg = re.sub(r'id="([^"]+)"', lambda m: 'id="%s-%s"' % (prefix, m.group(1)), svg)
    svg = re.sub(r'url\(#([^)]+)\)', lambda m: 'url(#%s-%s)' % (prefix, m.group(1)), svg)
    size = '%gmm' % (CUT + 2 * BLEED)
    svg = re.sub(r'<svg ([^>]*?)width="[^"]*" height="[^"]*"', lambda m: '<svg %swidth="%s" height="%s"' % (m.group(1), size, size), svg, count=1)
    svg = re.sub(r'^<\?xml[^>]*>\s*', '', svg)
    # kleuren als hex: svg2pdf (PDF in het beheer) begrijpt rgb() met procenten niet
    svg = re.sub(r'rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)',
                 lambda m: '#%02x%02x%02x' % tuple(min(255, round(float(v) * 2.55)) for v in m.groups()), svg)
    if 'rgb(' in svg: raise SystemExit(prefix + ': onbekende kleur')
    return svg


def circles(template):
    """Middelpunten (mm) van de rode snijcirkels en de maat van de pagina."""
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 't.svg')
        subprocess.run(['pdftocairo', '-svg', '-f', '1', '-l', '1', template, out], check=True)
        s = open(out, encoding='utf-8').read()
    W = float(re.search(r'<svg [^>]*width="([\d.]+)', s).group(1))
    tag = re.search(r'<path [^>]*stroke="rgb\(93\.357849%[^>]*>', s).group(0)
    a, b, c, d, e, f = [float(v) for v in re.search(r'matrix\(([^)]*)\)', tag).group(1).split(',')]
    path = re.search(r' d="([^"]*)"', tag).group(1)
    res, board = [], None
    for sub in re.split(r'(?=M )', path):
        nums = [float(v) for v in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', sub)]
        if len(nums) < 4: continue
        xs = [a * nums[i] + c * nums[i + 1] + e for i in range(0, len(nums) - 1, 2)]
        ys = [b * nums[i] + d * nums[i + 1] + f for i in range(0, len(nums) - 1, 2)]
        bw = (max(xs) - min(xs)) * PT2MM
        cx = (max(xs) + min(xs)) / 2 * PT2MM; cy = (max(ys) + min(ys)) / 2 * PT2MM
        if abs(bw - CUT) < 0.6:
            if not any(abs(cx - x) < 1 and abs(cy - y) < 1 for x, y in res): res.append((cx, cy))
        elif bw > 200:
            board = (min(xs) * PT2MM, min(ys) * PT2MM, bw, (max(ys) - min(ys)) * PT2MM)
    res.sort(key=lambda p: (round(p[1]), p[0]))
    return W * PT2MM, res, board


def main():
    roles, template = sys.argv[1], sys.argv[2]
    A = os.path.join(ROOT, 'assets')
    os.makedirs(os.path.join(A, 'round'), exist_ok=True)
    reader = PdfReader(roles)
    if len(reader.pages) != 37: raise SystemExit('verwacht 37 pagina\'s, gevonden: %d' % len(reader.pages))
    with tempfile.TemporaryDirectory() as tmp:
        for pn in list(PAGES) + list(BACKS):
            tid = PAGES[pn][0] if pn in PAGES else BACKS[pn][0]
            svg = clean(page_svg(reader, pn, tmp), tid)
            open(os.path.join(A, 'round', tid + '.svg'), 'w', encoding='utf-8').write(svg)
    back_file = {kind: 'assets/round/%s.svg' % tid for tid, kind in BACKS.values()}

    W, centres, board = circles(template)
    if len(centres) != 94: raise SystemExit('verwacht 94 cirkels, gevonden: %d' % len(centres))
    r = CUT / 2
    slots = [{'x': round(x - r, 2), 'y': round(y - r, 2), 'w': CUT, 'h': CUT, 'size': 'R'} for x, y in centres]
    W = round(W, 2)
    open(os.path.join(A, 'sheets', SHEET_ID + '_bg.svg'), 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" preserveAspectRatio="none"><rect width="%g" height="%g" fill="#fff"/></svg>' % (W, W, W, W))
    bx, by, bw, bh = board
    open(os.path.join(A, 'sheets', SHEET_ID + '_marks.svg'), 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" preserveAspectRatio="none">'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="2" fill="none" stroke="#1d7fc4" stroke-width="0.25"/></svg>'
        % (W, W, bx, by, bw, bh))

    # ---- js/data.js bijwerken
    path = os.path.join(ROOT, 'js', 'data.js')
    txt = open(path, encoding='utf-8').read()
    m = re.match(r'(.*?window\.GFC_DATA = )(\{.*\})(;\s*)$', txt, re.S)
    data = json.loads(m.group(2))
    data['sizes'] = [z for z in data['sizes'] if z['id'] != 'R'] + [
        {'id': 'R', 'label': 'Rond', 'adj': 'ronde', 'w': CUT, 'h': CUT, 'round': True, 'bleed': BLEED}]
    data['tokens'] = [t for t in data['tokens'] if t.get('size') != 'R'] + [
        {'id': tid, 'name': nl, 'name_nl': nl, 'name_en': en, 'name_de': de, 'source': 'GFC_Rollen_25mm p%d' % pn,
         'file': 'assets/round/%s.svg' % tid, 'back': back_file[kind], 'mirrorBack': False, 'size': 'R'}
        for pn, (tid, nl, en, de, kind) in sorted(PAGES.items())]
    data['sheets'] = [s for s in data['sheets'] if s['id'] != SHEET_ID] + [
        {'id': SHEET_ID, 'name_nl': 'Ronde fiches', 'name_en': 'Round tokens', 'name_de': 'Runde Marker',
         'artboard': 'Punch Board', 'w': W, 'h': W, 'bg': 'assets/sheets/%s_bg.svg' % SHEET_ID,
         'marks': 'assets/sheets/%s_marks.svg' % SHEET_ID, 'sizes': ['R'], 'slots': slots}]
    open(path, 'w', encoding='utf-8').write(m.group(1) + json.dumps(data, indent=1, ensure_ascii=False) + m.group(3))
    print('%d fiches, %d achterkanten, %d vakken op %g mm' % (len(PAGES), len(BACKS), len(slots), W))


if __name__ == '__main__':
    main()
