# Werkafspraken voor deze app (en elke app van Tupilak Studio)

Deze regels gelden altijd, ook als een opdracht ze niet noemt. Wijk er alleen van af als Laurens dat uitdrukkelijk vraagt.

## Privacy: AVG / GDPR

- Verzamel alleen persoonsgegevens die echt nodig zijn voor het doel (dataminimalisatie).
- Toon de gebruiker een duidelijke privacytekst (welke gegevens, waarvoor, hoe lang, wie ze ziet, hoe je inzage of verwijdering vraagt) en vraag toestemming waar dat nodig is. Leg het tijdstip van toestemming vast.
- Stel een bewaartermijn in en verwijder gegevens daarna automatisch. Deze app: 6 maanden na de laatste wijziging (`retention_months`).
- Zorg dat gegevens van één persoon op verzoek te verwijderen en in te zien zijn.
- Host in de EU en noem in de README welke verwerkersovereenkomsten nodig zijn (hosting, klant).
- Geen trackers, analytics of externe scripts/lettertypes van derden zonder toestemming; laad alles van de eigen server.

## Versleuteling is standaard

- Persoonsgegevens worden altijd versleuteld opgeslagen (in deze app: libsodium, met AES-256-GCM als terugval).
- De sleutel staat nooit in git en nooit in een map die via het web bereikbaar is. Documenteer hoe je er een back-up van maakt.
- Alle verkeer gaat via HTTPS (afdwingen met HSTS).
- Wachtwoorden opslaan alleen als hash (`password_hash`), vergelijken in constante tijd.

## Beveiliging tegen hackers

- Vertrouw geen enkele invoer: valideer en beperk alles op de server; ontsnap alle uitvoer in HTML (geen XSS).
- Geen `eval`, geen dynamische includes, geen uploads zonder strikte controle op type en grootte.
- Beperk inlogpogingen en andere misbruikbare acties per IP-adres (rate limiting).
- Stuur beveiligingsheaders mee: CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy.
- Data-, config- en sleutelbestanden zijn via het web geblokkeerd; mappenlijsten staan uit.
- Foutmeldingen naar buiten zijn kort en verraden geen paden of interne details.
- Externe bibliotheken alleen met vaste versie, lokaal meegeleverd, met licentie.
- De repo is openbaar: nooit e-mailadressen, wachtwoorden, sleutels of klantgegevens committen.
- Laat bij elke wijziging die persoonsgegevens, inloggen of de API raakt een security review doen voordat de PR klaar is.

## Versienummers

- Elke app heeft een versienummer in `VERSION` (semver: MAJOR.MINOR.PATCH) en een `CHANGELOG.md`.
- Elke wijziging die naar de server gaat verhoogt het nummer en krijgt een regel in de changelog.
- Het nummer is zichtbaar in de app (in deze app onderaan het beheer) en staat in de naam van het uploadpakket (`python3 tools/make_zip.py` maakt `dist/gfc-tokensheet-v<versie>.zip`).
- Instellingenbestanden met wachtwoorden zitten nooit in het uploadpakket onder hun echte naam, zodat uploaden ze niet overschrijft.

## Communicatie

- Antwoorden aan Laurens in het Nederlands, kort en met directe links naar PR's.
- Vraag eerst voordat je iets doet wat niet terug te draaien is.
