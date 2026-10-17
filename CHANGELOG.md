# Versies

Het versienummer staat in `VERSION`, in het beheer onderaan de pagina, en in de naam van de zip (`python3 tools/make_zip.py`).

## 1.0.1 (17 oktober 2026)

- Het beheerwachtwoord in `api/config.php` mag nu een hash zijn (uit `password_hash`), zodat het wachtwoord zelf niet meer leesbaar op de server staat. Een gewoon wachtwoord blijft werken.
- `CLAUDE.md` met vaste afspraken over AVG, versleuteling, beveiliging en versienummers.

## 1.0.0 (17 oktober 2026)

Eerste genummerde versie. Bevat:
- Sheet samensteller in Nederlands, Engels en Duits, met afdrukken en PDF.
- Bestellingen: GFC maakt een order aan in het beheer, de klant vult de sheets via een eigen link, slaat tussendoor op en geeft akkoord.
- E-mail bij akkoord, per adres in een eigen taal, met een knop Testmail sturen in het beheer.
- Beveiliging en AVG: versleutelde klantgegevens, automatisch verwijderen na 6 maanden, blokkade na te veel foute inlogpogingen, HTTPS en beveiligingsheaders, privacytekst bij akkoord.
- Ambulance heet nu Rettungsdienst Type 1, 2 en 3.
