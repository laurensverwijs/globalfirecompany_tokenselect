# Sheet samensteller · Global Fire Company

Statische webapp (HTML, CSS en JavaScript). Er is geen server, database of build-stap nodig.

## Hosten
Upload de hele map `webapp/` naar een willekeurige webhost (eigen hosting, Netlify, GitHub Pages, een map op de website van Global Fire Company). `index.html` is de startpagina. Lokaal kun je `index.html` ook gewoon dubbelklikken.

Mapindeling:
- `index.html`, `css/app.css`, `js/app.js`: de app
- `js/data.js`: alle elementen, maten en vakposities (gegenereerd, mag je met de hand aanpassen)
- `assets/tokens/*.svg`: de elementen als vector
- `assets/sheets/*_bg.svg` en `*_marks.svg`: lucht/gras-achtergrond en de sheetrand + afloop per sheet
- `tools/`: scripts om alles opnieuw te genereren uit het Illustrator-bestand

## Wat de app doet
- 4 sheets (341 × 341 mm), vakken exact overgenomen van de blauwe snijlijnen in `Sheets_PrintReady_03.ai`.
- Maten (bepaald uit de snijlijn in elk symbool, niet uit de bestandsnaam):
  - Klein 40 × 32 mm, Middel 56 × 38 mm, Groot 72 × 38 mm, Extra groot 89 × 44,2 mm
- Sheet 1: 48 klein · Sheet 2: 30 klein + 6 extra groot · Sheet 3: 8 middel + 15 groot · Sheet 4: 21 groot
- Een element past alleen in een vak van dezelfde maat. Is het laatste vak bezet, dan is de sheet vol en kan er niets meer bij.
- Slepen werkt met muis en touch. Ook: `+` (één toevoegen) en `⇉` (alle lege vakken van die maat vullen).
- De achterkant wordt automatisch gespiegeld gemaakt, zoals in het Illustrator-bestand.
- Afdrukken / PDF: elke sheet op ware grootte, voor- en achterkant, optioneel met snijlijnen.
- Opslaan / Openen: de bestelling als `.json`-bestand. De app onthoudt de laatste stand ook in de browser.

## Element toevoegen of aanpassen
Makkelijkst: zet het nieuwe element als **symbool** (met een snijlijn-kader in de kleur "Cutline") in het sheets-bestand en draai:

```
pip install zstandard pillow
GFC_ICC_DIR=<map met default_cmyk.icc> python3 tools/build_webapp.py Sheets_PrintReady.ai .
```
`default_cmyk.icc` komt uit Ghostscript (`iccprofiles/default_cmyk.icc`) en wordt alleen gebruikt om CMYK naar schermkleuren om te zetten.

Met de hand: zet een SVG in `assets/tokens/` en voeg een regel toe in `js/data.js` onder `tokens` (`id`, `name`, `file`, `size` = S/M/L/XL, `mirrorBack`). Namen mag je daar ook vertalen.
