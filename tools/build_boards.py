"""Zet de spelborden in de webapp: een kleine voorbeeldafbeelding per bord en de lijst in js/data.js.

Gebruik:
  python3 tools/build_boards.py <map met de bord-PDF's>

Verwacht bestanden als 'parkeerplaats-v01_Fogra 39_CMYK_605mm.pdf'. Het deel vóór '-v' is de id.
Namen en welke borden standaard meegaan staan hieronder in BOARDS; MAX_EXTRA is hoeveel borden
de klant er zelf bij mag kiezen. Nodig: pdftoppm (poppler) en Pillow.
"""
import sys, os, re, json, glob, subprocess, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_EXTRA = 2
# id -> (nl, en, de, altijd inbegrepen)
BOARDS = {
    'parkeerplaats': ('Parkeerplaats', 'Car park', 'Parkplatz', True),
    'boerderij': ('Boerderij', 'Farm', 'Bauernhof', False),
    'buitenwijk': ('Buitenwijk', 'Suburb', 'Stadtrand', False),
    'fabriek': ('Fabriek', 'Factory', 'Fabrik', False),
    'gras': ('Grasveld', 'Grass field', 'Wiese', False),
    'snelweg': ('Snelweg', 'Motorway', 'Autobahn', False),
    'woonwijk': ('Woonwijk', 'Residential area', 'Wohngebiet', False),
}


def main():
    src = sys.argv[1]
    out = os.path.join(ROOT, 'assets', 'boards'); os.makedirs(out, exist_ok=True)
    found = {}
    for pdf in glob.glob(os.path.join(src, '*.pdf')):
        m = re.match(r'([a-z]+)-v\d+', os.path.basename(pdf))
        if m and m.group(1) in BOARDS: found[m.group(1)] = pdf
    missing = set(BOARDS) - set(found)
    if missing: raise SystemExit('ontbreekt: ' + ', '.join(sorted(missing)))
    with tempfile.TemporaryDirectory() as tmp:
        for bid, pdf in found.items():
            subprocess.run(['pdftoppm', '-singlefile', '-scale-to', '960', '-jpeg', pdf, os.path.join(tmp, bid)], check=True)
            im = Image.open(os.path.join(tmp, bid + '.jpg')).convert('RGB')
            im.thumbnail((480, 480), Image.LANCZOS)
            im.save(os.path.join(out, bid + '.jpg'), 'JPEG', quality=80, optimize=True, progressive=True)

    path = os.path.join(ROOT, 'js', 'data.js')
    txt = open(path, encoding='utf-8').read()
    m = re.match(r'(.*?window\.GFC_DATA = )(\{.*\})(;\s*)$', txt, re.S)
    data = json.loads(m.group(2))
    data['boards'] = {'maxExtra': MAX_EXTRA, 'items': [
        dict({'id': bid, 'name': nl, 'name_nl': nl, 'name_en': en, 'name_de': de, 'file': 'assets/boards/%s.jpg' % bid},
             **({'included': True} if inc else {}))
        for bid, (nl, en, de, inc) in BOARDS.items()]}
    open(path, 'w', encoding='utf-8').write(m.group(1) + json.dumps(data, indent=1, ensure_ascii=False) + m.group(3))
    print('%d borden' % len(BOARDS))


if __name__ == '__main__':
    main()
