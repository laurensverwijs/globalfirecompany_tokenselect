# Sheet samensteller · Global Fire Company

Webapp (HTML, CSS en JavaScript) waarmee klanten per printsheet kiezen welke elementen erop komen. Met een klein PHP-script (`api/orders.php`) maakt Global Fire Company in `admin.html` orders aan met een unieke link per klant, en downloadt na akkoord van de klant een PDF. Er is geen database of build-stap nodig.

## Bestellingen
1. **GFC maakt een order aan** in `admin.html` (naam, organisatie, e-mail, referentie, taal) en krijgt een unieke link, bijv. `…/sheet-organizer/?order=K7QM-2XDP-9TAH&lang=nl`. Die stuurt GFC naar de klant.
2. **De klant vult de sheets** via die link. Alles wordt automatisch bewaard en met **Opslaan** kan het ook tussentijds. Later dezelfde link openen = verder waar hij was. Collega's met dezelfde link werken in dezelfde order.
3. **De klant geeft akkoord** met naam en e-mail (organisatie, telefoon, referentie en opmerkingen optioneel). De order wordt dan vergrendeld; bekijken en afdrukken kan nog.
4. **GFC downloadt de PDF** in `admin.html` (knop *PDF downloaden* bij elke order met akkoord): een voorblad met de ordergegevens en per gevulde sheet de voorkant en gespiegelde achterkant op ware grootte (341 × 341 mm), vector, met snijlijnen.

Klanten kunnen niet zelf een order starten, tenzij je `public_create` in `api/config.php` op `true` zet. Tien (of honderd) klanten tegelijk is geen probleem: elke order is een eigen bestand (`api/data/orders/<code>.json`) en schrijven gebeurt met een slot.

### Beheer (`admin.html`)
- Inloggen met het wachtwoord uit `api/config.php`.
- Lijst van alle bestellingen met status (*Concept*, *Verstuurd*, *Afgehandeld*), zoeken en filteren.
- *PDF downloaden* bij orders met akkoord. *Details* toont per sheet welke elementen en hoeveel. Via de ordercode open je de bestelling om hem te bekijken of af te drukken.
- Status terugzetten naar *Concept* geeft de klant de bestelling weer vrij om te wijzigen.
- *Exporteren (CSV)* geeft een bestand voor Excel met één regel per element per sheet.
- *Verwijderen* vraagt om een tweede klik en is definitief.

### Instellingen (`api/config.php`)
| Instelling | Betekenis |
|---|---|
| `admin_password` | Wachtwoord voor `admin.html`. Zolang het `wijzig-mij` is, staat het beheer uit. |
| `public_create` | `false` (standaard): alleen GFC maakt orders aan. `true`: klanten kunnen ook zelf een order starten. |
| `notify_email` | Adres dat een e-mail krijgt zodra een klant akkoord geeft (leeg = geen e-mail). Gebruikt PHP `mail()`, wat de meeste hosters ondersteunen. |
| `mail_from` | Afzender van die e-mail; gebruik een adres op het eigen domein. |
| `app_url` | Adres van de app, voor de links in de e-mail. |
| `create_limit_per_hour` | Maximaal aantal nieuwe bestellingen per IP-adres per uur. |

## Hosten
Te uploaden: `index.html`, `admin.html`, `css/`, `js/`, `assets/` en `api/`. `js/vendor/` bevat jsPDF en svg2pdf.js (MIT-licentie) voor de PDF. De map `tools/` en `README.md` zijn alleen voor beheer en hoeven niet online.

Voor bestellingen heeft de host **PHP 7.4 of nieuwer** nodig (vrijwel elke webhost heeft dat). Zonder PHP, zoals op GitHub Pages, werkt de app nog steeds, maar dan zonder ordercodes: dan bewaart elke bezoeker zijn keuze alleen in de eigen browser en als bestand of PDF.

### Doel: https://www.global-fire-company.com/sheet-organizer/
Alle paden in de app zijn relatief, dus hij werkt in elke submap zonder aanpassingen.
1. Log in bij de hosting van global-fire-company.com (FTP/SFTP of het bestandsbeheer in het hostingpaneel, bijv. cPanel/Plesk/DirectAdmin).
2. Maak in de webroot (meestal `public_html/`, `httpdocs/` of `www/`) de map `sheet-organizer`.
3. Upload daarin `index.html`, `admin.html` en de mappen `css/`, `js/`, `assets/` en `api/`.
4. Open `api/config.php` op de server en vul een eigen `admin_password` in (en eventueel `notify_email`).
5. Zorg dat de webserver mag schrijven in `api/data/` (meestal al zo; anders in het bestandsbeheer rechten 755 of 775 geven).
6. Test: `https://www.global-fire-company.com/sheet-organizer/api/orders.php?action=ping` moet `{"ok":true,…}` tonen, en `https://www.global-fire-company.com/sheet-organizer/api/data/` moet geweigerd worden (403).
7. Klanten gebruiken `https://www.global-fire-company.com/sheet-organizer/`, GFC beheert via `https://www.global-fire-company.com/sheet-organizer/admin.html`.

