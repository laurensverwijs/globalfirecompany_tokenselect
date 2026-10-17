#!/usr/bin/env python3
"""Maakt dist/gfc-tokensheet-v<versie>.zip om op de server te zetten.

Het versienummer staat in VERSION. Verhoog dat eerst (bijvoorbeeld 1.0.0 -> 1.1.0), draai dan:

    python3 tools/make_zip.py

Het script zet het nummer ook in index.html en admin.html (zichtbaar in het beheer, en als ?v= achter
css/js zodat browsers na een update meteen de nieuwe bestanden laden) en pakt alleen bestanden uit git in,
dus nooit api/secret-key.php of orders. api/config.php gaat mee als api/config.voorbeeld.php, zodat uploaden
de instellingen op de server nooit overschrijft.
"""
import os, re, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ('tools/', 'dist/', '.gitignore', 'CLAUDE.md')


def main():
    os.chdir(ROOT)
    version = open('VERSION').read().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        sys.exit('VERSION moet de vorm 1.2.3 hebben, niet %r' % version)
    for page in ('index.html', 'admin.html'):
        s = open(page, encoding='utf-8').read()
        s = re.sub(r'((?:href|src)="(?:css|js)/[^"?]+)(\?v=[^"]*)?"', r'\1?v=%s"' % version, s)
        s = re.sub(r'(<meta name="version" content=")[^"]*(")', r'\g<1>%s\2' % version, s)
        s = re.sub(r'(<span id="app-version">)[^<]*(</span>)', r'\g<1>v%s\2' % version, s)
        open(page, 'w', encoding='utf-8').write(s)
    files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
    files = [f for f in files if f and not f.startswith(SKIP) and not f.endswith('/.gitignore')]
    os.makedirs('dist', exist_ok=True)
    out = 'dist/gfc-tokensheet-v%s.zip' % version
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            name = 'api/config.voorbeeld.php' if f == 'api/config.php' else f
            z.write(f, 'gfc-tokensheet-v%s/%s' % (version, name))
    print('%s (%d bestanden)' % (out, len(files)))


if __name__ == '__main__':
    main()
