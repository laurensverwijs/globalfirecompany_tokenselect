# Sheet samensteller · Global Fire Company

Statische webapp (HTML, CSS en JavaScript). Er is geen server, database of build-stap nodig.

## Hosten
De app is een map met gewone bestanden (HTML, CSS, JavaScript, SVG en lettertypes). Er is geen server, database, PHP of build-stap nodig. Elke webhost die bestanden kan serveren werkt. Bestellingen worden niet online opgeslagen: klanten printen of bewaren hun sheet zelf als PDF of `.json`.

Te uploaden: `index.html`, `css/`, `js/`, `assets/`. De map `tools/` en `README.md` zijn alleen voor beheer en hoeven niet online.

### Optie 1: GitHub Pages (gratis, vanuit deze repo)
1. Merge de pull request naar `main`.
2. Ga op GitHub naar de repo, dan **Settings → Pages**.
3. Kies bij *Source* **Deploy from a branch**, branch `main`, map `/ (root)`, en klik **Save**.
4. Na een minuut staat de app op `https://laurensverwijs.github.io/globalfirecompany_tokenselect/`.
5. Eigen domein (bijv. `sheets.global-fire-company.com`): vul het in bij **Custom domain** en maak bij de domeinbeheerder een CNAME-record naar `laurensverwijs.github.io`. Vink daarna **Enforce HTTPS** aan.

Let op: bij een privé-repo werkt GitHub Pages alleen met een betaald GitHub-abonnement. Maak de repo anders publiek of kies optie 2 of 3.

### Optie 2: Netlify of Cloudflare Pages (gratis, slepen en klaar)
1. Maak een account op netlify.com.
2. Ga naar **Add new site → Deploy manually** en sleep de map met `index.html` erin.
3. Je krijgt meteen een adres; een eigen domein koppel je onder **Domain management**.
Koppel je Netlify aan de GitHub-repo, dan wordt elke merge naar `main` automatisch online gezet (build command leeg laten, publish directory `/`).

### Optie 3: eigen webhosting of de website van Global Fire Company
1. Upload `index.html`, `css/`, `js/` en `assets/` via FTP/SFTP of het bestandsbeheer van de hoster naar een eigen map, bijvoorbeeld `/sheets/`.
2. De app staat dan op `https://www.global-fire-company.com/sheets/`.
3. In een bestaande site (WordPress e.d.) kun je hem tonen met een iframe:
   `<iframe src="https://www.global-fire-company.com/sheets/" style="width:100%;height:1100px;border:0"></iframe>`

### Bijwerken
Vervang de bestanden door de nieuwe versie (bij optie 1 en een gekoppelde Netlify-site: mergen naar `main` is genoeg). Bestellingen die klanten al hebben opgeslagen blijven werken zolang de element-id's in `js/data.js` hetzelfde blijven.

### Lettertype
De koppen gebruiken het huislettertype Ethnocentric als het op de computer van de bezoeker staat, anders de vrij te gebruiken lookalike Michroma (meegeleverd in `assets/fonts`). Wil je Ethnocentric voor iedereen tonen, zet dan `ethnocentric.woff2` in `assets/fonts/` (alleen als de licentie webgebruik toestaat) en voeg in `css/app.css` bij de regel `@font-face { font-family: "GFC Display" ...` `url("../assets/fonts/ethnocentric.woff2")` toe aan `src`.

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