`api/data/.htaccess` sluit de orders af op Apache en LiteSpeed (de meeste hosters). Draait de host op nginx, vraag de hoster dan om de map `/sheet-organizer/api/data/` af te schermen; anders zijn orderbestanden op te vragen door wie de exacte ordercode kent.

Draait de site op WordPress: een echte map in de webroot gaat voor op WordPress-pagina's, zolang er geen pagina met de slug `sheet-organizer` bestaat. Kun je geen bestanden uploaden (bijv. Wix/Squarespace), zet de app dan op een eigen (sub)domein bij een host met PHP en toon hem met een iframe op een pagina `/sheet-organizer`.
Bijwerken: overschrijf de bestanden in die map, maar **niet** `api/config.php` en `api/data/` (daar staan het wachtwoord en de bestellingen). Voeg je nieuwe elementen toe, ververs dan ook de browsercache (Ctrl+F5).

### Demo zonder bestellingen: GitHub Pages (gratis, vanuit deze repo)
1. Merge de pull request naar `main`.
2. Ga op GitHub naar de repo, dan **Settings → Pages**.
3. Kies bij *Source* **Deploy from a branch**, branch `main`, map `/ (root)`, en klik **Save**.
4. Na een minuut staat de app op `https://laurensverwijs.github.io/globalfirecompany_tokenselect/`.
5. Eigen domein (bijv. `sheets.global-fire-company.com`): vul het in bij **Custom domain** en maak bij de domeinbeheerder een CNAME-record naar `laurensverwijs.github.io`. Vink daarna **Enforce HTTPS** aan.

Let op: bij een privé-repo werkt GitHub Pages alleen met een betaald GitHub-abonnement.

### Demo zonder bestellingen: Netlify of Cloudflare Pages
1. Maak een account op netlify.com.
2. Ga naar **Add new site → Deploy manually** en sleep de map met `index.html` erin.
3. Je krijgt meteen een adres; een eigen domein koppel je onder **Domain management**.
Koppel je Netlify aan de GitHub-repo, dan wordt elke merge naar `main` automatisch online gezet (build command leeg laten, publish directory `/`).

### Andere webhosting
1. Upload `index.html`, `admin.html`, `css/`, `js/`, `assets/` en `api/` via FTP/SFTP of het bestandsbeheer van de hoster naar een eigen map, bijvoorbeeld `/sheets/`.
2. De app staat dan op `https://www.global-fire-company.com/sheets/`.
3. In een bestaande site (WordPress e.d.) kun je hem tonen met een iframe:
   `<iframe src="https://www.global-fire-company.com/sheets/" style="width:100%;height:1100px;border:0"></iframe>`

### Bijwerken
Vervang de bestanden door de nieuwe versie (bij GitHub Pages en een gekoppelde Netlify-site: mergen naar `main` is genoeg; op de eigen host `api/config.php` en `api/data/` laten staan). Bestellingen die klanten al hebben opgeslagen blijven werken zolang de element-id's in `js/data.js` hetzelfde blijven.

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
- Met PHP: orders met unieke link, tussentijds opslaan, akkoord met vergrendeling, beheeroverzicht en PDF-download (zie boven).
- Zonder PHP: Opslaan / Openen als `.json`-bestand; de app onthoudt de laatste stand in de browser.

## Talen
De app is beschikbaar in het Nederlands, Engels en Duits. Bij het eerste bezoek kiest hij de taal van de browser (anders Engels); de bezoeker kan wisselen met NL / EN / DE rechtsboven en die keuze wordt onthouden. Een link in een vaste taal: `.../index.html?lang=de` (of `?lang=en`, `?lang=nl`).
Alle teksten staan in `js/i18n.js`. Daar kun je ook een taal toevoegen door een blok te kopiëren (bijv. `fr`).

## Element toevoegen of aanpassen
Makkelijkst: zet het nieuwe element als **symbool** (met een snijlijn-kader in de kleur "Cutline") in het sheets-bestand en draai:

```
pip install zstandard pillow
GFC_ICC_DIR=<map met default_cmyk.icc> python3 tools/build_webapp.py Sheets_PrintReady.ai .
```
`default_cmyk.icc` komt uit Ghostscript (`iccprofiles/default_cmyk.icc`) en wordt alleen gebruikt om CMYK naar schermkleuren om te zetten.

Met de hand: zet een SVG in `assets/tokens/` en voeg een regel toe in `js/data.js` onder `tokens` (`id`, `name`, `file`, `size` = S/M/L/XL, `mirrorBack`). Namen mag je daar ook vertalen.
